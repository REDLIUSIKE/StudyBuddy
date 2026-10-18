/** XLSX parsing and FortuneSheet conversion without React or file-service dependencies. */
import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import { ExcelPreviewError } from "./error.js";
import { EXCEL_UNSUPPORTED_FEATURES, formatCell, initialSelection } from "./model.js";
import { XlsxPreviewArchive } from "./xlsx-archive.js";
const BORDER_STYLES = {
    thin: 1, hair: 2, dotted: 3, dashed: 4, dashDot: 5, dashDotDot: 6,
    double: 7, medium: 8, mediumDashed: 9, mediumDashDot: 10,
    mediumDashDotDot: 11, slantDashDot: 12, thick: 13,
};
const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
/**
 * Decode an XLSX into display cells, omitting drawings and retaining formulas without recalculation.
 * @param bytes - Complete borrowed workbook bytes.
 * @param limits - File and matrix allocation limits.
 * @returns Sheets ready for a read-only FortuneSheet workbook.
 */
export async function convertXlsx(bytes, limits) {
    const workbook = new ExcelJS.Workbook();
    let unsupportedFeatures;
    try {
        const archive = new XlsxPreviewArchive(bytes);
        const preview = archive.withoutDrawings();
        const input = preview.byteOffset === 0 && preview.byteLength === preview.buffer.byteLength
            ? preview.buffer : preview.buffer.slice(preview.byteOffset, preview.byteOffset + preview.byteLength);
        await workbook.xlsx.load(input, { ignoreNodes: ['drawing'] });
        unsupportedFeatures = archive.unsupportedFeatures;
    }
    catch (error) {
        throw new ExcelPreviewError('invalid', { cause: error });
    }
    if (!workbook.worksheets.some(sheet => sheet.state === 'visible'))
        throw new ExcelPreviewError('invalid');
    let area = 0;
    const colors = themeColors(workbook);
    let missingResults = 0;
    let active = false;
    const sheets = workbook.worksheets.map((worksheet, order) => {
        let row = 1;
        let column = 1;
        const include = (r, c) => {
            row = Math.max(row, r + 1);
            column = Math.max(column, c + 1);
            const sheetArea = row * column;
            if (!Number.isSafeInteger(sheetArea) || !Number.isSafeInteger(area + sheetArea) || area + sheetArea > limits.maxCells) {
                throw new ExcelPreviewError('tooLarge');
            }
        };
        const config = {
            merge: {}, rowlen: {}, columnlen: {}, rowhidden: {}, colhidden: {}, borderInfo: [],
        };
        const celldata = [];
        for (const range of worksheet.model.merges) {
            // ExcelJS normalizes merged ranges to two cell addresses.
            const [start, end] = range.split(':');
            const first = worksheet.getCell(start);
            const last = worksheet.getCell(end);
            const merge = {
                r: Number(first.row) - 1, c: Number(first.col) - 1,
                rs: Number(last.row) - Number(first.row) + 1, cs: Number(last.col) - Number(first.col) + 1,
            };
            include(merge.r + merge.rs - 1, merge.c + merge.cs - 1);
            config.merge[`${merge.r}_${merge.c}`] = merge;
        }
        // ExcelJS's declarations omit absent parsed collections and style fields.
        const columns = worksheet.columns;
        (columns ?? []).forEach((column, index) => {
            if (column.width !== undefined)
                config.columnlen[index] = columnPixels(column.width);
            if (column.hidden)
                config.colhidden[index] = 0;
        });
        worksheet.eachRow({ includeEmpty: true }, (row) => {
            const r = row.number - 1;
            const height = row.height;
            if (height !== undefined)
                config.rowlen[r] = height * 96 / 72;
            if (row.hidden)
                config.rowhidden[r] = 0;
            row.eachCell({ includeEmpty: true }, (cell) => {
                const c = Number(cell.col) - 1;
                include(r, c);
                const v = convertCell(cell, colors);
                if (v.f !== undefined && v.v === undefined)
                    missingResults += 1;
                if (cell.isMerged) {
                    v.mc = config.merge[`${r}_${c}`] ?? { r: Number(cell.master.row) - 1, c: Number(cell.master.col) - 1 };
                    if (cell.address !== cell.master.address) {
                        delete v.v;
                        delete v.m;
                        delete v.f;
                    }
                }
                celldata.push({ r, c, v });
                const border = cell.border;
                if (border !== undefined) {
                    const value = { row_index: r, col_index: c };
                    for (const [side, key] of [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r']]) {
                        const edge = border[side];
                        if (edge?.style !== undefined)
                            value[key] = { style: BORDER_STYLES[edge.style], color: colorOf(edge.color, colors) ?? '#000000' };
                    }
                    config.borderInfo.push({ rangeType: 'cell', value });
                }
            });
        });
        config.rowlen = withinBounds(config.rowlen, row);
        config.rowhidden = withinBounds(config.rowhidden, row);
        config.columnlen = withinBounds(config.columnlen, column);
        config.colhidden = withinBounds(config.colhidden, column);
        area += row * column;
        const view = worksheet.views?.[0];
        const visible = worksheet.state === 'visible';
        const status = visible && !active ? 1 : 0;
        active ||= visible;
        const sheet = {
            id: String(worksheet.id), name: worksheet.name, order, status, hide: visible ? 0 : 1,
            row, column,
            config, celldata, showGridLines: view?.showGridLines !== false,
            defaultRowHeight: worksheet.properties.defaultRowHeight * 96 / 72,
            luckysheet_select_save: initialSelection(config),
        };
        if (worksheet.properties.defaultColWidth !== undefined)
            sheet.defaultColWidth = columnPixels(worksheet.properties.defaultColWidth);
        if (view?.state === 'frozen' && (view.xSplit || view.ySplit)) {
            sheet.frozen = {
                type: view.xSplit && view.ySplit ? 'rangeBoth' : view.ySplit ? 'rangeRow' : 'rangeColumn',
                range: { row_focus: (view.ySplit || 0) - 1, column_focus: (view.xSplit || 0) - 1 },
            };
        }
        return sheet;
    });
    return { sheets, missingResults, unsupportedFeatures: EXCEL_UNSUPPORTED_FEATURES.filter(feature => unsupportedFeatures.has(feature)) };
}
function convertCell(cell, colors) {
    const font = cell.font;
    const alignment = cell.alignment;
    const result = fontStyle(font, colors);
    const bg = cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? colorOf(cell.fill.fgColor, colors) : undefined;
    if (bg !== undefined)
        result.bg = bg;
    if (alignment !== undefined) {
        if (alignment.horizontal !== undefined)
            result.ht = alignment.horizontal === 'center' ? 0 : alignment.horizontal === 'right' ? 2 : 1;
        result.vt = alignment.vertical === 'top' ? 1 : alignment.vertical === 'middle' ? 0 : 2;
        result.tb = alignment.wrapText ? '2' : '1';
        if (alignment.textRotation === 'vertical')
            result.tr = '3';
        else if (alignment.textRotation !== undefined)
            result.rt = alignment.textRotation;
    }
    const value = cell.value;
    let display = value;
    if (value !== null && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
        result.f = `=${cell.formula}`;
        // ExcelJS omits falsy caches from cell.value, while cell.result retains 0 and false.
        const cached = cell.result;
        display = cached;
    }
    const richText = richTextOf(display);
    if (richText !== undefined) {
        setRichText(result, richText, colors);
    }
    else if (display instanceof Date) {
        // FortuneSheet uses the 1900 date system; ExcelJS has already resolved the workbook epoch.
        result.v = display.getTime() / 86_400_000 + 25569;
    }
    else if (display !== null && typeof display === 'object') {
        const text = Reflect.get(display, 'text');
        const hyperlinkRichText = richTextOf(text);
        if (hyperlinkRichText !== undefined)
            setRichText(result, hyperlinkRichText, colors);
        else if (typeof text === 'string')
            result.v = text;
        else
            result.v = String(Reflect.get(display, 'error'));
    }
    else if (typeof display === 'string' || typeof display === 'number' || typeof display === 'boolean')
        result.v = display;
    return formatCell(result, cell.numFmt || 'General');
}
function richTextOf(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const source = Reflect.get(value, 'richText');
    if (!Array.isArray(source))
        return undefined;
    return source.map((item) => {
        const run = record(item);
        const font = run.font;
        return { text: String(run.text), font: typeof font === 'object' && font !== null ? font : undefined };
    });
}
function setRichText(result, runs, colors) {
    result.ct = { t: 'inlineStr', s: runs.map(run => ({ v: run.text, ...fontStyle(run.font, colors) })) };
    result.v = runs.map(run => run.text).join('');
}
function withinBounds(values, length) {
    const result = {};
    for (const [key, value] of Object.entries(values)) {
        const index = Number(key);
        if (index < length)
            result[index] = value;
    }
    return result;
}
function fontStyle(font, colors) {
    if (font === undefined)
        return {};
    const result = {
        bl: font.bold ? 1 : 0, it: font.italic ? 1 : 0, cl: font.strike ? 1 : 0,
        un: font.underline !== undefined && font.underline !== false && font.underline !== 'none' ? 1 : 0,
    };
    if (font.name !== undefined)
        result.ff = font.name;
    if (font.size !== undefined)
        result.fs = font.size;
    const fc = colorOf(font.color, colors);
    if (fc !== undefined)
        result.fc = fc;
    return result;
}
function columnPixels(width) { return Math.floor(width < 1 ? width * 12 : width * 7 + 5); }
function colorOf(color, themes) {
    if (color === undefined)
        return undefined;
    const rgb = color.argb?.slice(-6) ?? (color.theme === undefined ? undefined : themes[color.theme]);
    if (rgb === undefined || !/^[\da-f]{6}$/iu.test(rgb))
        return undefined;
    // ExcelJS retains OOXML tint even though its Color declaration omits it.
    const tint = Reflect.get(color, 'tint');
    if (typeof tint !== 'number' || tint === 0)
        return `#${rgb}`;
    return `#${[0, 2, 4].map((offset) => {
        const channel = Number.parseInt(rgb.slice(offset, offset + 2), 16);
        return Math.round(Math.max(0, Math.min(255, tint < 0 ? channel * (1 + tint) : channel * (1 - tint) + 255 * tint))).toString(16).padStart(2, '0');
    }).join('')}`;
}
function themeColors(workbook) {
    const themes = workbook.model.themes;
    const xml = record(themes).theme1;
    if (typeof xml !== 'string')
        return [];
    const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false }).parse(xml);
    const scheme = record(record(record(parsed).theme).themeElements).clrScheme;
    return THEME_ORDER.map((name) => {
        const color = record(record(scheme)[name]);
        const value = record(color.srgbClr)['@_val'] ?? record(color.sysClr)['@_lastClr'];
        return typeof value === 'string' ? value : undefined;
    });
}
function record(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
//# sourceMappingURL=xlsx.js.map