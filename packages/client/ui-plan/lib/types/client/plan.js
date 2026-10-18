function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Read a complete plan from untrusted logged arguments.
 * @param event - Native call or PTC dispatch event from Session history.
 * @returns the submitted plan, or undefined for unrelated or malformed data.
 */
export function submittedPlan(event) {
    if (event.type !== 'tool/call' && event.type !== 'tool/ptc-dispatch-start' && event.type !== 'tool/ptc-dispatch')
        return undefined;
    const data = event.data;
    if (!record(data) || data.name !== 'exit_plan_mode')
        return undefined;
    const callId = event.type === 'tool/call' ? data.callId : data.subCallId;
    if (typeof callId !== 'string' || callId === '')
        return undefined;
    let args = data.arguments;
    if (event.type === 'tool/call') {
        if (typeof args !== 'string')
            return undefined;
        try {
            args = JSON.parse(args);
        }
        catch (_error) {
            return undefined; /* Malformed model JSON remains in the generic tool row. */
        }
    }
    if (!record(args) || typeof args.plan !== 'string')
        return undefined;
    const markdown = args.plan;
    const title = /^#\s+(\S[^\r\n]*)/.exec(markdown.trim())?.[1];
    return title === undefined ? undefined : { callId: callId, markdown, title };
}
/**
 * Encode the durable identity of a plan without retaining its text in layout storage.
 * @param target - Session and tool-call identity.
 * @returns the plan resource address.
 */
export function planAddress(target) {
    const { session, callId } = target;
    const parts = session.kind === 'session'
        ? [session.sessionId, callId]
        : ['subagent', session.parentSessionId, session.childSessionId, session.mode, callId];
    return `dsh-resource://plan/${parts.map(encodeURIComponent).join('/')}`;
}
/**
 * Validate a saved or caller-supplied plan resource address.
 * @param address - Address submitted to the sidebar or resource provider.
 * @returns the decoded identity, or undefined for an unsupported address.
 */
export function parsePlanAddress(address) {
    const match = /^dsh-resource:\/\/plan\/([^?#]+)$/.exec(address);
    if (match === null)
        return undefined;
    try {
        const parts = match[1].split('/').map(decodeURIComponent);
        if (parts.some(part => part === ''))
            return undefined;
        if (parts.length === 2)
            return {
                session: { kind: 'session', sessionId: parts[0] }, callId: parts[1],
            };
        if (parts.length === 5 && parts[0] === 'subagent' && (parts[3] === 'one-shot' || parts[3] === 'continuable' || parts[3] === 'unknown'))
            return {
                session: { kind: 'subagent', parentSessionId: parts[1], childSessionId: parts[2], mode: parts[3] },
                callId: parts[4],
            };
        return undefined;
    }
    catch (_error) {
        // Invalid saved percent encoding cannot identify a Session or invocation.
        return undefined;
    }
}
//# sourceMappingURL=plan.js.map