/** Native welcome operations using the shared Web authentication and RPC APIs. */
import { randomUUID } from 'node:crypto';
import { desktopAccountBackend } from "./account-backend.js";
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Reuse the Main-owned Host cookie without a second browser-cookie exchange. */
export function connectAuthenticatedDesktopWelcome(authenticatedUrl, cookie, send = fetch) {
    const origin = new URL(authenticatedUrl).origin;
    return connectDesktopWelcome(origin + '/', (input, init) => {
        if (new URL(input).origin !== origin)
            throw new Error('desktop welcome: Host origin changed');
        const headers = new Headers(init?.headers);
        headers.set('cookie', cookie);
        return send(input, { ...init, headers, redirect: 'error' });
    }, () => Promise.resolve(cookie));
}
/**
 * Authenticate the native HTTP client through the Web application's launch URL.
 * @param authenticatedUrl - URL supplied by the running Desktop Host.
 * @param send - Electron session fetch, retaining the Web authentication cookie.
 * @returns metadata reads and write-only credential operations over standard RPC.
 */
export async function connectDesktopWelcome(authenticatedUrl, send, cookies = () => Promise.resolve('')) {
    const origin = new URL(authenticatedUrl).origin;
    const authenticated = await send(authenticatedUrl, { credentials: 'include' });
    await authenticated.body?.cancel();
    if (!authenticated.ok)
        throw new Error('desktop welcome: Web authentication failed');
    const invoke = async (request, signal) => {
        const rpcId = randomUUID();
        const method = `${request.namespace}/${request.method}`;
        const response = await send(new URL(`/api/${method}`, origin).href, {
            method: 'POST', credentials: 'include', redirect: 'error', ...(signal === undefined ? {} : { signal }),
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: request.args } }),
        });
        if (!response.ok)
            throw new Error('desktop welcome: Web request failed');
        const envelope = await response.json();
        if (!record(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
            || !record(envelope.result) || envelope.result.ok !== true) {
            throw new Error('desktop welcome: Web RPC failed');
        }
        return envelope.result.value;
    };
    const account = desktopAccountBackend(origin, invoke, cookies);
    const settingsAndReference = async () => {
        const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} });
        if (!record(settings) || !Array.isArray(settings.namespaces))
            throw new Error('desktop welcome: missing settings namespaces');
        const official = settings.namespaces.find((item) => record(item) && item.ns === 'llm-deepseek');
        if (official === undefined)
            return { settings: { namespaces: settings.namespaces }, ref: undefined };
        if (!record(official) || !record(official.value) || typeof official.value.apiKeyEnv !== 'string') {
            throw new Error('desktop welcome: missing official DeepSeek credential reference');
        }
        return { settings: { namespaces: settings.namespaces }, ref: official.value.apiKeyEnv };
    };
    const localePreference = (namespaces) => {
        const locale = namespaces.find((item) => record(item) && item.ns === 'locale');
        if (!record(locale) || !record(locale.value)
            || (locale.value.preference !== undefined && typeof locale.value.preference !== 'string')) {
            throw new Error('desktop welcome: invalid locale preference');
        }
        return locale.value.preference ?? null;
    };
    const read = async () => {
        const { settings, ref } = await settingsAndReference();
        const providers = await invoke({ namespace: 'llm', method: 'listConfigurableProviders', args: {} });
        if (!Array.isArray(providers))
            throw new Error('desktop welcome: invalid provider directory');
        const namespaces = settings.namespaces;
        const refs = providers.flatMap((provider) => {
            if (!record(provider) || typeof provider.settingsNs !== 'string' || !Array.isArray(provider.settingsPath)) {
                throw new Error('desktop welcome: invalid provider settings address');
            }
            const namespace = namespaces.find((item) => record(item) && item.ns === provider.settingsNs);
            let value = record(namespace) ? namespace.value : undefined;
            for (const key of provider.settingsPath) {
                if (typeof key !== 'string')
                    throw new Error('desktop welcome: invalid provider settings path');
                value = record(value) ? value[key] : undefined;
            }
            return record(value) && typeof value.apiKeyEnv === 'string' ? [value.apiKeyEnv] : [];
        });
        const unique = [...new Set([...(ref === undefined ? [] : [ref]), ...refs])];
        const states = {};
        // credentials.describe accepts at most 64 references per request.
        for (let offset = 0; offset < unique.length; offset += 64) {
            const batch = await invoke({ namespace: 'credentials', method: 'describe', args: { refs: unique.slice(offset, offset + 64) } });
            if (!record(batch))
                throw new Error('desktop welcome: invalid credential metadata');
            Object.assign(states, batch);
        }
        if (ref !== undefined && !record(states[ref]))
            throw new Error('desktop welcome: missing credential metadata');
        return {
            loggedIn: (await account.state()).status === 'credential-stored',
            hasApiKey: Object.values(states).some(value => record(value) && value.configured === true),
            writable: ref !== undefined && record(states[ref]) && states[ref].writable === true,
            localePreference: localePreference(namespaces),
        };
    };
    return {
        account,
        read,
        async analyticsEnabled() {
            const enabled = await invoke({ namespace: 'productAnalytics', method: 'enabled', args: {} }, AbortSignal.timeout(1000));
            if (typeof enabled !== 'boolean')
                throw new Error('desktop analytics: invalid collection policy');
            return enabled;
        },
        async report(event) { await invoke({ namespace: 'productAnalytics', method: 'report', args: { event } }, AbortSignal.timeout(1000)); },
        async readLocalePreference() {
            const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} });
            if (!record(settings) || !Array.isArray(settings.namespaces))
                throw new Error('desktop welcome: missing settings namespaces');
            return localePreference(settings.namespaces);
        },
        async save(apiKey) {
            if (!/^[\x21-\x7e]+$/.test(apiKey))
                return { ok: false };
            try {
                const { ref } = await settingsAndReference();
                if (ref === undefined)
                    return { ok: false };
                await invoke({ namespace: 'credentials', method: 'set', args: { ref, value: apiKey } });
                return { ok: true };
            }
            catch {
                // Provider diagnostics may contain credentials; the native form owns failure copy.
                return { ok: false };
            }
        },
    };
}
//# sourceMappingURL=welcome-backend.js.map