import { jsx as _jsx } from "react/jsx-runtime";
/** Load the PDF renderer only after a PDF body is mounted. */
import { lazy, Suspense } from 'react';
import { LoadingIndicator } from "../LoadingIndicator.js";
const LoadedPdfBody = lazy(async () => ({ default: (await import("./pdf.js")).PdfBody }));
/**
 * Suspend while the package-local PDF chunk arrives.
 * @param props - PDF body props supplied by the document slot.
 * @returns the deferred PDF renderer.
 */
export function LazyPdfBody(props) {
    const loading = _jsx(LoadingIndicator, { label: props.t('loading') });
    return _jsx(Suspense, { fallback: loading, children: _jsx(LoadedPdfBody, { ...props, loading: loading }) });
}
//# sourceMappingURL=LazyPdfBody.js.map