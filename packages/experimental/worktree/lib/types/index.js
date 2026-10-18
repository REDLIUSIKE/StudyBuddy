/** Creates a new Git branch and checkout, then changes the calling Session's working directory. */
import { randomUUID } from 'node:crypto';
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout';
import { PREPARE_DIRECTORY } from "./directory.js";
import { runCommand } from "./process.js";
/** Reject path traversal independently of Git's branch-name grammar. */
function relativePath(value) {
    return value.length > 0 && !value.includes('\\') && !value.includes(':')
        && value.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');
}
/** Creates retained Git worktrees under the mounted filesystem and sandbox providers. */
export class WorktreeService extends Service {
    static inject = ['workingDirectory', 'fs', 'subprocess', 'sandbox', 'sandboxPolicy'];
    static Config = z.object({
        directory: z.string().default('.agents/worktrees'),
        namePrefix: z.string().default('worktree-'),
        gitCommand: z.string().default('git'),
        nodeCommand: z.string().default('node'),
        timeoutMs: z.number().default(60_000),
        graceMs: z.number().default(3_000),
        maxOutputBytes: z.number().default(65_536),
    });
    config;
    lifetime = new AbortController();
    pending = new Set();
    constructor(ctx, config) {
        super(ctx, 'worktrees');
        this.config = config;
        if (!relativePath(this.config.directory))
            throw new Error('worktree: directory must be a relative directory without dot segments');
        if (!relativePath(`${this.config.namePrefix}name`) || this.config.namePrefix.startsWith('-')) {
            throw new Error('worktree: namePrefix must produce a relative branch name');
        }
        for (const key of ['gitCommand', 'nodeCommand']) {
            if (this.config[key].trim().length === 0)
                throw new Error(`worktree: ${key} must not be empty`);
        }
        for (const key of ['timeoutMs', 'graceMs', 'maxOutputBytes']) {
            const value = this.config[key];
            if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) {
                throw new Error(`worktree: ${key} must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`);
            }
        }
        ctx.effect(() => async () => {
            this.lifetime.abort(new Error('worktree service disposed'));
            await Promise.allSettled(this.pending);
        });
    }
    /**
     * Create a fresh branch and checkout at a pinned local revision, then enter it.
     * Existing branches or checkout paths fail. Uncommitted files stay in the source checkout.
     * Checkout disables configured clean, smudge, and process filters without changing Git config.
     * Repository-local replacement refs still apply; baseCommit reports the resolved object name.
     * The new checkout becomes current only after Git setup succeeds. Failures may retain newly
     * allocated Git/filesystem artifacts; no branch or checkout is removed automatically.
     * @param agent - caller whose current directory selects the source repository and file policy.
     * @param request - optional new name and local revision; defaults are generated name and HEAD.
     * @param signal - cancellation of lookup, creation, and working-directory publication.
     * @returns canonical checkout path, branch name, pinned commit, and source repository root.
     */
    async create(agent, request = {}, signal) {
        const operationSignal = signal === undefined ? this.lifetime.signal : AbortSignal.any([this.lifetime.signal, signal]);
        operationSignal.throwIfAborted();
        const operation = this.createCheckout(agent, this.resolve(request), operationSignal);
        this.pending.add(operation);
        try {
            return await operation;
        }
        finally {
            this.pending.delete(operation);
        }
    }
    resolve(request) {
        const branch = request.name ?? `${this.config.namePrefix}${randomUUID()}`;
        if (!relativePath(branch) || branch.startsWith('-'))
            throw new Error('worktree name must be a relative Git branch name');
        const revision = request.from ?? 'HEAD';
        if (revision.length === 0)
            throw new Error('worktree from must name a local commit, branch, or tag');
        return { branch, revision };
    }
    async createCheckout(agent, { branch, revision }, signal) {
        const cwd = await this.ctx.workingDirectory.ensure(agent, signal);
        const policy = this.ctx.sandboxPolicy.resolve({ session: agent.session });
        const run = (directory, args, allowedExitCodes, env) => runCommand(this.ctx, this.config, policy, directory, [this.config.gitCommand, '--no-lazy-fetch', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], signal, allowedExitCodes, env);
        await run(cwd, ['check-ref-format', `refs/heads/${branch}`]);
        const rootOutput = await run(cwd, ['rev-parse', '--show-toplevel']);
        const rootTarget = await this.ctx.fs.resolve(rootOutput.stdout.replace(/\r?\n$/, ''), { cwd, signal });
        const repositoryRoot = this.ctx.fs.processPath(rootTarget);
        const base = await run(repositoryRoot, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]);
        const baseCommit = base.stdout.trim();
        const existing = await run(repositoryRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], [0, 1]);
        if (existing.exitCode === 0)
            throw new Error(`worktree branch already exists: ${branch}`);
        const pool = await this.ctx.fs.resolve(this.config.directory, { cwd: repositoryRoot, signal });
        const poolPath = this.ctx.fs.processPath(pool);
        const destination = await this.ctx.fs.resolve(branch, { cwd: poolPath, signal });
        const path = this.ctx.fs.processPath(destination);
        if (await this.ctx.fs.lstat(path, undefined, signal) !== undefined)
            throw new Error(`worktree path already exists: ${path}`);
        try {
            await runCommand(this.ctx, this.config, policy, repositoryRoot, [this.config.nodeCommand, '--input-type=module', '-e', PREPARE_DIRECTORY, poolPath, path], signal);
            await run(repositoryRoot, ['--work-tree', repositoryRoot, 'worktree', 'add', '--no-checkout', '-b', branch, '--', path, baseCommit]);
            const configured = await run(path, ['config', '--null', '--name-only', '--get-regexp', '^filter\\.'], [0, 1]);
            const drivers = new Set();
            for (const key of configured.stdout.split('\0')) {
                const separator = key.lastIndexOf('.');
                if (separator > 'filter.'.length && ['clean', 'smudge', 'process', 'required'].includes(key.slice(separator + 1))) {
                    drivers.add(key.slice('filter.'.length, separator));
                }
            }
            const overrides = { GIT_CONFIG_COUNT: String(drivers.size * 4) };
            let index = 0;
            for (const driver of drivers) {
                for (const attribute of ['clean', 'smudge', 'process', 'required']) {
                    overrides[`GIT_CONFIG_KEY_${index}`] = `filter.${driver}.${attribute}`;
                    overrides[`GIT_CONFIG_VALUE_${index}`] = attribute === 'required' ? 'false' : '';
                    index++;
                }
            }
            await run(path, ['--work-tree', path, 'reset', '--hard', '--no-recurse-submodules', baseCommit], undefined, overrides);
            const canonicalPath = await this.ctx.workingDirectory.set(agent, path, signal);
            return { path: canonicalPath, branch, baseCommit, repositoryRoot };
        }
        catch (error) {
            throw new Error(`Could not finish worktree ${branch} at ${path}. Any created checkout and branch are retained. ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }
}
export default WorktreeService;
//# sourceMappingURL=index.js.map