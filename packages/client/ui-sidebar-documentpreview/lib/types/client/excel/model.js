/** Shared display cells, resource limits, and parser failure categories. */
import { update as formatNumber } from '@fortune-sheet/core';
/** Content categories reported in stable order when XLSX preview omits them. */
export const EXCEL_UNSUPPORTED_FEATURES = ['charts', 'images', 'shapes', 'conditionalFormatting'];
/**
 * Retain an addressable A1 selection, including an A1 merge.
 * @param config - Worksheet layout.
 * @returns The initial selection used when activating a worksheet.
 */
export function initialSelection(config) {
    const merge = config.merge?.['0_0'];
    return [{ row: [0, (merge?.rs ?? 1) - 1], column: [0, (merge?.cs ?? 1) - 1], row_focus: 0, column_focus: 0 }];
}
/**
 * Apply number formatting and default alignment without evaluating formulas.
 * @param cell - Owned display cell to complete.
 * @param numberFormat - Excel number format code.
 * @returns The same cell with its display text and value type.
 */
export function formatCell(cell, numberFormat) {
    if (cell.ht === undefined)
        cell.ht = typeof cell.v === 'number' ? 2 : typeof cell.v === 'boolean' ? 0 : 1;
    if (cell.ct === undefined)
        cell.ct = { fa: numberFormat, t: typeof cell.v === 'number' ? 'n' : typeof cell.v === 'boolean' ? 'b' : 's' };
    const formatted = typeof cell.v === 'number' ? formatNumber(numberFormat, cell.v) : cell.v;
    cell.m = formatted === undefined ? '' : String(formatted);
    return cell;
}
//# sourceMappingURL=model.js.map