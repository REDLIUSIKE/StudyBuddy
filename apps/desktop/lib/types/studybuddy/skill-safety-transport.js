/** Main-owned scanner process orchestration; caller must supply verified packaged paths. */
import { spawn, execFile } from 'node:child_process';
import { TextDecoder } from 'node:util';
import { isAbsolute, toNamespacedPath } from 'node:path';
import { z } from 'zod';
const message = z.object({ role: z.enum(['system', 'user']), content: z.string().max(4 * 1024 * 1024) }).strict();
const judgeFrame = z.object({ kind: z.literal('judge'), id: z.string().regex(/^[1-9][0-9]{0,3}$/), messages: z.array(message).min(1).max(20), maxTokens: z.number().int().positive().max(131072) }).strict();
const resultSchema = z.object({ findings: z.array(z.record(z.string(), z.unknown())).max(10000), analyzers_used: z.array(z.string()).max(32), analyzers_failed: z.array(z.unknown()).max(10000).optional() }).passthrough();
/**
 * Run one trusted worker with bounded, keyless private frames. Result publication waits for process exit.
 * @param input - Verified executable/resources, immutable source and per-call native judge.
 * @returns The original upstream JSON; high-severity exit 1 is a verdict, not a process crash.
 * @throws On cancellation, malformed frames, timeout or unknown exit; stops the actual process tree first.
 */
export async function runSkillScannerWorker(input) {
    if (input.signal.aborted)
        throw Error('SKILL_SAFETY_CANCELLED');
    // Python/YARA must also work when a verified cache path exceeds MAX_PATH; do not change OS policy.
    const nativePath = (path) => process.platform === 'win32' && isAbsolute(path) ? toNamespacedPath(path) : path;
    return new Promise((accept, reject) => {
        // Python file loading accepts Win32 namespaces; Node's ESM URL loader does not (also used by pipe fixtures).
        const child = spawn(input.executable, input.args.map(arg => arg.endsWith('.py') ? nativePath(arg) : arg), { cwd: input.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
            env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
                PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', LITELLM_LOCAL_MODEL_COST_MAP: 'True', DO_NOT_TRACK: '1' } });
        let failure, result, buffer = '', total = 0, closed = false;
        let queue = Promise.resolve();
        const seen = new Set(), decoder = new TextDecoder('utf-8', { fatal: true });
        const stop = (error) => {
            failure ??= error;
            if (closed)
                return;
            child.stdin.destroy();
            // Cisco's CEL helper is a child; killing only Python would leave that owned process behind on Windows.
            if (process.platform === 'win32' && child.pid)
                execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => { });
            else
                child.kill('SIGTERM');
        };
        const cancel = () => stop(Error('SKILL_SAFETY_CANCELLED'));
        input.signal.addEventListener('abort', cancel, { once: true });
        const timeout = setTimeout(() => stop(Error('SKILL_SAFETY_SCANNER_FAILED')), 10 * 60 * 1000);
        child.once('error', () => stop(Error('SKILL_SAFETY_SCANNER_FAILED')));
        child.stdin.on('error', () => { if (!closed)
            stop(Error('SKILL_SAFETY_SCANNER_FAILED')); });
        child.stderr.on('data', () => { });
        const consume = async (line) => {
            if (failure)
                return;
            const frame = JSON.parse(line);
            if (frame === null || typeof frame !== 'object' || !('kind' in frame))
                throw Error('SKILL_SAFETY_SCANNER_INVALID');
            if (frame.kind === 'judge') {
                const request = judgeFrame.parse(frame);
                if (result || seen.has(request.id) || seen.size >= 128)
                    throw Error('SKILL_SAFETY_SCANNER_INVALID');
                seen.add(request.id);
                const response = await input.judge({ messages: request.messages, maxTokens: request.maxTokens }, request.id);
                if (input.signal.aborted || failure || closed)
                    return;
                const bytes = JSON.stringify({ kind: 'judge-result', id: request.id, value: response }) + '\n';
                if (Buffer.byteLength(bytes) > 8 * 1024 * 1024)
                    throw Error('SKILL_SAFETY_SCANNER_INVALID');
                child.stdin.write(bytes);
            }
            else if (frame.kind === 'result') {
                if (result || Object.keys(frame).sort().join(',') !== 'kind,value' || !('value' in frame))
                    throw Error('SKILL_SAFETY_SCANNER_INVALID');
                result = resultSchema.parse(frame.value);
            }
            else if (frame.kind !== 'ready' || Object.keys(frame).join(',') !== 'kind')
                throw Error('SKILL_SAFETY_SCANNER_INVALID');
        };
        child.stdout.on('data', (bytes) => {
            try {
                total += bytes.length;
                if (total > 64 * 1024 * 1024)
                    throw Error('SKILL_SAFETY_SCANNER_INVALID');
                buffer += decoder.decode(bytes, { stream: true });
                if (Buffer.byteLength(buffer) > 8 * 1024 * 1024)
                    throw Error('SKILL_SAFETY_SCANNER_INVALID');
                let index;
                while ((index = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, index).replace(/\r$/, '');
                    buffer = buffer.slice(index + 1);
                    if (!line)
                        throw Error('SKILL_SAFETY_SCANNER_INVALID');
                    queue = queue.then(() => consume(line)).catch(() => stop(Error('SKILL_SAFETY_SCANNER_INVALID')));
                }
            }
            catch {
                stop(Error('SKILL_SAFETY_SCANNER_INVALID'));
            }
        });
        child.once('close', (code) => {
            closed = true;
            clearTimeout(timeout);
            input.signal.removeEventListener('abort', cancel);
            // Process settlement is independent of a stuck upstream callback. Its owner keeps the unknown-call receipt.
            if (input.signal.aborted || failure) {
                reject(input.signal.aborted ? Error('SKILL_SAFETY_CANCELLED') : failure);
                return;
            }
            void queue.then(() => {
                try {
                    buffer += decoder.decode();
                }
                catch {
                    failure ??= Error('SKILL_SAFETY_SCANNER_INVALID');
                }
                if (input.signal.aborted)
                    failure = Error('SKILL_SAFETY_CANCELLED');
                if (buffer.trim())
                    failure ??= Error('SKILL_SAFETY_SCANNER_INVALID');
                const high = result?.findings.some(finding => finding.severity === 'HIGH' || finding.severity === 'CRITICAL');
                if (failure)
                    reject(failure);
                else if (!result || code !== 0 && !(code === 1 && high))
                    reject(Error('SKILL_SAFETY_SCANNER_FAILED'));
                else
                    accept(result);
            }, () => reject(Error('SKILL_SAFETY_SCANNER_FAILED')));
        });
        child.stdin.write(JSON.stringify({ kind: 'scan', ...input.input, directory: nativePath(input.input.directory) }) + '\n');
        if (input.signal.aborted)
            cancel();
    });
}
//# sourceMappingURL=skill-safety-transport.js.map