import type { Context } from '@deepseek-ai/cordis';
/** Private controller installed once for the actual Host process lifetime. */
export interface BuiltinHostControl {
    readonly hostGeneration: string;
    command(action: unknown, data: unknown): Promise<unknown>;
    admissionResult(message: unknown): void;
    platformAdmissionResult(message: unknown): void;
    mediaResult(message: unknown): void;
}
/** Construct exact native source routing and its only private IPC authority.
 * @param ctx - Shipped Host services; the initiator boundary establishes conversation trust.
 * @param send - Private Node IPC delivery to Electron Main.
 * @returns Controls inaccessible to API Gateway or renderer requests. */
export declare function installBuiltinHostControl(ctx: Context, send: (message: object) => Promise<void>): BuiltinHostControl;
/** Stable public error only; private source material and SDK errors never cross controls.
 * @param value - Caught private control failure.
 * @returns A secret-free built-in error code. */
export declare function builtinControlError(value: unknown): string;
//# sourceMappingURL=studybuddy-builtin-models.d.ts.map