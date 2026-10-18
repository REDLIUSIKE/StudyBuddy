/** StudyBuddy HTTP contracts; this module runs only in the desktop main process. */
import { createHash, randomBytes } from 'node:crypto';
import { parseDesktopAuthPollResponse, parseDesktopAuthStartResponse } from "./contracts/browser-auth.js";
const API = 'https://guijitongzhuo.com/api/v1';
class HttpFailure extends Error {
    status;
    constructor(status) {
        super('StudyBuddy request failed');
        this.status = status;
    }
}
class NetworkFailure extends Error {
}
/** One main-process authorization owner, with generation checks for late responses. */
export class StudyBuddyAuth {
    deps;
    state = { phase: 'signed-out' };
    #generation = 0;
    #scopeGeneration = 0;
    #scope;
    #attempt;
    #accessToken;
    #stopTimer;
    #polling;
    #restoring;
    #committing;
    #storage = Promise.resolve();
    #logoutSession;
    #logoutConfirmed;
    #logoutOperation;
    #logoutRecoveryChecked = false;
    #logoutRecoveryPending = false;
    #disposed = false;
    #listeners = new Set();
    constructor(deps) {
        this.deps = deps;
    }
    subscribe(listener) {
        this.#listeners.add(listener);
        return () => { this.#listeners.delete(listener); };
    }
    #publish(state) {
        if (state.phase === 'authenticated' && state.account !== undefined) {
            if (this.#scope?.accountId !== state.account.id)
                this.#scope = { accountId: state.account.id, generation: ++this.#scopeGeneration };
        }
        else if (this.#scope !== undefined) {
            this.#scope = undefined;
            ++this.#scopeGeneration;
        }
        this.state = state;
        for (const listener of this.#listeners)
            listener(state);
        return state;
    }
    /** Main-only login lifecycle. Refreshing an access credential preserves this scope. */
    scope() { return this.#scope ?? null; }
    /** Run with the current private access credential and reject results from a replaced login. */
    async withSession(run) {
        const scope = this.#scope, accessToken = this.#accessToken;
        if (scope === undefined || accessToken === undefined || this.state.phase !== 'authenticated' || this.#logoutSession !== undefined || this.#logoutRecoveryPending || this.#disposed)
            throw new Error('AUTH_REQUIRED');
        const result = await run({ scope, accessToken });
        if (this.#scope !== scope || this.state.phase !== 'authenticated')
            throw new Error('ACCOUNT_SCOPE_CHANGED');
        return result;
    }
    async #request(path, body, bearer) {
        let response;
        try {
            response = await this.deps.fetch(`${API}${path}`, {
                method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
                headers: { 'Accept': 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` }) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        }
        catch {
            throw new NetworkFailure('StudyBuddy network unavailable');
        }
        if (!response.ok)
            throw new HttpFailure(response.status);
        return response;
    }
    async #account(access) {
        const value = await (await this.#request('/me', undefined, access)).json();
        if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string'
            || !/^[0-9a-f-]{36}$/u.test(value.id) || !('status' in value) || value.status !== 'active')
            throw new Error('Invalid StudyBuddy account');
        const label = 'phoneMasked' in value && typeof value.phoneMasked === 'string' ? value.phoneMasked
            : 'emailMasked' in value && typeof value.emailMasked === 'string' ? value.emailMasked : 'StudyBuddy 用户';
        return { id: value.id, label: label.slice(0, 120) };
    }
    #later(callback, delay) { this.#stopTimer?.(); this.#stopTimer = this.deps.schedule(callback, delay); }
    async #write(token, generation) {
        const operation = this.#storage.then(async () => {
            if (generation !== this.#generation)
                return false;
            await this.deps.vault.write(token);
            if (generation !== this.#generation) {
                await this.deps.vault.clear();
                return false;
            }
            return true;
        });
        this.#storage = operation.then(() => undefined, () => undefined);
        return operation;
    }
    async #clear(generation) {
        const operation = this.#storage.then(async () => {
            if (generation !== undefined && (generation !== this.#generation || this.#disposed))
                return;
            await this.deps.vault.clear();
        });
        this.#storage = operation.catch(() => undefined);
        await operation;
    }
    async #clearMatching(token) {
        const operation = this.#storage.then(async () => {
            if (await this.deps.vault.read() === token)
                await this.deps.vault.clear();
        });
        this.#storage = operation.catch(() => undefined);
        await operation;
    }
    #refreshLater() { this.#later(() => { void this.restore(); }, 14 * 60 * 1000); }
    restore() {
        if (this.#logoutSession !== undefined || this.#logoutRecoveryPending || this.#disposed)
            return Promise.resolve(this.state);
        this.#restoring ??= this.#restore().finally(() => { this.#restoring = undefined; });
        return this.#restoring;
    }
    async #restore(forLogout = false) {
        const generation = ++this.#generation;
        this.#stopTimer?.();
        this.#stopTimer = undefined;
        if (this.state.phase !== 'authenticated')
            this.#publish({ phase: 'starting', ...(forLogout ? { logoutPending: true } : {}), message: '正在恢复登录…' });
        try {
            if (!this.#logoutRecoveryChecked && this.deps.logoutRecovery) {
                const recovered = await this.#recoverLogout(generation);
                if (recovered !== undefined)
                    return recovered;
            }
            if (generation !== this.#generation || this.#disposed)
                return this.state;
            const refreshToken = await this.deps.vault.read();
            if (generation !== this.#generation)
                return this.state;
            if (refreshToken === null)
                return this.#publish({ phase: 'signed-out' });
            const raw = await (await this.#request('/auth/refresh', { refreshToken })).json();
            if (typeof raw !== 'object' || raw === null)
                throw new Error('Invalid refresh response');
            const tokens = parseDesktopAuthPollResponse({ status: 'authenticated', ...raw });
            if (tokens.status !== 'authenticated')
                throw new Error('Invalid refresh response');
            // Persist a rotated refresh credential before account lookup, so a temporary /me outage can recover.
            if (generation !== this.#generation) {
                await this.#request('/auth/logout', {}, tokens.accessToken).catch(() => undefined);
                await this.#clearMatching(refreshToken);
                return this.state;
            }
            this.#committing = { generation, access: tokens.accessToken };
            if (!await this.#write(tokens.refreshToken, generation))
                return this.state;
            const account = await this.#account(tokens.accessToken);
            if (generation !== this.#generation)
                return this.state;
            this.#accessToken = tokens.accessToken;
            if (forLogout) {
                // Resolve the private owner for an explicit retry without exposing an old account page.
                this.#scope = { accountId: account.id, generation: ++this.#scopeGeneration };
                return this.state;
            }
            this.#refreshLater();
            return this.#publish({ phase: 'authenticated', account });
        }
        catch (error) {
            if (generation !== this.#generation)
                return this.state;
            this.#accessToken = undefined;
            if (error instanceof HttpFailure && [401, 403].includes(error.status)) {
                await this.#clear(generation);
                if (generation !== this.#generation || this.#disposed)
                    return this.state;
                return this.#publish({ phase: 'signed-out', message: '登录已失效，请重新登录。' });
            }
            return this.#publish({ phase: 'error', ...(forLogout ? { logoutPending: true } : {}), message: '无法恢复登录，请检查网络后重试。' });
        }
        finally {
            if (this.#committing?.generation === generation)
                this.#committing = undefined;
        }
    }
    async start() {
        if (this.state.startupRecoveryFailed === true && this.#logoutSession === undefined &&
            this.#logoutConfirmed === undefined && !this.#disposed) {
            this.#restoring ??= this.#restore().finally(() => { this.#restoring = undefined; });
            return this.#restoring;
        }
        if (this.#logoutSession !== undefined || this.#logoutRecoveryPending || this.#disposed)
            return this.state;
        if (['starting', 'waiting', 'authenticated'].includes(this.state.phase))
            return this.state;
        if (this.state.phase === 'error') {
            const restored = await this.restore();
            if (restored.phase !== 'signed-out')
                return restored;
        }
        const generation = ++this.#generation;
        this.#publish({ phase: 'starting' });
        const verifier = randomBytes(32).toString('base64url');
        try {
            const result = parseDesktopAuthStartResponse(await (await this.#request('/auth/desktop/start', {
                state: randomBytes(32).toString('base64url'), codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
                codeChallengeMethod: 'S256', clientLabel: 'StudyBuddy Windows',
            })).json());
            if (generation !== this.#generation) {
                await this.#request('/auth/desktop/cancel', { requestId: result.requestId, cancelToken: result.cancelToken });
                return this.state;
            }
            this.#attempt = { ...result, verifier, expiresAt: Date.now() + result.expiresInSeconds * 1000 };
            await this.deps.openBrowser(result.authorizationUrl);
            if (generation !== this.#generation)
                return this.state;
            this.#publish({ phase: 'waiting' });
            this.#later(() => { void this.poll(); }, result.nextPollAfterMs);
            return this.state;
        }
        catch {
            if (generation === this.#generation) {
                const attempt = this.#attempt;
                this.#attempt = undefined;
                if (attempt)
                    await this.#request('/auth/desktop/cancel', { requestId: attempt.requestId, cancelToken: attempt.cancelToken }).catch(() => undefined);
                return this.#publish({ phase: 'error', message: '无法打开或连接官网登录，请重试。' });
            }
            return this.state;
        }
    }
    poll() {
        const generation = this.#generation;
        if (this.#polling?.generation === generation)
            return this.#polling.operation;
        const operation = this.#poll().finally(() => {
            if (this.#polling?.operation === operation)
                this.#polling = undefined;
        });
        this.#polling = { generation, operation };
        return operation;
    }
    async #poll() {
        const attempt = this.#attempt;
        if (attempt === undefined)
            return;
        const generation = this.#generation;
        if (Date.now() >= attempt.expiresAt) {
            this.#attempt = undefined;
            this.#publish({ phase: 'error', message: '登录请求已过期，请重试。' });
            return;
        }
        try {
            const tokens = parseDesktopAuthPollResponse(await (await this.#request('/auth/desktop/poll', {
                requestId: attempt.requestId, pollToken: attempt.pollToken, codeVerifier: attempt.verifier,
            })).json());
            if (generation !== this.#generation) {
                if (tokens.status === 'authenticated')
                    await this.#request('/auth/logout', {}, tokens.accessToken).catch(() => undefined);
                return;
            }
            if (tokens.status === 'pending') {
                this.#later(() => { void this.poll(); }, tokens.nextPollAfterMs);
                return;
            }
            this.#attempt = undefined;
            this.#committing = { generation, access: tokens.accessToken };
            if (!await this.#write(tokens.refreshToken, generation))
                return;
            const account = await this.#account(tokens.accessToken);
            if (generation !== this.#generation)
                return;
            this.#accessToken = tokens.accessToken;
            this.#refreshLater();
            this.#publish({ phase: 'authenticated', account });
        }
        catch (error) {
            if (generation !== this.#generation)
                return;
            if (this.#attempt === undefined) {
                this.#publish({ phase: 'error', message: '授权已返回，但未能完成账号验证，请重试恢复登录。' });
                return;
            }
            if (error instanceof NetworkFailure || error instanceof HttpFailure && error.status >= 500) {
                this.#later(() => { void this.poll(); }, 2000);
                this.#publish({ phase: 'waiting', message: '网络暂时不可用，正在重试。' });
                return;
            }
            this.#attempt = undefined;
            this.#publish({ phase: 'error', message: '本次授权未完成，请重新登录。' });
        }
        finally {
            if (this.#committing?.generation === generation)
                this.#committing = undefined;
        }
    }
    async cancel() {
        if (this.#logoutSession !== undefined || this.#logoutRecoveryPending || this.#disposed)
            return this.state;
        if (this.state.phase === 'authenticated')
            return this.state;
        ++this.#generation;
        this.#stopTimer?.();
        this.#stopTimer = undefined;
        const attempt = this.#attempt;
        this.#attempt = undefined;
        const committing = this.#committing;
        this.#committing = undefined;
        if (attempt)
            await this.#request('/auth/desktop/cancel', { requestId: attempt.requestId, cancelToken: attempt.cancelToken }).catch(() => undefined);
        if (committing) {
            await this.#request('/auth/logout', {}, committing.access).catch(() => undefined);
            await this.#clear();
        }
        return this.#publish({ phase: 'signed-out' });
    }
    /** Revoke the exact native session before clearing this application's refresh credential.
     * @returns Safe original logout facts, or retained failure state for an explicit retry.
     */
    logout() {
        this.#logoutOperation ??= this.#logout().finally(() => { this.#logoutOperation = undefined; });
        return this.#logoutOperation;
    }
    async #logout() {
        if (this.#disposed)
            return this.state;
        if (this.#logoutRecoveryPending && this.deps.logoutRecovery) {
            const generation = ++this.#generation;
            this.#publish({ phase: 'starting', logoutPending: true, message: '正在继续退出登录…' });
            const recovered = await this.#recoverLogout(generation);
            if (recovered !== undefined)
                return recovered;
            // A previously unreadable store may contain no checkpoint. An explicit logout
            // must still revoke the host's retained login, rather than leave it to reopen later.
            this.#logoutRecoveryPending = true;
            await this.#restore(true);
            if (this.#disposed)
                return this.state;
            if (this.#accessToken === undefined || this.#scope === undefined) {
                if (this.state.phase === 'signed-out')
                    this.#logoutRecoveryPending = false;
                return this.state;
            }
            this.#logoutRecoveryPending = false;
        }
        if (this.#logoutSession === undefined) {
            if (this.#accessToken === undefined || this.#scope === undefined)
                await this.restore();
            if (this.#accessToken === undefined || this.#scope === undefined)
                return this.state;
            this.#logoutSession = { scope: this.#scope, accessToken: this.#accessToken };
        }
        const session = this.#logoutSession, generation = ++this.#generation;
        this.#stopTimer?.();
        this.#stopTimer = undefined;
        try {
            // Preparing the private native owner precedes scope invalidation, so its
            // original pending/confirmed checkpoint remains available for a retry.
            const pending = this.#logoutConfirmed !== undefined ? Promise.resolve(this.#logoutConfirmed)
                : this.deps.logoutSession?.(session);
            this.#publish({ phase: 'starting', logoutPending: true, message: '正在退出登录…' });
            if (pending === undefined)
                throw new Error('NATIVE_LOGOUT_UNAVAILABLE');
            const outcome = await pending;
            if (generation !== this.#generation || this.#disposed)
                return this.state;
            if (!outcome.localCleared || !outcome.remoteRevoked || outcome.persistentCleanupRequired) {
                return this.#publish({ phase: 'error', logoutPending: true, logoutOutcome: outcome, message: '无法确认设备撤销与本机登录清理，请重试退出。' });
            }
            this.#logoutConfirmed = outcome;
            return await this.#finishLogout(outcome, generation);
        }
        catch {
            if (generation !== this.#generation || this.#disposed)
                return this.state;
            return this.#publish({ phase: 'error', logoutPending: true, ...(this.#logoutConfirmed ? { logoutOutcome: this.#logoutConfirmed } : {}),
                message: '退出尚未完成，请重试；重新打开应用后会继续清理。' });
        }
    }
    async #recoverLogout(generation) {
        this.#logoutRecoveryPending = true;
        try {
            const recovery = await this.deps.logoutRecovery.recover();
            if (generation !== this.#generation || this.#disposed)
                return this.state;
            if (recovery.state === 'none') {
                if (this.#logoutConfirmed !== undefined)
                    throw new Error('NATIVE_LOGOUT_CHECKPOINT_MISSING');
                this.#logoutRecoveryChecked = true;
                this.#logoutRecoveryPending = false;
                return undefined;
            }
            const outcome = recovery.outcome;
            if (recovery.state !== 'complete' || !outcome.localCleared || !outcome.remoteRevoked || outcome.persistentCleanupRequired || recovery.error) {
                return this.#publish({ phase: 'error', logoutPending: true, logoutOutcome: outcome,
                    message: '退出清理尚未完成，请重试退出后再登录。' });
            }
            this.#logoutConfirmed = outcome;
            return await this.#finishLogout(outcome, generation);
        }
        catch {
            if (generation !== this.#generation || this.#disposed)
                return this.state;
            return this.#publish({ phase: 'error', logoutPending: true,
                ...(this.#logoutSession === undefined && this.#logoutConfirmed === undefined ? { startupRecoveryFailed: true } : {}),
                ...(this.#logoutConfirmed ? { logoutOutcome: this.#logoutConfirmed } : {}),
                message: '本机登录状态检查失败，请重新检查；确认前保留账号数据并暂停登录。' });
        }
    }
    async #finishLogout(outcome, generation) {
        this.#logoutRecoveryPending = true;
        await this.#clear(generation);
        if (generation !== this.#generation || this.#disposed)
            return this.state;
        await this.deps.logoutRecovery?.acknowledge();
        if (generation !== this.#generation || this.#disposed)
            return this.state;
        this.#accessToken = undefined;
        this.#logoutSession = undefined;
        this.#logoutConfirmed = undefined;
        this.#logoutRecoveryChecked = true;
        this.#logoutRecoveryPending = false;
        return this.#publish({ phase: 'signed-out', logoutOutcome: outcome });
    }
    dispose() { this.#disposed = true; ++this.#generation; this.#scope = undefined; ++this.#scopeGeneration; this.#logoutSession = undefined; this.#logoutConfirmed = undefined; this.#stopTimer?.(); this.#listeners.clear(); this.state = { ...this.state, logoutPending: false }; }
}
//# sourceMappingURL=services.js.map