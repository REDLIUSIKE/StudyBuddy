/** Native recovery for the first fatal failure in one Desktop process. */
import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import type { CrashReportSource } from './crash-report.ts';
import { type DesktopMessages } from './locale.ts';
interface RecoveryOperations {
    messages(): DesktopMessages;
    show(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
    stop(): Promise<void>;
    disablePlugins(): Promise<void>;
    exit(): void;
    restart(): void;
    /** Persist the complete diagnostic; resolves with the file path, or `undefined` when nothing was written. */
    writeReport(error: unknown, source: CrashReportSource): Promise<string | undefined>;
}
/** Upper bound on waiting for the crash report before the dialog opens. */
export declare const CRASH_REPORT_WAIT_MS = 1000;
/** Deduplicates fatal reports while keeping explicit recovery-operation failures actionable. */
export declare class DesktopFatalRecovery {
    private readonly operations;
    private reported;
    /** @param operations - Native presentation, report persistence, and application-owned shutdown operations. */
    constructor(operations: RecoveryOperations);
    /** Whether this process requires a native recovery action before further plugin changes. */
    get active(): boolean;
    /**
     * Show the first fatal error; later reports cannot replace it or open another dialog.
     * The crash report is written first, bounded by {@link CRASH_REPORT_WAIT_MS}, so the dialog can name it;
     * a slow or failed write shows the dialog without a path.
     * @param error - Fatal failure, including nested diagnostic causes.
     * @param source - Where the failure surfaced, recorded in the report.
     * @returns Completion of the user's recovery action; duplicate reports resolve immediately.
     */
    report(error: unknown, source: CrashReportSource): Promise<void>;
    private persist;
}
export {};
//# sourceMappingURL=fatal-recovery.d.ts.map