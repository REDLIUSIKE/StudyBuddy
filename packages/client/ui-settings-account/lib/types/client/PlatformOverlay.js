import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Desktop Platform viewport; the native child owns remote content and credentials. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PlatformOverlay.module.css';
import { acquireOverlayInert } from "./overlay-inert.js";
/** @param props - native commands, localized copy, and return action. @returns full-window Platform container. */
export function PlatformOverlay({ bridge, page, backLabel, loadingLabel, failureLabel, retryLabel, onClose }) {
    const layer = useRef(null);
    const back = useRef(null);
    const viewport = useRef(null);
    const [attempt, setAttempt] = useState(0);
    const [status, setStatus] = useState('loading');
    // Restore inertness and focus in the layout cleanup, so a Modal mounted by the
    // same commit records the restored focus before it takes its own.
    useLayoutEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const background = Array.from(document.body.children).filter((element) => element instanceof HTMLElement && element !== layer.current).map(element => acquireOverlayInert(element));
        back.current?.focus();
        return () => {
            for (const release of background)
                release();
            if (previousFocus?.isConnected)
                previousFocus.focus();
        };
    }, []);
    // A retry or a destination change replaces the surface holding focus with the
    // loading state, so the return action takes it back on each attempt.
    useLayoutEffect(() => { back.current?.focus(); }, [page, attempt]);
    useEffect(() => {
        const element = viewport.current;
        let closed = false;
        const bounds = () => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const fail = () => { if (!closed)
            setStatus('failed'); };
        setStatus('loading');
        void bridge.open(page, bounds()).then(() => { if (!closed)
            setStatus('loaded'); }, fail);
        const observer = new ResizeObserver(() => { void bridge.setBounds(bounds()).catch(fail); });
        observer.observe(element);
        return () => {
            closed = true;
            observer.disconnect();
            void bridge.close().catch(() => {
                // Window teardown may remove the desktop IPC receiver before React unmounts.
            });
        };
    }, [bridge, page, attempt]);
    return createPortal(_jsxs("div", { ref: layer, className: css.overlay, role: "dialog", "aria-modal": "true", "aria-label": backLabel, children: [_jsx("header", { className: css.header, "data-window-drag": true, children: _jsxs("div", { className: css.controls, children: [_jsx("span", { className: css.trafficLights, "aria-hidden": "true" }), _jsxs("button", { ref: back, className: css.back, onClick: onClose, children: [_jsx(IconChevronLeftOutlineRegular, { size: 16 }), backLabel] })] }) }), _jsx("div", { ref: viewport, className: css.viewport, children: status !== 'loaded' && _jsx("div", { className: css.status, role: "status", "aria-label": status === 'loading' ? loadingLabel : undefined, children: status === 'failed' ? _jsxs(_Fragment, { children: [_jsx("span", { className: css.failure, children: failureLabel }), _jsx(Button, { variant: "outline", className: css.retry, onClick: () => { setAttempt(value => value + 1); }, children: retryLabel })] }) : _jsx("span", { className: css.spinner, "aria-hidden": "true" }) }) })] }), document.body);
}
//# sourceMappingURL=PlatformOverlay.js.map