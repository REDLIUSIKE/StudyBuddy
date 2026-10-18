import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Complete image bytes rendered in a shared zoom viewport. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import { LoadingIndicator } from "../LoadingIndicator.js";
import { hostFileOf } from "../rpc.js";
import { ZoomViewport, zoomSurfaceClass } from "../zoom/ZoomViewport.js";
import { DEFAULT_ZOOM } from "../zoom/store.js";
import css from './ImageBody.module.css';
const IMAGE_MEDIA_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
};
/**
 * Resolve a supported filename to the media type assigned to its Blob.
 * @param path - decoded workspace file path.
 * @returns the image media type, or undefined for an unregistered suffix.
 */
export function imageMediaType(path) {
    const normalized = path.replaceAll('\\', '/');
    const name = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
    const extension = name.slice(name.lastIndexOf('.') + 1);
    return IMAGE_MEDIA_TYPES[extension];
}
/**
 * Present complete image bytes with fit-width and fixed-scale viewing.
 * @param props - document bytes, resource identity, and locale.
 * @returns a rounded image fitted or scaled at its intrinsic aspect ratio.
 */
export function ImageBody(props) {
    const { content, resourceAddress, t } = props;
    const { tab } = props.useTabInfo();
    const preference = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_ZOOM);
    const path = useMemo(() => hostFileOf(resourceAddress).path, [resourceAddress]);
    const mediaType = imageMediaType(path);
    const data = content.kind === 'bytes' ? content.data : undefined;
    const [source, setSource] = useState();
    const setPreference = useCallback((value) => {
        props.actions.zoom(tab.id, value);
    }, [props.actions, tab.id]);
    useEffect(() => { props.retainTab(tab.id, tab.signal); }, [props.retainTab, tab.id, tab.signal]);
    useEffect(() => {
        if (data === undefined || mediaType === undefined)
            return;
        let url;
        try {
            url = URL.createObjectURL(new Blob([data], { type: mediaType }));
            setSource({ kind: 'ready', data, mediaType, url });
        }
        catch {
            setSource({ kind: 'failed', data, mediaType });
        }
        return () => {
            if (url !== undefined)
                URL.revokeObjectURL(url);
        };
    }, [data, mediaType]);
    if (data === undefined || mediaType === undefined) {
        return _jsx("p", { className: css.status, role: "alert", children: t('unsupported') });
    }
    if (source?.data !== data || source.mediaType !== mediaType) {
        return _jsx(LoadingIndicator, { label: t('loading') });
    }
    if (source.kind === 'failed')
        return _jsx("p", { className: css.status, role: "alert", children: t('failed') });
    const { name } = pathPartsOf(path);
    const labels = {
        controls: t('zoomControls'), menu: t('zoomMenu'), out: t('zoomOut'), into: t('zoomIn'),
        fitWidth: t('zoomFitWidth'), value: percent => t('zoomValue', { percent }),
    };
    return _jsx(LoadedImage, { url: source.url, name: name, preference: preference, onPreference: setPreference, labels: labels, signal: tab.signal, scrollportRef: props.scrollportRef, t: t }, source.url);
}
/** SVG stays in the browser's static image mode because its bytes only reach an img Blob URL. */
function LoadedImage({ url, name, preference, onPreference, labels, signal, scrollportRef, t }) {
    const [state, setState] = useState('loading');
    const [width, setWidth] = useState();
    return _jsx(ZoomViewport, { preference: preference, intrinsicWidth: width, horizontalInset: 24, labels: labels, signal: signal, scrollportRef: scrollportRef, onPreference: onPreference, children: _jsxs("div", { className: css.frame, "data-image-preview": true, children: [state === 'loading' && _jsx(LoadingIndicator, { label: t('loading') }), state === 'failed' && _jsx("p", { className: css.status, role: "alert", children: t('failed') }), _jsx("div", { className: `${css.surface} ${zoomSurfaceClass}`, "data-document-zoom-surface": true, style: { '--document-zoom-width': `${width ?? 0}px` }, hidden: state !== 'ready', children: _jsx("img", { className: css.image, src: url, alt: t('preview', { name }), decoding: "async", draggable: false, referrerPolicy: "no-referrer", onLoad: (event) => { setWidth(event.currentTarget.naturalWidth); setState('ready'); }, onError: () => { setState('failed'); } }) })] }) });
}
//# sourceMappingURL=ImageBody.js.map