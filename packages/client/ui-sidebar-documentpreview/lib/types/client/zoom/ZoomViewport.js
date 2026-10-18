import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Shared zoom viewport, gesture handling, anchoring, and fit-width measurement. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZoomControls } from "./ZoomControls.js";
import { FIT_WIDTH, MAX_FIXED_ZOOM, MIN_FIXED_ZOOM } from "./types.js";
import css from './ZoomViewport.module.css';
const PINCH_SETTLE_DELAY_MS = 120;
const CONTROLS_HIDE_DELAY_MS = 420;
const CONTROLS_REVEAL_HEIGHT_PX = 72;
function pointerAnchor(clientX, clientY) {
    const lookup = Reflect.get(document, 'elementFromPoint');
    if (typeof lookup !== 'function')
        return undefined;
    const hit = Reflect.apply(lookup, document, [clientX, clientY]);
    const surface = hit instanceof Element ? hit.closest('[data-document-zoom-surface]') : null;
    if (surface === null)
        return undefined;
    const bounds = surface.getBoundingClientRect();
    return { surface, x: clientX - bounds.left, y: clientY - bounds.top, clientX, clientY };
}
/** @returns an actual-size scale that only shrinks content wider than the viewport. */
export function fitWidthZoom(viewportWidth, intrinsicWidth, horizontalInset = 0) {
    if (intrinsicWidth === undefined || intrinsicWidth <= 0)
        return 1;
    return Math.min(1, Math.max(1, viewportWidth - horizontalInset) / intrinsicWidth);
}
/**
 * Keep zoom controls and trackpad gestures independent from document rendering.
 * @param props - renderer content, intrinsic width, tab preference, and localized labels.
 * @returns the owned scrollport and floating zoom controls.
 */
