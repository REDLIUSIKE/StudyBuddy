/** Domain operations honor the live native policy without widening filesystem roots. */
export class CapabilityPolicy {
    ctx;
    guard;
    constructor(ctx, guard) {
        this.ctx = ctx;
        this.guard = guard;
    }
    async authorize(context, effect, target, input = null) {
        context.signal.throwIfAborted();
        if (this.ctx.agents.get(context.agent.id) !== context.agent || context.agent.id !== context.caller.callerSessionId)
            throw Error('CAPABILITY_SESSION_REQUIRED');
        const policy = this.ctx.get('sandboxPolicy');
        if (!policy)
            throw Error('CAPABILITY_POLICY_UNAVAILABLE');
        const resolved = policy.resolve({ session: context.agent.session });
        if (effect !== 'read' && resolved.mode === 'read-only')
            throw Error('CAPABILITY_READ_ONLY');
        await this.guard(context, effect, target, input);
        context.signal.throwIfAborted();
    }
}
//# sourceMappingURL=policy.js.map