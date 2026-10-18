import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol';
import { parsePlanAddress, submittedPlan } from "./plan.js";
/**
 * Bind plan reads to the generated Session Remote face.
 * Opening a follow reads projections and may activate a prepared Session on the Host.
 * Generated Remote streams can throw carrier failures; the provider reports failed
 * reads as resource failure frames and preserves Remote error codes.
 * @param remote - Existing Session history API.
 * @returns a provider whose reads stop after finding the exact invocation.
 */
export function planResourceProvider(remote) {
    return {
        protocol: 'plan',
        async *open(address, { signal }) {
            const aborted = () => signal.aborted;
            if (aborted())
                return;
            const target = parsePlanAddress(address);
            if (target === undefined) {
                yield { ok: false, error: new RemoteError('plan/invalid-address', 'Invalid plan resource address.', {}) };
                return;
            }
            const sessionAddress = target.session;
            try {
                // The snapshot supplies the page API's fixed log cut. Breaking closes the follow stream.
                let snapshot;
                for await (const frame of remote.follow({ address: sessionAddress }, signal)) {
                    if (frame.type === 'snapshot') {
                        snapshot = frame;
                        break;
                    }
                }
                if (aborted())
                    return;
                if (snapshot === undefined)
                    throw new RemoteError('plan/unavailable', 'Session history ended before the plan could be read.', {});
                let page = { records: snapshot.records, hasMore: snapshot.hasMore };
                while (true) {
                    for (const entry of page.records) {
                        const plan = submittedPlan(entry.event);
                        if (plan?.callId === target.callId) {
                            yield { ok: true, value: plan };
                            return;
                        }
                    }
                    const beforeSeq = page.records[0]?.event.seq;
                    if (!page.hasMore || beforeSeq === undefined)
                        break;
                    const next = await remote.page({ address: sessionAddress, throughSeq: snapshot.cursor, beforeSeq }, signal);
                    if (aborted())
                        return;
                    if (!next.ok) {
                        yield next;
                        return;
                    }
                    page = next.value;
                }
                yield { ok: false, error: new RemoteError('plan/not-found', 'The submitted plan was not found in this Session.', {}) };
            }
            catch (error) {
                if (!aborted())
                    yield {
                        ok: false,
                        error: remoteErrorOf(error) ?? new RemoteError('plan/read-failed', error instanceof Error ? error.message : String(error), {}),
                    };
            }
        },
    };
}
//# sourceMappingURL=plan-resource.js.map