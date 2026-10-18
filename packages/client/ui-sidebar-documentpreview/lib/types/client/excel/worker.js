/** One workbook per disposable parser Worker; formulas and external links are never executed. */
import { convertExcel } from "./convert.js";
import { ExcelPreviewError } from "./error.js";
globalThis.onmessage = (event) => {
    void convertExcel(event.data.bytes, event.data.format, event.data.limits).then((value) => { globalThis.postMessage({ ok: true, value }); }, (error) => { globalThis.postMessage({ ok: false, code: error instanceof ExcelPreviewError ? error.code : 'invalid' }); });
};
//# sourceMappingURL=worker.js.map