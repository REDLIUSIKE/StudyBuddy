import { jsx as _jsx } from "react/jsx-runtime";
/** Load the spreadsheet renderer only when a supported workbook is opened. */
import { lazy, Suspense } from 'react';
import { excelFormat } from "./format.js";
import { hostFileOf } from "../rpc.js";
import { LoadingIndicator } from "../LoadingIndicator.js";
const LoadedExcelBody = lazy(async () => ({ default: (await import("./excel.js")).ExcelBody }));
/**
 * Load the browser spreadsheet renderer for every registered format.
 * @param props - Complete file bytes and standard document seats.
 * @returns Localized loading state or Excel preview.
 */
export function LazyExcelBody(props) {
    const format = excelFormat(hostFileOf(props.resourceAddress).path);
    const loading = _jsx(LoadingIndicator, { label: props.t('loading') });
    return _jsx(Suspense, { fallback: loading, children: _jsx(LoadedExcelBody, { ...props, format: format, loading: loading }) });
}
//# sourceMappingURL=LazyExcelBody.js.map