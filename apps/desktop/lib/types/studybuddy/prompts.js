const CHANNEL = 'studybuddy:prompts';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** Fixed routes; no arbitrary URL or author can cross the preload boundary. */
export function promptRequest(method, args) {
    if (!Array.isArray(args))
        throw new Error('PROMPT_INPUT_INVALID');
    if (method === 'mine' && args.length === 0)
        return { path: '/prompts/mine' };
    if (method === 'square' && args.length === 2 && typeof args[0] === 'string' && args[0].length <= 200 && Number.isSafeInteger(args[1]) && args[1] >= 1 && args[1] <= 10000) {
        return { path: '/prompts/square?' + new URLSearchParams({ query: args[0], page: String(args[1]) }) };
    }
    if (method !== 'save' && method !== 'publish')
        throw new Error('PROMPT_OPERATION_DENIED');
    const value = args[0];
    if (args.length !== 1 || !value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('PROMPT_INPUT_INVALID');
    const keys = method === 'save' ? ['id', 'requestId', 'expectedRevision', 'title', 'body'] : ['id', 'requestId', 'expectedRevision'];
    if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value)) || typeof value.id !== 'string' || !UUID.test(value.id) || typeof value.requestId !== 'string' || !UUID.test(value.requestId) || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < (method === 'save' ? 0 : 1) || value.expectedRevision > 2147483646)
        throw new Error('PROMPT_INPUT_INVALID');
    if (method === 'save' && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || typeof value.body !== 'string' || !value.body.trim() || Buffer.byteLength(value.body, 'utf8') > 65536))
        throw new Error('PROMPT_INPUT_INVALID');
    return { path: '/prompts/' + method, body: value };
}
/** Private credential owner, using the existing authenticated account generation. */
export class StudyBuddyPrompts {
    auth;
    fetcher;
    constructor(auth, fetcher) {
        this.auth = auth;
        this.fetcher = fetcher;
    }
    async invoke(method, args) {
        const request = promptRequest(method, args);
        return this.auth.withSession(async (session) => {
            let response;
            try {
                response = await this.fetcher('https://guijitongzhuo.com/api/v1' + request.path, {
                    method: request.body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
                    headers: { Accept: 'application/json', Authorization: 'Bearer ' + session.accessToken,
                        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
                    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
                });
            }
            catch {
                throw new Error('NETWORK_UNAVAILABLE');
            }
            const value = await response.json();
            if (!response.ok) {
                const code = value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' && /^[A-Z0-9_]{1,128}$/u.test(value.code) ? value.code : 'PROMPT_REQUEST_FAILED';
                throw new Error(code);
            }
            if (method === 'mine' || method === 'square') {
                if (!Array.isArray(value) || value.length > (method === 'mine' ? 500 : 50))
                    throw new Error('PROMPT_RESPONSE_INVALID');
            }
            else if (!value || typeof value !== 'object' || Array.isArray(value))
                throw new Error('PROMPT_RESPONSE_INVALID');
            return value;
        });
    }
    /** @param ipc - original main-process IPC owner. @param assertSender - authenticated main-frame validator. */
    register(ipc, assertSender) {
        ipc.handle(CHANNEL, async (event, method, args) => {
            try {
                assertSender(event);
                return { ok: true, data: await this.invoke(method, args) };
            }
            catch (error) {
                return { ok: false, error: { code: error instanceof Error && /^[A-Z0-9_]{1,128}$/u.test(error.message) ? error.message : 'PROMPT_REQUEST_FAILED' } };
            }
        });
        return () => { ipc.removeHandler(CHANNEL); };
    }
}
//# sourceMappingURL=prompts.js.map