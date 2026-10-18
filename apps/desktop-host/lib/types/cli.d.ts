/** Public dsh commands using the immutable runtime carried by the Desktop installation. */
/**
 * Run the ordinary CLI with Desktop's bundled package manager and reserved-profile plugin access.
 * @param runtimeDir - Prepared or ASAR-contained production DSH package tree.
 * @param supportDir - Physical Desktop runtime directory containing the primary-runtime payload and Node launchers.
 * @returns Completion of the selected CLI command; profile plugins own their process lifetime.
 */
export declare function runDesktopCli(runtimeDir: string, supportDir: string): Promise<void>;
//# sourceMappingURL=cli.d.ts.map