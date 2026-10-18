import { EVENTS_ROUTE, parsePluginsEventFrame } from "../events.js";
/** Cordis plugin name. */
export const name = 'client-hmr';
/** Required service: the client module system whose entry controller handles received frames. */
export const inject = ['modules'];
/**
 * Forward graph snapshots and rebuilds to the page's shared serial controller.
 * @param ctx - Plugin context with the client module system.
 */
export function apply(ctx) {
    const entries = ctx.modules.entries;
    const handle = (frame) => {
        const run = frame.type === 'graph'
            ? Promise.resolve().then(() => entries.sync(frame.graph))
            : entries.reload(frame.id, frame.rev);
        void run.catch((error) => { ctx.logger.error(error); });
    };
    ctx.effect(() => {
        const source = new EventSource(EVENTS_ROUTE);
        source.addEventListener('message', (event) => {
            let value;
            try {
                value = JSON.parse(event.data);
            }
            catch {
                // Wire boundary: a malformed transport frame is dropped loudly.
                ctx.logger.warn(`client-hmr: unparseable event frame: ${event.data}`);
                return;
            }
            const parsed = parsePluginsEventFrame(value);
            if (parsed.kind === 'invalid') {
                ctx.logger.warn(`client-hmr: invalid event frame: ${event.data}`);
            }
            else if (parsed.kind === 'frame') {
                handle(parsed.frame);
            }
        });
        return () => { source.close(); };
    }, 'client-hmr: event source');
}
//# sourceMappingURL=index.js.map