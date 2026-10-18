/** Locale-independent spreadsheet parser failure categories. */
export class ExcelPreviewError extends Error {
    code;
    /** @param code - User-actionable parser failure. */
    constructor(code, options) {
        super(code, options);
        this.code = code;
        this.name = 'ExcelPreviewError';
    }
}
//# sourceMappingURL=error.js.map