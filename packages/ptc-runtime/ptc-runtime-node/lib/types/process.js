import { JsonChannel } from "./channel.js";
import { runProgram } from "./bootstrap.js";
import { STARTUP_ENVIRONMENT_NAMES } from "./environment.js";
/**
 * Run one host-supplied program after the control handshake.
 * @param stream - Inherited, already-adopted control endpoint.
 * @param maxMessageBytes - Host-validated maximum frame and queued-write bytes.
 * @param processState - Environment, output streams and exit status of this Node child.
 * @returns After control output flushes and host shutdown is observed, or transport failure closes the channel.
 */
export async function runNodeMain(stream, maxMessageBytes, processState) {
    if (!Number.isSafeInteger(maxMessageBytes) || maxMessageBytes <= 0 || maxMessageBytes > 0xffff_ffff)
        throw new Error('invalid control message limit');
    for (const key of Object.keys(processState.env)) {
        if (!STARTUP_ENVIRONMENT_NAMES.has(key.toUpperCase()))
            Reflect.deleteProperty(processState.env, key);
    }
    // Windows native process creation still needs SystemRoot in the OS environment.
    processState.env = Object.create(null);
    const boot = Promise.withResolvers();
    const listeners = [];
    let started = false;
    let failed = false;
    let terminalSent = false;
    const hostClosed = Promise.withResolvers();
    const onClose = () => { hostClosed.resolve(); };
    stream.once('close', onClose);
    const channel = new JsonChannel(stream, maxMessageBytes, (raw) => {
        if (!started) {
            started = true;
            if (typeof raw !== 'object' || raw === null || raw.type !== 'boot') {
                boot.reject(new Error('expected program boot frame'));
                return;
            }
            boot.resolve(raw.data);
            return;
        }
        if (terminalSent)
            return;
        for (const listener of listeners)
            listener(raw);
    }, (error, kind) => {
        if (!terminalSent || kind === 'protocol') {
            failed = true;
            boot.reject(error);
            channel.close();
            processState.exitCode = 1;
        }
        hostClosed.resolve();
    });
    const pending = new Set();
    const send = (message) => {
        if (terminalSent)
            return;
        if (message.type === 'done')
            terminalSent = true;
        const task = channel.send(message).catch(() => {
            failed = true;
            channel.close();
            processState.exitCode = 1;
            hostClosed.resolve();
        }).finally(() => { pending.delete(task); });
        pending.add(task);
    };
    try {
        await channel.send({ type: 'ready' });
        const data = await boot.promise;
        await runProgram({
            postMessage: send,
            on: (_event, listener) => { listeners.push(listener); },
        }, data, { stdout: processState.stdout, stderr: processState.stderr });
        while (pending.size > 0)
            await Promise.all(pending);
        await channel.drain();
        // Host binding replies can race the terminal frame; the host owns channel shutdown.
        await hostClosed.promise;
    }
    finally {
        stream.off('close', onClose);
        channel.close();
        // Transport callbacks can set failed while the awaited program executes.
        // oxlint-disable-next-line typescript/no-unnecessary-condition
        if (failed)
            processState.exitCode = 1;
    }
}
//# sourceMappingURL=process.js.map