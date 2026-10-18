/**
 * Crash report files: the complete diagnostic of one fatal Desktop failure,
 * written before the recovery dialog so the dialog can name the file. The
 * dialog itself shows only the last lines of the error; the file holds the
 * whole error, its enumerable properties and cause chain, the process facts,
 * and the renderer's recent error-level console output.
 */
/** Where a fatal failure surfaced. */
export type CrashReportSource = 'host' | 'web-boot' | 'renderer' | 'main';
/** Whether the backend had reached ready when the failure surfaced. */
export type CrashReportPhase = 'startup' | 'running';
/** Facts about the running application recorded in every report header. */
export interface CrashReportApp {
    readonly name: string;
    readonly version: string;
    readonly platform: string;
    readonly arch: string;
    readonly electron: string;
    readonly node: string;
    readonly locale: string;
}
/** Inputs of {@link renderCrashReport} and {@link writeCrashReport}. */
export interface CrashReportInput {
    readonly source: CrashReportSource;
    readonly phase: CrashReportPhase;
    readonly error: unknown;
    /** The Host's own inspected error when it reported the failure over IPC before exiting. */
    readonly hostDiagnostic?: string;
    /** Recent renderer console lines at error level, oldest first. */
    readonly rendererConsole: readonly string[];
    readonly app: CrashReportApp;
    readonly time: Date;
}
/** File name prefix every report shares. */
export declare const CRASH_REPORT_PREFIX = "crash-";
/** Reports kept after pruning, newest first by file name. */
export declare const CRASH_REPORTS_RETAINED = 10;
/** Retained bytes of renderer error-level console output. */
export declare const RENDERER_CONSOLE_MAX_BYTES: number;
/** Upper bound of the rendered error section; a Host exit error already carries a 64 KiB stderr tail in its message. */
export declare const ERROR_SECTION_MAX_CHARS: number;
/**
 * Bounded tail of renderer error-level console lines. Lines are dropped from
 * the head once the retained byte total exceeds the cap; one oversized line is
 * kept whole so a long stack is never cut mid-line.
 */
export declare class RendererConsoleTail {
    private readonly maxBytes;
    private readonly lines;
    private bytes;
    /** @param maxBytes - retained byte cap across all lines. */
    constructor(maxBytes?: number);
    /**
     * Append one console line.
     * @param line - the formatted console message.
     */
    push(line: string): void;
    /** @returns the retained lines, oldest first. */
    snapshot(): readonly string[];
}
/**
 * The report file name: sortable by time, then the source.
 * @param time - failure time.
 * @param source - where the failure surfaced.
 * @returns `crash-<ISO time with ':' and '.' as '-'>-<source>.log`.
 */
export declare function crashReportFileName(time: Date, source: CrashReportSource): string;
/**
 * Render one report as plain text: a header of facts, the inspected error,
 * the Host's own diagnostic when it reported one, and the renderer console tail.
 * @param input - the failure and its context.
 * @returns the complete file content.
 */
export declare function renderCrashReport(input: CrashReportInput): string;
/**
 * Write one report into `directory`, creating it when absent. Failure is
 * reported to `console.error` and yields `undefined`: the recovery dialog
 * proceeds without a file rather than failing over a diagnostic aid.
 * @param directory - the application logs directory.
 * @param input - the failure and its context.
 * @returns the written file path, or `undefined` when writing failed.
 */
export declare function writeCrashReport(directory: string, input: CrashReportInput): Promise<string | undefined>;
/**
 * Delete the oldest reports beyond `retained`, judged by file name order, and
 * leave every other file in the directory alone. Failure is reported to
 * `console.error`; a missing directory is not a failure.
 * @param directory - the application logs directory.
 * @param retained - reports to keep.
 */
export declare function pruneCrashReports(directory: string, retained?: number): Promise<void>;
//# sourceMappingURL=crash-report.d.ts.map