/**
 * Process plumbing for the local subprocess service: ordinary process launch
 * with per-stream stdio dispositions, tail-keep collection with spill
 * files, provider-owned range signalling, and common termination scheduling.
 * POSIX owners stage TERM before KILL; Windows owners terminate immediately.
 * This layer reacts to an abort signal; callers own deadlines, teardown
 * ladders, and cause classification.
 * @module dsh-subprocess-local/spawn
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleepMs } from 'node:timers/promises';
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess';
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout';
import { waitWithAbort } from "./managed-owner.js";
import { controlEnvironment, controlPipe } from "./control-spawn.js";
import { SUBPROCESS_CONTROL_FD } from '@deepseek-ai/dsh-subprocess/control';
import { linuxProcessGroupHasLiveMembers } from "./process-inspector.js";
import { OutputCollector, prepareManagedProcessBinding } from "./output.js";
/**
 * Build a child environment: explicit caller entries override the scrubbed
 * parent base using the target platform's environment-key semantics. A string
 * deliberately restores or overrides an entry; an explicit `undefined`
 * tombstone removes an ordinary ambient entry.
 * @param extra - explicit caller entries and tombstones, merged after the scrub.
 * @returns the environment to hand to `spawn` for the child process.
 */
export function childEnv(extra) {
    const env = scrubbedParentEnv();
    if (process.platform !== 'win32')
        return { ...env, ...extra };
    let entries = Object.entries(env);
    for (const [key, value] of Object.entries(extra ?? {})) {
        const normalized = key.toUpperCase();
        entries = entries.filter(([inherited]) => inherited.toUpperCase() !== normalized);
        entries.push([key, value]);
    }
    return Object.fromEntries(entries);
}
/**
 * Liveness-poll cadence for tree-exit waits. The timer stays ref'd: an
 * awaited teardown must keep the event loop alive until the tree really
 * exits, or the parent can exit while claiming quiescence and orphan the
 * survivors it promised to reap.
 */
function sleepTick() {
    return sleepMs(15);
}
/**
 * Send `sig` to a detached POSIX process group. Never throws: delivery races
 * process exit and may run in a timer callback, so failures are contained and
 * a missing pid is a no-op.
 * @param pid - the group leader's pid, when the spawn published one.
 * @param sig - the signal to deliver to the whole group.
 */
export function killGroup(pid, sig) {
    if (pid === undefined)
        return;
    try {
        process.kill(-pid, sig);
    }
    catch {
        // Swallow: see contract above.
    }
}
/**
 * Terminate one Windows process tree with `taskkill /T /F`. Contained like
 * POSIX group signalling — delivery races tree exit, so an absent tree, a
 * nonzero status, or a missing taskkill binary must not break idempotent
 * teardown.
 * @param pid - root process id, when the spawn published one.
 */
export function taskkillProcessTree(pid) {
    if (pid === undefined || pid <= 0)
        return;
    // Outcome deliberately unchecked: an already-absent tree (status 128), exit
    // races, and a missing taskkill binary (spawnSync reports, never throws) are
    // as tolerable here as ESRCH is for a POSIX group signal.
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
    });
}
/**
 * Signal a detached process tree with platform-correct semantics: POSIX
 * signals the negative process-group id and falls back to the direct child
 * when the group is gone; Windows terminates the tree via taskkill (any
 * signal value force-terminates — Node maps signals to TerminateProcess).
 */
function signalTree(platform, pid, sig, child, taskkill) {
    /* v8 ignore next -- kill/terminate gate on treeAlive(), which is false without a pid; this guard protects direct callers only. */
    if (pid === undefined)
        return;
    if (platform === 'win32') {
        taskkill(pid);
        return;
    }
    try {
        process.kill(-pid, sig);
    }
    catch {
        /* v8 ignore start -- the fallback needs a live child whose group signal fails
           (EPERM-style), which POSIX CI cannot stage; the swallow keeps teardown idempotent. */
        try {
            child.kill(sig);
        }
        catch {
            // The direct child already exited; teardown remains idempotent.
        }
        /* v8 ignore stop */
    }
}
/**
 * Validate the synchronous portion of one ordinary spawn request.
 * @param spec - exact target request.
 * @throws when grace, cancellation, or argv is invalid before launch.
 */
