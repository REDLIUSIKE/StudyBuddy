import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Read-only spreadsheet surface backed by browser-parsed workbook data. */
import { useEffect, useRef, useState } from 'react';
import { Workbook } from '@fortune-sheet/react';
import { Button, IconWarningTriangleOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import fortuneCss from '@fortune-sheet/react/dist/index.css?inline';
import { parseExcel } from "./parse.js";
import css from './ExcelBody.module.css';
const scopedStyles = `@scope ([data-excel-preview]) { ${fortuneCss} }`;
/**
 * Display stored spreadsheet values and formats without editing or recalculation.
 * Keep the mounted workbook sized to its preview pane.
 * @param props - Complete workbook bytes, limits, and locale.
 * @returns An isolated spreadsheet surface with cancellable loading.
 */
export function ExcelBody({ content, format, limits, t, loading }) {
    const data = content.kind === 'bytes' ? content.data : undefined;
    const [state, setState] = useState();
    const [attempt, setAttempt] = useState(0);
    const workbookRef = useRef(null);
    useEffect(() => {
        if (data === undefined)
            return;
        const controller = new AbortController();
        setState(undefined);
        void parseExcel(data, format, limits, controller.signal).then((value) => { if (!controller.signal.aborted)
            setState({ data, format, value }); }, (error) => { if (!controller.signal.aborted)
            setState({ data, format, error: error instanceof Error ? error.message : 'invalid' }); });
        return () => { controller.abort(); };
    }, [data, format, limits, attempt]);
    useEffect(() => {
        const element = workbookRef.current;
        if (element === null || typeof ResizeObserver === 'undefined')
            return;
        // FortuneSheet measures its canvas on window resize, but pane resizing does not emit that event.
        const observer = new ResizeObserver(() => { window.dispatchEvent(new Event('resize')); });
        observer.observe(element);
        return () => { observer.disconnect(); };
    }, [state]);
    if (data === undefined)
        return _jsx("p", { className: css.status, role: "alert", children: t('invalid') });
    if (state?.data !== data || state.format !== format)
        return loading;
    if ('error' in state)
        return _jsxs("div", { className: css.status, role: "alert", children: [_jsx("span", { children: t(state.error === 'tooLarge' || state.error === 'timeout' || state.error === 'encoding' ? state.error : 'invalid') }), _jsx(Button, { size: "sm", onClick: () => { setAttempt(value => value + 1); }, children: t('retry') })] });
    const hasFormulas = state.value.sheets.some(sheet => sheet.celldata?.some(cell => cell.v?.f !== undefined));
    return _jsxs("section", { className: css.body, "data-excel-preview": true, "aria-label": t('title'), children: [_jsx("style", { children: scopedStyles }), state.value.unsupportedFeatures.length > 0 && _jsxs("div", { className: css.notice, role: "note", "data-excel-unsupported-notice": true, children: [_jsx(IconWarningTriangleOutlineRegular, { size: 16 }), _jsx("span", { children: t('unsupportedNotice', { features: state.value.unsupportedFeatures.map(feature => t(feature)).join(t('featureSeparator')) }) })] }), _jsxs("div", { ref: workbookRef, className: `${css.workbook} ${hasFormulas ? css.withFormulaWarning : ''}`, children: [hasFormulas && _jsx(Tooltip, { portal: true, label: t('formulaWarning'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.formulaWarning, "aria-label": t('formulaWarning'), "data-excel-formula-warning": true, children: _jsx(IconWarningTriangleOutlineRegular, { size: 14 }) }) }), _jsx(Workbook, { data: state.value.sheets, lang: t('language'), allowEdit: false, showToolbar: false, showFormulaBar: true, showSheetTabs: true, forceCalculation: false, cellContextMenu: ['copy'], headerContextMenu: [], sheetTabContextMenu: [], filterContextMenu: [] }, `${attempt}:${t('language')}`)] })] });
}
//# sourceMappingURL=excel.js.map