export function ZoomViewport(props) {
    const [viewportWidth, setViewportWidth] = useState(0);
    const [controlsVisible, setControlsVisible] = useState(false);
    const fitZoom = fitWidthZoom(viewportWidth, props.intrinsicWidth, props.horizontalInset);
    const zoom = props.preference.kind === 'fit-width' ? fitZoom : props.preference.scale;
    const zoomRef = useRef(zoom);
    const modeRef = useRef(props.preference.kind);
    const frame = useRef(null);
    const scrollport = useRef(null);
    const controls = useRef(null);
    const pinchTimer = useRef();
    const controlsHideTimer = useRef();
    const pointerInRevealZone = useRef(false);
    const controlsActive = useRef(false);
    const clearControlsHide = useCallback(() => {
        clearTimeout(controlsHideTimer.current);
        controlsHideTimer.current = undefined;
    }, []);
    const showControls = useCallback(() => {
        clearControlsHide();
        setControlsVisible(true);
    }, [clearControlsHide]);
    const scheduleControlsHide = useCallback(() => {
        clearControlsHide();
        if (pointerInRevealZone.current || controlsActive.current || pinchTimer.current !== undefined)
            return;
        controlsHideTimer.current = setTimeout(() => {
            controlsHideTimer.current = undefined;
            setControlsVisible(false);
        }, CONTROLS_HIDE_DELAY_MS);
    }, [clearControlsHide]);
    const handleControlsActive = useCallback((active) => {
        controlsActive.current = active;
        if (active)
            showControls();
        else
            scheduleControlsHide();
    }, [scheduleControlsHide, showControls]);
    const handlePointerMove = useCallback((event) => {
        const inRevealZone = event.pointerType === 'mouse'
            && event.clientY >= event.currentTarget.getBoundingClientRect().bottom - CONTROLS_REVEAL_HEIGHT_PX;
        pointerInRevealZone.current = inRevealZone;
        if (inRevealZone)
            showControls();
        else
            scheduleControlsHide();
    }, [scheduleControlsHide, showControls]);
    const handlePointerLeave = useCallback(() => {
        pointerInRevealZone.current = false;
        scheduleControlsHide();
    }, [scheduleControlsHide]);
    const attachFrame = useCallback((node) => {
        frame.current = node;
        node?.style.setProperty('--document-zoom', String(zoomRef.current));
    }, []);
    const attachScrollport = useCallback((node) => {
        scrollport.current = node;
        props.scrollportRef(node);
    }, [props.scrollportRef]);
    const showZoom = useCallback((next, clientX, clientY) => {
        const node = scrollport.current;
        const previous = zoomRef.current;
        next = Math.min(MAX_FIXED_ZOOM, Math.max(MIN_FIXED_ZOOM, next));
        if (next === previous)
            return previous;
        const bounds = node.getBoundingClientRect();
        const x = clientX === undefined ? node.clientWidth / 2 : clientX - bounds.left;
        const y = clientY === undefined ? node.clientHeight / 2 : clientY - bounds.top;
        const anchor = pointerAnchor(bounds.left + x, bounds.top + y);
        const previousScrollLeft = node.scrollLeft;
        const previousScrollTop = node.scrollTop;
        const ratio = next / previous;
        zoomRef.current = next;
        modeRef.current = 'fixed';
        frame.current?.setAttribute('data-document-zoom-mode', 'fixed');
        frame.current?.style.setProperty('--document-zoom', String(next));
        controls.current?.showZoom(next);
        if (anchor === undefined) {
            node.scrollLeft = (previousScrollLeft + x) * ratio - x;
            node.scrollTop = (previousScrollTop + y) * ratio - y;
        }
        else {
            const nextBounds = anchor.surface.getBoundingClientRect();
            node.scrollLeft += nextBounds.left + anchor.x * ratio - anchor.clientX;
            node.scrollTop += nextBounds.top + anchor.y * ratio - anchor.clientY;
        }
        return next;
    }, []);
    const setZoom = useCallback((next) => {
        clearTimeout(pinchTimer.current);
        pinchTimer.current = undefined;
        props.onPreference({ kind: 'fixed', scale: showZoom(next) });
    }, [props.onPreference, showZoom]);
    const fitWidth = useCallback(() => {
        clearTimeout(pinchTimer.current);
        pinchTimer.current = undefined;
        const node = frame.current;
        zoomRef.current = fitZoom;
        modeRef.current = 'fit-width';
        node?.setAttribute('data-document-zoom-mode', 'fit-width');
        node?.style.setProperty('--document-zoom', String(fitZoom));
        controls.current?.showZoom(fitZoom);
        props.onPreference(FIT_WIDTH);
    }, [fitZoom, props.onPreference]);
    useLayoutEffect(() => {
        const node = scrollport.current;
        const measure = () => { setViewportWidth(node.clientWidth); };
        measure();
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => { observer.disconnect(); };
    }, []);
    useEffect(() => {
        if (pinchTimer.current !== undefined)
            return;
        zoomRef.current = zoom;
        modeRef.current = props.preference.kind;
        frame.current?.setAttribute('data-document-zoom-mode', props.preference.kind);
        frame.current?.style.setProperty('--document-zoom', String(zoom));
        controls.current?.showZoom(zoom);
        props.onRenderZoom?.(zoom);
    }, [props.onRenderZoom, props.preference.kind, zoom]);
    useEffect(() => {
        const node = scrollport.current;
        const clearPendingPinch = () => {
            clearTimeout(pinchTimer.current);
            pinchTimer.current = undefined;
            clearControlsHide();
        };
        const wheel = (event) => {
            if (!event.ctrlKey || props.signal.aborted)
                return;
            event.preventDefault();
            showControls();
            const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? node.clientHeight : 1;
            const delta = Math.max(-40, Math.min(40, event.deltaY * unit));
            showZoom(zoomRef.current * Math.exp(-delta * 0.01), event.clientX, event.clientY);
            clearTimeout(pinchTimer.current);
            pinchTimer.current = setTimeout(() => {
                pinchTimer.current = undefined;
                props.onPreference({ kind: 'fixed', scale: zoomRef.current });
                scheduleControlsHide();
            }, PINCH_SETTLE_DELAY_MS);
        };
        node.addEventListener('wheel', wheel, { passive: false });
        props.signal.addEventListener('abort', clearPendingPinch, { once: true });
        return () => {
            node.removeEventListener('wheel', wheel);
            props.signal.removeEventListener('abort', clearPendingPinch);
            clearPendingPinch();
        };
    }, [clearControlsHide, props.onPreference, props.signal, scheduleControlsHide, showControls, showZoom]);
    return _jsxs("section", { ref: attachFrame, className: css.frame, "data-document-zoom-frame": true, "data-document-zoom-mode": modeRef.current, style: { '--document-zoom': zoomRef.current,
            '--document-zoom-reveal-height': `${String(CONTROLS_REVEAL_HEIGHT_PX)}px` }, onPointerMove: handlePointerMove, onPointerLeave: handlePointerLeave, children: [_jsx("div", { ref: attachScrollport, className: css.scrollport, "data-document-zoom-scrollport": true, children: props.children }), _jsx("div", { className: css.revealZone, "data-document-zoom-reveal-zone": true, "aria-hidden": "true" }), props.intrinsicWidth !== undefined && _jsx(ZoomControls, { ref: controls, zoom: zoomRef.current, fitWidth: modeRef.current === 'fit-width', labels: props.labels, visible: controlsVisible, onZoom: setZoom, onFitWidth: fitWidth, onActiveChange: handleControlsActive })] });
}
/** Shared surface class for actual-size and fit-width layout. */
export const zoomSurfaceClass = css.surface;
//# sourceMappingURL=ZoomViewport.js.map