export function validateSubprocessSpec(spec) {
    if (!Number.isFinite(spec.graceMs) || spec.graceMs <= 0 || spec.graceMs > MAX_TIMER_DELAY_MS) {
        throw new Error(`subprocess graceMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
    }
    if (spec.signal?.aborted) {
        let reason = 'aborted';
        try {
            reason = String(spec.signal.reason ?? reason);
        }
        catch {
            // Arbitrary caller-owned reasons cannot escape the stable Error boundary.
        }
        throw new Error(`aborted before spawn: ${reason}`);
    }
    const [program] = spec.argv;
    if (program === undefined || program.length === 0) {
        throw new Error('invalid argv: expected a non-empty program name at argv[0]');
    }
}
function directChildResult(child) {
    return new Promise((resolve, reject) => {
        let completed = false;
        child.once('error', (error) => {
            /* v8 ignore next -- ChildProcess may report a later operational error after its
               terminal exit event; the first terminal event owns the result. */
            if (completed)
                return;
            completed = true;
            reject(error);
        });
        child.once('exit', (exitCode, signal) => {
            /* v8 ignore next -- a spawn/kill error may be followed by exit; a Promise can publish only the first terminal event. */
            if (completed)
                return;
            completed = true;
            resolve({ exitCode, signal });
        });
    });
}
function fallbackOwner(platform, pid, child, taskkill, linuxGroupHasLiveMembers, direct) {
    let stopped = false;
    let directSettled = false;
    let observation;
    void direct.then(() => { directSettled = true; }, () => { directSettled = true; });
    const alive = () => {
        if (stopped || pid === undefined)
            return false;
        if (platform === 'win32')
            return child.exitCode === null && child.signalCode === null;
        try {
            process.kill(-pid, 0);
            if (directSettled && platform === 'linux' && linuxGroupHasLiveMembers(pid) === false)
                return false;
            return true;
        }
        catch (error) {
            const code = error.code;
            if (code === 'ESRCH')
                return false;
            /* v8 ignore start -- EPERM and non-POSIX negative-pid failures are platform defenses. */
            if (code === 'EPERM')
                return true;
            return child.exitCode === null && child.signalCode === null;
            /* v8 ignore stop */
        }
    };
    return {
        signal: (signal) => {
            if (!alive()) {
                stopped = true;
                return;
            }
            signalTree(platform, pid, signal, child, taskkill);
        },
        waitForExit: async () => {
            /* v8 ignore next -- bindManagedProcess memoizes this owner wait; the guard only
               protects direct internal re-entry after signal() observed absence. */
            if (stopped)
                return;
            observation ??= (async () => {
                while (alive())
                    await sleepTick();
                stopped = true;
            })();
            await observation;
        },
        terminateForHostExit: () => {
            if (stopped)
                return;
            signalTree(platform, pid, 'SIGKILL', child, taskkill);
        },
    };
}
/**
 * Bind platform launch facts to the existing stdio, outcome, abort, and termination lifecycle.
 * @param spec - fully resolved argv, cwd, stdio, grace, cancellation, environment.
 * @param launch - platform streams, direct outcome, and managed-range owner.
 * @param internals - spill-directory override and spill failure reporter.
 * @returns live subprocess handle.
 */
export function bindManagedProcess(spec, launch, internals = {}) {
    const { spillDir, onSpillFailure } = prepareManagedProcessBinding(internals);
    const { stdin, stdout, stderr } = launch;
    const isCollect = (mode) => mode !== 'pipe' && mode !== 'inherit';
    const outMode = spec.stdio.stdout;
    const errMode = spec.stdio.stderr;
    const stdinMode = spec.stdio.stdin;
    const collectStream = (mode, stream, label) => {
        if (!isCollect(mode) || stream === null)
            return undefined;
        const collector = new OutputCollector(mode.maxBytes, label, mode.spill === undefined ? undefined : { maxBytes: mode.spill.maxBytes, dir: spillDir, onFailure: onSpillFailure });
        stream.on('data', (chunk) => { collector.push(chunk); });
        return collector;
    };
    const stdoutCollector = collectStream(outMode, stdout, 'stdout');
    const stderrCollector = collectStream(errMode, stderr, 'stderr');
    const observeOutputStream = (mode, stream) => {
        if (mode === 'inherit' || stream === null || stream.readableEnded || stream.destroyed)
            return undefined;
        return new Promise((resolve) => {
            const settle = () => {
                stream.off('end', settle);
                stream.off('close', settle);
                stream.off('error', settle);
                resolve();
            };
            stream.once('end', settle);
            stream.once('close', settle);
            stream.once('error', settle);
        });
    };
    const stdoutClosed = observeOutputStream(outMode, stdout);
    const stderrClosed = observeOutputStream(errMode, stderr);
    const outputStreamsClosed = Promise.all([stdoutClosed, stderrClosed]);
    const stopCollectors = () => {
        if (stdoutCollector !== undefined)
            stdout?.destroy();
        if (stderrCollector !== undefined)
            stderr?.destroy();
        stdoutCollector?.seal();
        stderrCollector?.seal();
    };
    let graceTimer;
    let terminationStarted = false;
    let rangeExitObserved = false;
    let rangeExitObservation;
    let settled = false;
    const scheduleOwnerCleanup = () => {
        if (launch.owner.cleanup === undefined)
            return false;
        queueMicrotask(() => { void done.finally(() => { launch.owner.cleanup?.(); }).catch(() => { }); });
        return true;
    };
    /**
     * Start or reuse the handle's managed-range exit observer. A failed read
     * before direct settlement can be retried. Once direct settlement permits
     * cleanup, retain a failed observation because removing its private evidence
     * must not turn a later wait into a false success. The first confirmed
     * absence is the permanent no-more-signals boundary and cancels pending
     * escalation before stale identity can be used.
     */
    const observeRangeExit = () => {
        rangeExitObservation ??= (async () => {
            await launch.owner.waitForExit();
            rangeExitObserved = true;
            if (graceTimer !== undefined)
                clearTimeout(graceTimer);
            graceTimer = undefined;
            spec.signal?.removeEventListener('abort', onAbort);
            scheduleOwnerCleanup();
        })().catch((error) => {
            if (!settled || !scheduleOwnerCleanup())
                rangeExitObservation = undefined;
            throw error;
        });
        return rangeExitObservation;
    };
    const kill = (sig, cancellationReason) => {
        if (rangeExitObserved)
            return;
        launch.owner.signal(sig, cancellationReason);
    };
    const terminateWithReason = (cancellationReason) => {
        if (rangeExitObserved || terminationStarted)
            return;
        terminationStarted = true;
        // Keep the shared observation rejection available to waitForExit() without
        // leaking an unhandled rejection when a caller only invokes terminate().
        void observeRangeExit().catch(() => { });
        kill('SIGTERM', cancellationReason);
        graceTimer = setTimeout(() => {
            graceTimer = undefined;
            kill('SIGKILL');
        }, spec.graceMs);
    };
    const terminate = () => {
        terminateWithReason(new Error('subprocess terminated before target start'));
    };
    const terminateForHostExit = () => {
        launch.owner.terminateForHostExit();
    };
    // The caller owns timeout classification; this layer only reacts to abort.
    const onAbort = () => { terminateWithReason(spec.signal?.reason); };
    spec.signal?.addEventListener('abort', onAbort, { once: true });
    // Batch stdin is written and closed up front; process exit and captured
    // output remain authoritative, so write errors (EPIPE) are best-effort.
    if (typeof stdinMode === 'object' && stdin !== null) {
        stdin.on('error', () => { });
        stdin.end(stdinMode.data);
    }
    const done = new Promise((resolve, reject) => {
        let pipeDrainTimer;
        const settle = (outcome) => {
            if (settled)
                return;
            settled = true;
            // Only harness-collected pipes are force-closed at the drain boundary;
            // a 'pipe'-mode stream belongs to the caller and closes with the child.
            stopCollectors();
            cleanup();
            resolve(outcome);
        };
        const fail = (error) => {
            settled = true;
            terminate();
            stopCollectors();
            cleanup();
            // Preserve the exact parent-local AbortSignal reason, including null or undefined.
            // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Exact cancellation reason is the contract.
            reject(error);
        };
        launch.direct.then((outcome) => {
            if (stdoutClosed === undefined && stderrClosed === undefined) {
                settle(outcome);
                return;
            }
            pipeDrainTimer = setTimeout(() => { settle(outcome); }, spec.graceMs);
            void outputStreamsClosed.then(() => { settle(outcome); });
        }, fail);
        function cleanup() {
            // graceTimer deliberately NOT cleared: forced termination must still
            // reach range survivors after the spawned command settles.
            if (pipeDrainTimer !== undefined)
                clearTimeout(pipeDrainTimer);
        }
    });
    const waitForExit = async (signal) => {
        if (rangeExitObserved)
            return true;
        return waitWithAbort(observeRangeExit(), signal);
    };
    return {
        /* v8 ignore start -- pipe-mode streams exist on every conforming launch;
           the null-coalesces guard an internal adapter defect only. */
        stdin: stdinMode === 'pipe' ? stdin ?? undefined : undefined,
        stdout: outMode === 'pipe' ? stdout ?? undefined : undefined,
        stderr: errMode === 'pipe' ? stderr ?? undefined : undefined,
        control: launch.control,
        /* v8 ignore stop */
        collected: {
            ...stdoutCollector !== undefined ? { stdout: stdoutCollector } : {},
            ...stderrCollector !== undefined ? { stderr: stderrCollector } : {},
        },
        done,
        terminate,
        terminateForHostExit,
        waitForExit,
    };
}
/**
 * Spawn one detached PGID/taskkill fallback and bind the common lifecycle.
 * @param spec - fully resolved argv, cwd, stdio, grace, cancellation, environment.
 * @param internals - test-only spill-directory, platform, and taskkill overrides.
 * @returns live subprocess handle.
 */
export function spawnSubprocess(spec, internals = {}) {
    const binding = prepareManagedProcessBinding(internals);
    const platform = internals.platform ?? process.platform;
    const [program, ...args] = spec.argv;
    const stdio = [
        spec.stdio.stdin === 'ignore' ? 'ignore' : 'pipe',
        spec.stdio.stdout === 'inherit' ? 'inherit' : 'pipe',
        spec.stdio.stderr === 'inherit' ? 'inherit' : 'pipe',
    ];
    if (spec.stdio.control === 'pipe') {
        while (stdio.length < SUBPROCESS_CONTROL_FD)
            stdio.push('ignore');
        stdio.push('overlapped');
    }
    const child = (internals.spawn ?? spawn)(program, args, {
        cwd: spec.cwd,
        env: controlEnvironment(childEnv(spec.env), spec.stdio.control),
        stdio,
        detached: platform !== 'win32',
        windowsHide: platform === 'win32',
    });
    const direct = directChildResult(child);
    const pid = child.pid;
    const owner = fallbackOwner(platform, pid, child, internals.taskkill ?? taskkillProcessTree, internals.linuxProcessGroupHasLiveMembers ?? linuxProcessGroupHasLiveMembers, direct);
    return bindManagedProcess(spec, {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        control: controlPipe(child, spec.stdio.control),
        direct,
        owner,
    }, binding);
}
//# sourceMappingURL=spawn.js.map