/** Explicit OTLP JSON transport for feedback-authorized Session logs. */
import { createOtlpHttpExportDelegate, createOtlpHttpExporterMetrics, getSharedConfigurationFromEnvironment, httpAgentFactoryFromOptions } from '@opentelemetry/otlp-exporter-base/node-http';
import { getSharedConfigurationDefaults, mergeOtlpSharedConfigurationWithDefaults, OTLPExporterBase } from '@opentelemetry/otlp-exporter-base';
import { JsonLogsSerializer, LogsExporterMetricsHelper } from '@opentelemetry/otlp-transformer';
/** `otel.component.type` reported by OTLP HTTP log exporter self-observability metrics. */
const OTLP_HTTP_LOG_EXPORTER_COMPONENT_TYPE = 'otlp_http_log_exporter';
/**
 * Create an SDK JSON exporter without inheriting another collector's headers or TLS identity.
 * @param options - explicit endpoint, headers, agent, and SDK transport settings.
 * @returns the exporter owned by one independent log pipeline.
 */
export function createLogExporter(options) {
    return new OTLPExporterBase(createOtlpHttpExportDelegate(logTransportOptions(options), JsonLogsSerializer, OTLP_HTTP_LOG_EXPORTER_COMPONENT_TYPE, LogsExporterMetricsHelper, undefined));
}
/**
 * Create one log exporter's self-observability metrics; without a meter provider they record nothing.
 * @param url - collector endpoint recorded as the metrics server address and port.
 * @returns the metrics recorder required by an OTLP HTTP log export delegate.
 */
export function createLogExporterMetrics(url) {
    return createOtlpHttpExporterMetrics(OTLP_HTTP_LOG_EXPORTER_COMPONENT_TYPE, LogsExporterMetricsHelper, url, undefined);
}
/**
 * Resolve collector-local headers and agents with shared SDK timeout and compression defaults.
 * @param options - explicit endpoint and SDK HTTP settings.
 * @returns resolved transport settings without ambient credentials.
 */
export function logTransportOptions(options) {
    const shared = mergeOtlpSharedConfigurationWithDefaults(options, getSharedConfigurationFromEnvironment('LOGS'), getSharedConfigurationDefaults());
    return {
        ...shared,
        url: options.url,
        headers: async () => ({
            'Content-Type': 'application/json',
            ...typeof options.headers === 'function' ? await options.headers() : options.headers,
        }),
        // An agent factory owns the returned agent, including its keepAlive setting.
        agentFactory: typeof options.httpAgentOptions === 'function' ? options.httpAgentOptions
            : httpAgentFactoryFromOptions({ keepAlive: options.keepAlive ?? true, ...options.httpAgentOptions }),
        ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
    };
}
//# sourceMappingURL=transport.js.map