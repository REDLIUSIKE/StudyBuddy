/** Structured PDF worker failures; the renderer's locale owns visible explanations. */
export class PdfWorkerFailure extends Error {
    /** Distinguishes Worker startup/transport failures from document parsing errors. */
    kind = 'worker';
    /** @param cause - native error or messageerror event, retained for diagnostics. */
    constructor(cause) {
        super(undefined, { cause });
        this.name = 'PdfWorkerFailure';
    }
}
//# sourceMappingURL=errors.js.map