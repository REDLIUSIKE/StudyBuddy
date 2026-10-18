import { SeverityNumber } from '@opentelemetry/api-logs';
import { ExportResultCode } from '@opentelemetry/core';
import { JsonLogsSerializer } from '@opentelemetry/otlp-transformer';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider } from '@opentelemetry/sdk-logs';
import { createLogExporter } from "./transport.js";
/** Collector request ceiling in uncompressed UTF-8 bytes, including the OTLP envelope. */
export const SESSION_LOG_MAX_REQUEST_BYTES = 4_000_000;
/**
 * Validate byte and queue settings before constructing an SDK pipeline.
 * @param options - Session-specific limits supplied by the owning composition.
 * @returns the resolved collector request limit.
 */
export function resolveSessionLogLimits(options) {
    const limit = options.maxRequestBytes ?? SESSION_LOG_MAX_REQUEST_BYTES;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > SESSION_LOG_MAX_REQUEST_BYTES) {
        throw new Error(`session log maxRequestBytes must be an integer between 1 and ${SESSION_LOG_MAX_REQUEST_BYTES}`);
    }
    for (const key of ['maxQueueSize', 'maxExportBatchSize', 'scheduledDelayMillis', 'exportTimeoutMillis']) {
        const value = options.processor?.[key];
        if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)) {
            throw new Error(`session log processor.${key} must be a positive integer no greater than 2147483647`);
        }
    }
    const queue = options.processor?.maxQueueSize ?? 2048;
    const batch = options.processor?.maxExportBatchSize ?? 512;
    if (batch > queue)
        throw new Error('session log maxExportBatchSize must not exceed maxQueueSize');
    return limit;
}
/** Byte/count batching with one transport request in flight, including after a watchdog warning. */
class SessionLogProcessor {
    exporter;
    limit;
    config;
    warn;
    queue = [];
    bytes = 0;
    timer;
    active;
    shutdownPromise;
    stopped = false;
    constructor(exporter, limit, config, warn) {
        this.exporter = exporter;
        this.limit = limit;
        this.config = config;
        this.warn = warn;
    }
    onEmit(record) {
        if (this.stopped)
            return;
        if (this.queue.length >= this.config.maxQueueSize) {
            this.warn('Session log queue is full; record rejected');
            return;
        }
        let bytes;
        try {
            const serialized = JsonLogsSerializer.serializeRequest([record]);
            if (serialized === undefined)
                throw new Error('Session log serialization produced no request');
            bytes = serialized.byteLength;
        }
        catch (error) {
            this.warn('Session log serialization failed; record rejected', error instanceof Error ? error : new Error(String(error)));
            return;
        }
        if (bytes > this.limit) {
            this.warn('Session log record rejected; content was not truncated', new Error(`Session log record exceeds maxRequestBytes: ${bytes} > ${this.limit}`));
            return;
        }
        this.queue.push({ record, bytes });
        this.bytes += bytes;
        if (this.active !== undefined)
            return;
        if (this.queue.length >= this.config.maxExportBatchSize || this.bytes >= this.limit) {
            void this.forceFlush();
        }
        else if (this.timer === undefined) {
            this.timer = setTimeout(() => { void this.forceFlush(); }, this.config.scheduledDelayMillis);
            this.timer.unref();
        }
    }
    forceFlush() {
        clearTimeout(this.timer);
        this.timer = undefined;
        if (this.active !== undefined)
            return this.active;
        if (this.queue.length === 0)
            return Promise.resolve();
        this.active = this.drain();
        return this.active;
    }
    async drain() {
        try {
            while (!this.stopped && this.queue.length > 0) {
                let bytes = 0;
                let count = 0;
                for (const entry of this.queue) {
                    if (count === this.config.maxExportBatchSize || bytes + entry.bytes > this.limit)
                        break;
                    bytes += entry.bytes;
                    count++;
                }
                // Each measured record includes its resource/scope envelope. The shared
                // envelope in this provider's multi-record request cannot exceed their sum.
                const records = this.queue.splice(0, count).map(entry => entry.record);
                this.bytes -= bytes;
                await this.send(records);
                // The export callback precedes removal from the SDK concurrency queue.
                await this.exporter.forceFlush();
            }
        }
        finally {
            this.active = undefined;
        }
    }
    send(records) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.warn('Session log request exceeded exportTimeoutMillis; waiting for transport settlement');
            }, this.config.exportTimeoutMillis);
            timer.unref();
            const finish = (error) => {
                clearTimeout(timer);
                if (error !== undefined)
                    this.warn('Session log export failed', error);
                resolve();
            };
            try {
                this.exporter.export(records, (result) => {
                    finish(result.code === ExportResultCode.SUCCESS
                        ? undefined : result.error ?? new Error('Session log HTTP export failed'));
                });
            }
            catch (error) {
                finish(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
    stopPending() {
        this.stopped = true;
        this.queue.length = 0;
        this.bytes = 0;
        clearTimeout(this.timer);
        this.timer = undefined;
    }
    shutdown() {
        this.shutdownPromise ??= this.forceFlush().then(() => this.exporter.shutdown());
        return this.shutdownPromise;
    }
}
/** Owns feedback-authorized Session logs; no product-event provider or queue is mounted. */
export class SessionLogReporter {
    provider;
    processor;
    logger;
    /** @param options - explicit transport, resource identity, queue limits, and diagnostics. */
    constructor(options) {
        const limit = resolveSessionLogLimits(options);
        this.processor = new SessionLogProcessor(createLogExporter(options.exporter), limit, {
            maxQueueSize: options.processor?.maxQueueSize ?? 2048,
            maxExportBatchSize: options.processor?.maxExportBatchSize ?? 512,
            scheduledDelayMillis: options.processor?.scheduledDelayMillis ?? 1000,
            exportTimeoutMillis: options.processor?.exportTimeoutMillis ?? 30000,
        }, options.onFailure);
        this.provider = new LoggerProvider({
            logRecordLimits: { attributeValueLengthLimit: Infinity, attributeCountLimit: Infinity },
            resource: resourceFromAttributes(options.resourceAttributes),
            processors: [this.processor],
        });
        this.logger = this.provider.getLogger(options.scope.name, options.scope.version);
    }
    /**
     * Enqueue one complete event without acknowledging network delivery.
     * @param record - event with redacted data and its original Session id.
     */
    reportSessionLog(record) {
        const severityNumber = record.severityNumber ?? SeverityNumber.INFO;
        this.logger.emit({
            eventName: 'session-log', body: 'session-log',
            timestamp: record.event.time, observedTimestamp: record.event.time,
            severityNumber, severityText: SeverityNumber[severityNumber],
            attributes: { ...record.attributes, sessionId: record.sessionId, content: JSON.stringify(record.event) },
        });
    }
    /** Stop queued requests after the owning backend's shutdown deadline; an active transport may still settle. */
    stopPending() { this.processor.stopPending(); }
    /**
     * Drain queued requests and release the SDK transport.
     * @returns completion after queued requests settle and the SDK transport shuts down.
     */
    shutdown() { return this.provider.shutdown(); }
}
//# sourceMappingURL=session-log.js.map