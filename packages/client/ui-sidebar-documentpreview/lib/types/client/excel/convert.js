import { ExcelPreviewError } from "./error.js";
import { convertXlsx } from "./xlsx.js";
import { convertXls } from "./xls.js";
import { convertDelimited } from "./delimited.js";
/**
 * Decode spreadsheet bytes without recalculating saved formulas.
 * @param bytes - Borrowed complete file bytes.
 * @param format - Format selected by the registered filename suffix.
 * @param limits - File and matrix allocation limits.
 * @returns Display sheets and missing formula-cache count.
 */
export async function convertExcel(bytes, format, limits) {
    if (bytes.byteLength > limits.maxBytes)
        throw new ExcelPreviewError('tooLarge');
    if (format === 'xlsx')
        return convertXlsx(bytes, limits);
    if (format === 'xls')
        return convertXls(bytes, limits);
    return convertDelimited(bytes, format, limits);
}
//# sourceMappingURL=convert.js.map