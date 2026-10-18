/** Windows parent-side launch and ownership for the private Job runner. */
import { controlPipe } from "./control-spawn.js";
import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { devNull } from 'node:os';
import { loadWin32ProcessBindings, probeCurrentTokenJobSupport, } from '@deepseek-ai/dsh-win32-process';
import { deserializeRunnerError, parseWindowsRunnerResult, } from "./runner-protocol.js";
import { runnerEnvironment, runnerInvocationAvailable, runnerStdio, spawnRunnerInvocation, WINDOWS_RUNNER_SELECTION, } from "./runner-launch.js";
function isWindowsStartCancellationError(error) {
    return error.name === 'Error'
        && error.message === 'subprocess target start was cancelled'
        && error.code === undefined
        && error.syscall === undefined
        && error.path === undefined;
}
/**
 * Re-check the runner entry, bindings, and current Job capability for every spawn.
 * @param internals - optional runner and Win32 capability seams used by tests.
 * @returns whether the Windows native containment path is currently available.
 */
export function probeWindowsJob(internals = {}) {
    try {
        const invocation = internals.runnerInvocation
            ?? (internals.resolveRunnerInvocation ?? spawnRunnerInvocation)();
        if (!(internals.runnerAvailable ?? runnerInvocationAvailable)(invocation))
            return false;
        const api = (internals.loadWin32ProcessBindings ?? loadWin32ProcessBindings)();
        (internals.probeCurrentTokenJobSupport ?? probeCurrentTokenJobSupport)(api);
        return true;
    }
    catch {
        return false;
    }
}
class WindowsJobOwner {
    runner;
    exited;
    directResultType;
    failInfrastructure;
    cancellationReason;
    cancellationReasonSet = false;
    terminationSent = false;
    constructor(runner, exited, directResultType, failInfrastructure) {
        this.runner = runner;
        this.exited = exited;
        this.directResultType = directResultType;
        this.failInfrastructure = failInfrastructure;
        void this.exited.catch(() => { });
    }
    signal(_signal, cancellationReason) {
        if (!this.cancellationReasonSet) {
            this.cancellationReason = cancellationReason;
            this.cancellationReasonSet = true;
        }
        if (this.terminationSent || !this.runner.connected)
            return;
        this.terminationSent = true;
        try {
            this.runner.send?.({ type: 'terminate' }, (error) => {
                if (error === null || this.directResultType() !== undefined)
                    return;
                this.failInfrastructure(error);
                this.terminateForHostExit();
            });
        }
        catch (error) {
            this.failInfrastructure(error);
            this.terminateForHostExit();
        }
    }
    mapStartFailure(failure, serialized) {
        return this.cancellationReasonSet && isWindowsStartCancellationError(serialized)
            ? this.cancellationReason
            : failure;
    }
    async waitForExit() {
        await this.exited;
    }
    terminateForHostExit() {
        try {
            this.runner.kill('SIGKILL');
        }
        catch { /* Host exit continues with other live runners. */ }
    }
}
/**
 * Launch one target through a runner that uniquely owns its Job handle.
 * @param spec - ordinary target request.
 * @param targetEnv - validated complete target environment.
 * @param internals - optional runner launch seams used by tests.
 * @returns direct streams, result, and runner-owned managed range.
 */
export function launchWindowsJob(spec, targetEnv, internals = {}) {
    const invocation = internals.runnerInvocation ?? spawnRunnerInvocation();
    const [command, ...prefix] = invocation;
    const ignoredStdinFd = spec.stdio.stdin === 'ignore' ? openSync(devNull, 'r') : undefined;
    let child;
    try {
        child = (internals.spawn ?? spawn)(command, [
            ...prefix,
            '--',
            ...spec.argv,
        ], {
            cwd: process.cwd(),
            windowsHide: true,
            env: runnerEnvironment(WINDOWS_RUNNER_SELECTION, invocation),
            stdio: runnerStdio(spec, true, ignoredStdinFd ?? 'pipe'),
        });
    }
    finally {
        if (ignoredStdinFd !== undefined)
            closeSync(ignoredStdinFd);
    }
    const targetStdin = child.stdio[4];
    const direct = Promise.withResolvers();
    const rangeExit = Promise.withResolvers();
    let directResultType;
    let runnerSpawned = false;
    let runnerExit;
    let ipcDisconnected = false;
    const failInfrastructure = (error) => {
        direct.reject(error);
        rangeExit.reject(error);
    };
    const settleRange = () => {
        if (!runnerSpawned || runnerExit === undefined)
            return;
        const { exitCode, signal } = runnerExit;
        if (exitCode === 0 && signal === null) {
            if (directResultType !== undefined) {
                rangeExit.resolve();
                return;
            }
            // The private IPC result may arrive after the process-exit notification.
            if (!ipcDisconnected)
                return;
        }
        const status = signal !== null
            ? `signal ${signal}`
            : exitCode === null ? 'without an exit status' : `exit code ${String(exitCode)}`;
        failInfrastructure(new Error(`subprocess-local: Windows Job runner exited with ${status} before proving its managed range empty`));
    };
    const owner = new WindowsJobOwner(child, rangeExit.promise, () => directResultType, failInfrastructure);
    child.on('message', (value) => {
        if (directResultType !== undefined) {
            const error = new Error('subprocess-local: Windows runner emitted more than one direct result');
            failInfrastructure(error);
            owner.terminateForHostExit();
            return;
        }
        let result;
        try {
            result = parseWindowsRunnerResult(value);
        }
        catch (error) {
            failInfrastructure(error);
            owner.terminateForHostExit();
            return;
        }
        directResultType = result.type;
        if (result.type === 'target-exit') {
            direct.resolve({ exitCode: result.exitCode, signal: null });
        }
        else {
            direct.reject(owner.mapStartFailure(deserializeRunnerError(result.error), result.error));
        }
        settleRange();
    });
    child.once('spawn', () => {
        runnerSpawned = true;
        try {
            if (child.send === undefined)
                throw new Error('subprocess-local: Windows runner has no IPC channel');
            child.send({ type: 'start', cwd: spec.cwd, env: targetEnv, ...spec.stdio.control === undefined ? {} : { control: spec.stdio.control } }, (error) => {
                if (error === null)
                    return;
                failInfrastructure(error);
                owner.terminateForHostExit();
            });
        }
        catch (error) {
            failInfrastructure(error);
            owner.terminateForHostExit();
        }
    });
    child.once('error', (error) => {
        if (!runnerSpawned) {
            direct.reject(error);
            rangeExit.resolve();
            return;
        }
        failInfrastructure(error);
    });
    child.once('exit', (exitCode, signal) => {
        runnerExit = { exitCode, signal };
        settleRange();
    });
    child.once('disconnect', () => {
        ipcDisconnected = true;
        settleRange();
    });
    return {
        stdin: spec.stdio.stdin === 'ignore' ? null : targetStdin,
        stdout: child.stdio[5],
        stderr: child.stdio[6],
        control: controlPipe(child, spec.stdio.control),
        direct: direct.promise,
        owner,
    };
}
//# sourceMappingURL=windows-job.js.map