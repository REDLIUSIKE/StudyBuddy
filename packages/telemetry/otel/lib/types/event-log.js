import { addAbortListener } from 'node:events';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { ExportResultCode } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { createEventLogExporter } from "./event-transport.js";
/** One caller-owned ordinary-event queue, independent of every Session-log queue. */
export class EventLogReporter {
    exporter;
    provider;
    logger;
    cancellation = new AbortController();
    /** @param options - explicit transport, resource, scope, queue, and diagnostic settings. */
    constructor(options) {
        const exporter = createEventLogExporter(options.exporter, this.cancellation.signal);
        this.exporter = exporter;
        this.provider = new LoggerProvider({
            resource: resourceFromAttributes(options.resourceAttributes),
            processors: [new BatchLogRecordProcessor({
                    ...options.processor,
                    exporter: {
                        export: (records, callback) => {
                            exporter.export(records, (result) => {
                                if (result.code !== ExportResultCode.SUCCESS)
                                    options.onFailure('Product telemetry export failed', result.error);
                                callback(result);
                            });
                        },
                        forceFlush: () => exporter.forceFlush(),
                        shutdown: () => exporter.shutdown(),
                    },
                })],
        });
        this.logger = this.provider.getLogger(options.scope.name, options.scope.version);
    }
    /**
     * Enqueue caller-selected analytics fields without acknowledging delivery.
     * @param record - the ordinary event to report.
     */
    emit(record) {
        const severityNumber = record.severityNumber ?? SeverityNumber.INFO;
        this.logger.emit({ ...record, observedTimestamp: Date.now(), severityNumber, severityText: SeverityNumber[severityNumber] });
    }
    /**
     * Drain the queue and release its transport, cancelling remaining exports when the caller aborts.
     * @param signal - optional shutdown deadline; abort discards pending exports and cancels retry waits.
     * @returns completion of SDK shutdown and transport cleanup.
     */
    async shutdown(signal) {
        const abort = () => { this.cancellation.abort(signal?.reason); };
        const listener = signal === undefined ? undefined : addAbortListener(signal, abort);
        if (signal?.aborted)
            abort();
        try {
            await this.provider.shutdown();
        }
        finally {
            // SDK batch shutdown can reject before it releases the exporter.
            try {
                await this.exporter.shutdown();
            }
            finally {
                listener?.[Symbol.dispose]();
            }
        }
    }
}
//# sourceMappingURL=event-log.js.map