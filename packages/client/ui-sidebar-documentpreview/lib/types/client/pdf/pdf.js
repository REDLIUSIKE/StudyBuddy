import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** PDF page presentation; binary content and tab information come from the document owner. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { renderPdfPage } from "./document.js";
import { openPdf } from "./runtime.js";
import { PdfWorkerFailure } from "./errors.js";
import { pdfTextRenderer } from "./text.js";
import css from './PdfBody.module.css';
const DEFAULT_PDF_VIEW = { page: 1 };
const FIT_WIDTH = { kind: 'fit-width' };
/**
 * Present a PDF with tab-local viewing preferences and component-owned rendering resources.
 * @param props - complete bytes, framework-owned tab/store/locale seats, and main-bundle loading content.
 * @returns the PDF reader.
 */
export function PdfBody(props) {
    const { tab } = props.useTabInfo();
    const view = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_PDF_VIEW);
    const data = props.content.kind === 'bytes' ? props.content.data : undefined;
    const [load, setLoad] = useState();
    const [attempt, setAttempt] = useState(0);
    const [pageWidth, setPageWidth] = useState();
    const [renderZoom, setRenderZoom] = useState(1);
    const { retainTab, actions, t, ZoomViewport, zoomSurfaceClass } = props;
    const preference = view.zoom ?? FIT_WIDTH;
    const labels = {
        controls: t('zoomControls'), menu: t('zoomMenu'), out: t('zoomOut'), into: t('zoomIn'),
        fitWidth: t('zoomFitWidth'), value: percent => t('zoomValue', { percent }),
    };
    const pageVisible = useCallback((page) => {
        actions.page(tab.id, page);
    }, [actions, tab.id]);
    const setPreference = useCallback((value) => {
        actions.zoom(tab.id, value);
    }, [actions, tab.id]);
    useEffect(() => { retainTab(tab.id, tab.signal); }, [retainTab, tab.id, tab.signal]);
    useEffect(() => {
        if (data === undefined || tab.signal.aborted)
            return;
        const lifetime = new AbortController();
        const signal = AbortSignal.any([lifetime.signal, tab.signal]);
        setLoad(undefined);
        const session = openPdf(data, signal, (error) => {
            if (!signal.aborted)
                setLoad({ kind: 'failed', data, error });
        });
        void session.document.then((document) => { if (!signal.aborted)
            setLoad({ kind: 'loaded', data, document }); }, (error) => { if (!signal.aborted)
            setLoad({ kind: 'failed', data, error }); });
        return () => {
            lifetime.abort();
            void session.dispose();
        };
    }, [data, tab.signal, attempt]);
    if (data === undefined)
        return _jsx("p", { className: css.status, role: "alert", children: t('unsupported') });
    if (load?.data !== data)
        return props.loading;
    if (load.kind === 'failed') {
        return _jsxs("div", { className: css.status, role: "alert", children: [_jsx("span", { children: failureText(load.error, t) }), _jsx(Button, { size: "sm", onClick: () => { setAttempt(value => value + 1); }, children: t('retry') })] });
    }
    const pages = _jsx("section", { className: css.body, "data-pdf-preview": true, children: Array.from({ length: load.document.numPages }, (_, index) => (_jsx(PdfPage, { document: load.document, page: index + 1, requested: index === 0 || view.page === index + 1, onVisible: pageVisible, signal: tab.signal, onWidth: index === 0 ? setPageWidth : undefined, zoom: renderZoom, zoomSurfaceClass: zoomSurfaceClass, t: t }, index))) });
    return _jsx(ZoomViewport, { preference: preference, intrinsicWidth: pageWidth, horizontalInset: 24, labels: labels, signal: tab.signal, scrollportRef: props.scrollportRef, onPreference: setPreference, onRenderZoom: setRenderZoom, children: pages });
}
function PdfPage({ document, page, requested: initiallyRequested, onVisible, signal, onWidth, zoom, zoomSurfaceClass, t }) {
    const host = useRef(null);
    const canvas = useRef(null);
    const text = useRef(null);
    const [width, setWidth] = useState();
    const [requested, setRequested] = useState(initiallyRequested);
    const [visible, setVisible] = useState(initiallyRequested);
    const renderedZoom = useRef();
    const pendingRender = useRef(Promise.resolve());
    const textTask = useRef();
    const [state, setState] = useState('loading');
    const [failure, setFailure] = useState();
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        // A zoomed canvas can remain visible after its narrower page wrapper has
        // scrolled out horizontally. Observe the displayed page once it is ready.
        const node = state === 'ready' ? canvas.current : host.current;
        if (typeof IntersectionObserver === 'undefined') {
            setRequested(true);
            setVisible(true);
            return;
        }
        let disposed = false;
        const observer = new IntersectionObserver((entries) => {
            if (disposed)
                return;
            const intersects = entries.some(entry => entry.isIntersecting);
            setVisible(intersects);
            if (!intersects)
                return;
            setRequested(true);
            onVisible(page);
        }, { rootMargin: '100% 0px' });
        observer.observe(node);
        return () => {
            disposed = true;
            observer.disconnect();
        };
    }, [page, onVisible, state]);
    useEffect(() => () => { textTask.current?.cancel(); }, []);
    useEffect(() => {
        if (!requested)
            return;
        setFailure(undefined);
        if (renderedZoom.current !== undefined && (!visible || renderedZoom.current === zoom))
            return;
        const node = canvas.current;
        const lifetime = new AbortController();
        const renderSignal = AbortSignal.any([lifetime.signal, signal]);
        let newText;
        // PDF.js shares a page proxy across renders; its cancelled task must finish
        // cleanup before another render starts. The displayed bitmap stays intact.
        pendingRender.current = pendingRender.current.then(async () => {
            renderSignal.throwIfAborted();
            const buffer = node.ownerDocument.createElement('canvas');
            try {
                const size = await renderPdfPage(document, page, buffer, renderSignal, window.devicePixelRatio * zoom, textTask.current === undefined ? (pdfPage, viewport) => {
                    newText = pdfTextRenderer(text.current)(pdfPage, viewport);
                    return newText;
                } : undefined);
                renderSignal.throwIfAborted();
                const context = node.getContext('2d');
                if (context === null)
                    throw new Error('PDF canvas has no 2D context');
                node.width = buffer.width;
                node.height = buffer.height;
                node.style.setProperty('--pdf-page-width', `${size.width}px`);
                node.style.setProperty('--pdf-page-height', `${size.height}px`);
                context.drawImage(buffer, 0, 0);
                textTask.current ??= newText;
                newText = undefined;
                renderedZoom.current = zoom;
                setWidth(size.width);
                onWidth?.(size.width);
                setState('ready');
            }
            finally {
                buffer.width = buffer.height = 0;
                newText?.cancel();
            }
        }).catch((error) => { if (!renderSignal.aborted)
            setFailure({ error }); });
        return () => { lifetime.abort(); newText?.cancel(); };
    }, [document, page, requested, visible, zoom, signal, attempt, onWidth]);
    return _jsxs("div", { ref: host, className: css.page, "data-pdf-page": page, children: [failure === undefined && state !== 'ready' && (requested
                ? _jsx("div", { className: css.placeholder, role: "status", "aria-label": t('rendering') })
                : _jsx("div", { className: css.placeholder })), failure !== undefined && _jsxs("div", { className: css.status, role: "alert", children: [_jsx("span", { children: failureText(failure.error, t) }), _jsx(Button, { size: "sm", onClick: () => { setAttempt(value => value + 1); }, children: t('retry') })] }), _jsxs("div", { className: `${css.surface} ${zoomSurfaceClass}`, "data-document-zoom-surface": true, style: { '--document-zoom-width': `${width ?? 0}px` }, hidden: state !== 'ready', children: [_jsx("canvas", { ref: canvas, className: css.canvas, role: "img", "aria-label": t('pageImage', { page }) }), _jsx("div", { ref: text, className: css.text, "data-pdf-text": true })] })] });
}
function failureText(error, t) {
    if (error instanceof PdfWorkerFailure)
        return t('workerFailed');
    if (error instanceof Error && error.name === 'PasswordException')
        return t('password');
    return t('failed', { message: error instanceof Error ? error.message : String(error) });
}
//# sourceMappingURL=pdf.js.map