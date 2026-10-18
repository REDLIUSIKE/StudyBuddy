/** Only explicitly safe main-process facts may be exposed as technical details. */
export class DesktopUpdatePreparationError extends Error {
    kind;
    technicalDetails;
    /**
     * @param kind - Stable preparation cause shared by native and Web presentations.
     * @param message - Locale-owned recovery guidance.
     * @param technicalDetails - Main-owned facts, excluding raw subprocess output and credentials.
     */
    constructor(kind, message, technicalDetails) {
        super(message);
        this.kind = kind;
        this.technicalDetails = technicalDetails;
    }
}
//# sourceMappingURL=update-error.js.map