/** Cordis entry for independent ordinary-event and Session-log OTLP channels. */
import { Service } from '@deepseek-ai/cordis';
import { EventLogReporter } from "./event-log.js";
import { SessionLogReporter } from "./session-log.js";
/** Shared transport provider. Mounting creates no queue, identity, or network connection. */
export default class OTel extends Service {
    constructor(ctx) { super(ctx, 'otel'); }
    /**
     * Create an independent ordinary-event channel with count-based batching.
     * The injected consumer must drain it during its fiber disposal.
     * @param options - transport, scope, resource, queue, and diagnostic settings selected by the consumer.
     * @returns the caller-owned channel; no state is shared with other channels.
     */
    createEventReporter(options) { return new EventLogReporter(options); }
    /**
     * Create an independent byte-bounded Session-log channel.
     * Authorization and redaction precede reporting; the consumer owns shutdown and its outer deadline.
     * @param options - transport, scope, resource, queue, and diagnostic settings selected by the consumer.
     * @returns the caller-owned channel, preserving complete accepted events within the request byte ceiling.
     */
    createSessionLogReporter(options) { return new SessionLogReporter(options); }
}
//# sourceMappingURL=index.js.map