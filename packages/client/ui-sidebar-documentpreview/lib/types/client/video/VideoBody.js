import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Native video controls over authenticated, seekable file responses. */
import { useEffect, useRef, useState } from 'react';
import { fileMediaUrl, pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import { LoadingIndicator } from "../LoadingIndicator.js";
import css from './VideoBody.module.css';
/** Render a live addressed video, pausing and releasing it with its tab and Session surface. */
export function VideoBody({ content, resourceAddress, useResource, useTabInfo, t }) {
    const meta = useResource(resourceAddress), { tab } = useTabInfo();
    const request = content.kind === 'renderer' ? content : undefined;
    const absolutePath = meta.status === 'live' ? meta.value?.absolutePath : undefined;
    const version = meta.value?.version;
    const base = absolutePath === undefined ? undefined : fileMediaUrl(document.baseURI, absolutePath);
    const url = base === undefined ? undefined : new URL(base);
    url?.searchParams.set('media', 'video');
    url?.searchParams.set('revision', `${version ?? ''}:${request?.revision ?? 0}`);
    const source = url?.href;
    const video = useRef(null);
    const [state, setState] = useState('loading');
    useEffect(() => {
        const element = video.current;
        if (!element || !source || !request || tab.signal.aborted)
            return;
        setState('loading');
        const release = () => { element.pause(); element.removeAttribute('src'); element.load(); };
        const conceal = () => {
            let hidden = document.visibilityState === 'hidden';
            for (let parent = element; parent && !hidden; parent = parent.parentElement) {
                const style = getComputedStyle(parent);
                hidden = Boolean(parent.hidden) || parent.inert || parent.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden';
            }
            if (hidden)
                element.pause();
        };
        const observer = new MutationObserver(conceal);
        for (let parent = element; parent; parent = parent.parentElement) {
            observer.observe(parent, { attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'style', 'class'] });
        }
        element.addEventListener('play', conceal);
        document.addEventListener('visibilitychange', conceal);
        tab.signal.addEventListener('abort', release, { once: true });
        return () => {
            observer.disconnect();
            element.removeEventListener('play', conceal);
            document.removeEventListener('visibilitychange', conceal);
            tab.signal.removeEventListener('abort', release);
            release();
        };
    }, [source, tab.signal]);
    if (!request)
        return null;
    if (source === undefined || version === undefined || absolutePath === undefined)
        return _jsx(LoadingIndicator, { label: t('loading') });
    return _jsxs("div", { className: css.frame, "data-video-preview": true, children: [state === 'loading' && _jsx(LoadingIndicator, { label: t('loading') }), state === 'failed' && _jsx("p", { className: css.status, role: "alert", children: t('failed') }), _jsx("video", { ref: video, className: css.video, src: source, controls: true, preload: "metadata", playsInline: true, "aria-label": t('preview', { name: pathPartsOf(absolutePath).name }), onLoadedMetadata: () => { if (!tab.signal.aborted) {
                    setState('ready');
                    request.loaded(version);
                } }, onError: () => { if (!tab.signal.aborted) {
                    setState('failed');
                    request.failed();
                } } }, source)] });
}
//# sourceMappingURL=VideoBody.js.map