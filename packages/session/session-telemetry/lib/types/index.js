/**
 * SessionTelemetryBackend Service Definition for the DeepSeek Harness.
 *
 * This package owns the CAPTURE side of session-event reporting — the complete
 * one-record-per-event ledger mirror, what records carry, when
 * they are captured (adoption, the per-append firehose, lifecycle
 * forwarding), live versus on-demand canonical-log capture, and the HMR
 * cursor. Everything downstream of
 * {@link SessionTelemetryBackend.emit} — batching, retry, queueing, and loss policy — is the
 * backend's responsibility and is deliberately not modelled here. Capture and
 * backend responsibilities are documented in the
 * [Session telemetry reference](../README.md#understand-the-implementation).
 *
 * @module @deepseek-ai/dsh-session-telemetry
 */
import { Service } from '@deepseek-ai/cordis';
/**
 * Loadable form of the backend contract: one implementation per context —
 * the cordis `Service` registration under the `telemetry` key throws on a
 * duplicate, cordis' standard behavior. A backend composes a
 * {@link SessionTelemetryCoordinator} in its constructor to install the capture side.
 */
export class SessionTelemetryBackend extends Service {
    constructor(ctx) {
        super(ctx, 'sessionTelemetry');
    }
}
export { SessionTelemetryCoordinator } from "./coordinator.js";
//# sourceMappingURL=index.js.map