/** CSV and TSV parsing preserves every field as literal text. */
import Papa from 'papaparse';
import { ExcelPreviewError } from "./error.js";
import { formatCell, initialSelection } from "./model.js";
/**
 * Parse delimited UTF-8 or BOM-marked UTF-16 without type inference.
 * @param bytes - Borrowed complete file bytes.
 * @param format - Comma or tab-separated input.
 * @param limits - Maximum worksheet area.
 * @returns A single sheet with literal field values.
 */
export function convertDelimited(bytes, format, limits) {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    let text;
    try {
        text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    }
    catch (error) {
        throw new ExcelPreviewError('encoding', { cause: error });
    }
    const celldata = [];
    let row = 0;
    let column = 1;
    let failure;
    Papa.parse(text, {
        delimiter: format === 'csv' ? ',' : '\t', header: false, dynamicTyping: false, skipEmptyLines: false,
        step(result, parser) {
            row += 1;
            column = Math.max(column, result.data.length);
            if (result.errors.length > 0 || row * column > limits.maxCells) {
                failure = new ExcelPreviewError(result.errors.length > 0 ? 'invalid' : 'tooLarge');
                parser.abort();
                return;
            }
            result.data.forEach((value, c) => { celldata.push({ r: row - 1, c, v: formatCell({ v: value }, '@') }); });
        },
    });
    if (failure !== undefined)
        throw failure;
    return {
        sheets: [{ id: '1', name: format.toUpperCase(), order: 0, status: 1, hide: 0,
                row: Math.max(1, row), column, celldata, config: {}, luckysheet_select_save: initialSelection({}) }],
        missingResults: 0,
        unsupportedFeatures: [],
    };
}
//# sourceMappingURL=delimited.js.map