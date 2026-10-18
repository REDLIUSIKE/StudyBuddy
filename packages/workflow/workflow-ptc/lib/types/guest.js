/** Executes one workflow VM inside the mounted PTC runtime's Node process. */
import { renderThrown } from "./realm.js";
import { WorkflowExecution } from "./runtime.js";
/**
 * Run a workflow with one progress batch in flight. Drain progress before child
 * disposal and the terminal result; PTC and the host own cancellation and cleanup.
 * @param host - JSON callbacks owned by this workflow run.
 * @returns The script result after progress delivery; initialization failures reject.
 */
export async function runWorkflowGuest(host) {
    const init = await host.begin({});
    let queued = [];
    let inFlight;
    let progressError;
    const flush = () => {
        if (inFlight !== undefined || queued.length === 0)
            return;
        const batch = queued;
        queued = [];
        inFlight = host.progress(batch).then(() => { inFlight = undefined; flush(); }, (error) => {
            progressError = renderThrown(error);
            queued = [];
            inFlight = undefined;
        });
    };
    const send = (event) => {
        if (progressError !== undefined)
            return;
        queued.push(event);
        // The first batch reaches the host before a synchronous script can seize its loop.
        flush();
    };
    const drain = async () => {
        while (inFlight !== undefined)
            await inFlight;
    };
    const observer = {
        phase: (title) => { send({ type: 'phase', title }); },
        log: (message) => { send({ type: 'log', message }); },
        agentStart: (info) => { send({ type: 'agent-start', info }); },
        agentEnd: (info) => { send({ type: 'agent-end', info }); },
    };
    const children = {
        async startAgent(request) {
            const { callId, childId } = await host.startChild(request);
            const result = host.childResult({ callId });
            // A dropped agent() call must not turn a child failure into an unhandled rejection.
            void result.catch(() => { });
            return {
                id: childId,
                result,
                async dispose() {
                    // Start observers must receive the child while its host registration is still live.
                    await drain();
                    await host.disposeChild({ callId });
                },
            };
        },
    };
    const execution = new WorkflowExecution(init.meta, init.body, init.args, init.limits, observer, children);
    const result = await execution.drive();
    await drain();
    return progressError === undefined ? result : {
        value: null,
        stopReason: 'error',
        error: progressError,
        agentsStarted: result.agentsStarted,
    };
}
//# sourceMappingURL=guest.js.map