/** Deliver console interrupts to CLI listeners in Electron's Windows Node mode. */
/**
 * Register the CLI process's Windows console handler.
 * Koffi queues callbacks from the console thread onto the JavaScript thread.
 * The registration lasts until process exit; unknown events retain native handling.
 * @returns Completion once the console handler is registered.
 */
export declare function installWindowsCliSignals(): Promise<void>;
//# sourceMappingURL=windows-cli-signals.d.ts.map