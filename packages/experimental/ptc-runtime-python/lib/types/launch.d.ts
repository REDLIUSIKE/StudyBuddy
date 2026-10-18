/** Small interpreter entry point; bootstrap sources arrive on stdin before model execution. */
export declare const PYTHON_BOOTSTRAP_LOADER: string;
/**
 * Read shipped assets through the host filesystem, including packaged virtual files.
 * @returns Trusted sources encoded for the interpreter's stdin loader.
 */
export declare function bootstrapInput(): string;
//# sourceMappingURL=launch.d.ts.map