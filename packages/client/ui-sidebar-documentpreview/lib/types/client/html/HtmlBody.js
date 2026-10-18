import { jsx as _jsx } from "react/jsx-runtime";
/** Static or interactive HTML in an opaque iframe, without parent application access. */
import { useEffect, useMemo, useState } from 'react';
import { LoadingIndicator } from "../LoadingIndicator.js";
import { createHtmlDocument } from "./bootstrap.js";
import { createBasicHtmlDocument } from "./basic-document.js";
import { packHtml } from "./pack.js";
import { createReadHtmlRelative } from "./read-relative.js";
import css from './HtmlBody.module.css';
/** One mounted file owns its root Blob; replacing content also replaces the browsing context. */
function HtmlFrame({ data, resourceAddress, readRelated, addResource, setResources, signal, frameName, t }) {
    const [frame, setFrame] = useState();
    useEffect(() => {
        const controller = new AbortController();
        const resources = new Set();
        const readRelative = createReadHtmlRelative(readRelated, resourceAddress, signal, (address) => {
            resources.add(address);
            addResource(address);
        });
        let url;
        void (async () => {
            try {
                const bundle = await packHtml(data, readRelative, controller.signal);
                controller.signal.throwIfAborted();
                const html = createHtmlDocument(bundle);
                url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                setFrame({ data, readRelated, url });
            }
            catch {
                if (!controller.signal.aborted)
                    setFrame({ data, readRelated, url: undefined });
            }
            finally {
                if (!controller.signal.aborted && !signal.aborted)
                    setResources([...resources]);
            }
        })();
        return () => {
            controller.abort();
            if (url !== undefined)
                URL.revokeObjectURL(url);
        };
    }, [data, readRelated, resourceAddress, addResource, setResources, signal]);
    if (frame?.data !== data || frame.readRelated !== readRelated) {
        return _jsx(LoadingIndicator, { label: t('loading') });
    }
    if (frame.url === undefined)
        return _jsx("p", { className: css.status, role: "alert", children: t('failed') });
    return _jsx("iframe", { name: frameName, className: css.frame, src: frame.url, sandbox: "allow-scripts", title: t('frame'), "data-html-preview": true }, frame.url);
}
/**
 * Render complete HTML with the standard file and tab hooks.
 * @param props - document bytes, hooks, related-file reader and locale.
 * @returns an isolated HTML document, or nothing for text delivery.
 */
export function HtmlBody({ content, resourceAddress, readRelated, useTabInfo, useInteractivePreview, addResource, setResources, t, }) {
    const interactivePreview = useInteractivePreview(value => value);
    const { tab } = useTabInfo();
    useEffect(() => {
        if (!interactivePreview)
            setResources([]);
    }, [interactivePreview, setResources]);
    if (content.kind !== 'bytes')
        return null;
    const frameName = `dsh-sidebar-html-${tab.id}`;
    if (!interactivePreview)
        return _jsx(BasicHtmlFrame, { data: content.data, frameName: frameName, t: t });
    return _jsx(HtmlFrame, { data: content.data, resourceAddress: resourceAddress, readRelated: readRelated, signal: tab.signal, frameName: frameName, addResource: addResource, setResources: setResources, t: t }, resourceAddress);
}
/** Static preview mounts a separate browsing context so a mode change retires running scripts. */
function BasicHtmlFrame({ data, frameName, t }) {
    const html = useMemo(() => {
        try {
            return createBasicHtmlDocument(data);
        }
        catch {
            // Malformed UTF-8 files cannot produce a document.
            return undefined;
        }
    }, [data]);
    if (html === undefined)
        return _jsx("p", { className: css.status, role: "alert", children: t('failed') });
    return _jsx("iframe", { name: frameName, className: css.frame, srcDoc: html, sandbox: "", title: t('frame'), "data-html-preview": true });
}
//# sourceMappingURL=HtmlBody.js.map