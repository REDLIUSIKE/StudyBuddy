import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Body-portaled introduction with shared background interaction ownership. */
import { acquireOverlayInert } from "./overlay-inert.js";
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import css from './OnboardingSurface.module.css';
/**
 * Render a body-portaled onboarding stage and keep the application root inert
 * while mounted. Completion reveals the root beneath a fading stage;
 * native titlebar controls, dialogs, and account pages remain above the stage.
 * @param props.children - the step's page content, centered on the stage.
 * @param props.exiting - reveal the application while the owner retains the stage for its 180ms exit.
 * @returns the body-portaled overlay tree.
 */
export function OnboardingSurface({ children, exiting = false }) {
    const rootState = useRef(null);
    useLayoutEffect(() => {
        const appRoot = document.getElementById('root');
        if (appRoot === null)
            return;
        const releaseInert = acquireOverlayInert(appRoot);
        const previousOpacity = appRoot.style.opacity;
        rootState.current = { element: appRoot, opacity: previousOpacity };
        appRoot.style.opacity = '0';
        return () => {
            releaseInert();
            appRoot.style.opacity = previousOpacity;
            rootState.current = null;
        };
    }, []);
    useLayoutEffect(() => {
        const root = rootState.current;
        if (root !== null)
            root.element.style.opacity = exiting ? root.opacity : '0';
    }, [exiting]);
    return createPortal((_jsxs("div", { className: css.onboardingOverlay, "data-exiting": exiting || undefined, role: "presentation", children: [_jsx("div", { className: css.dragBand, "data-window-drag": true, "aria-hidden": "true" }), _jsx("div", { className: css.onboardingStage, children: children })] })), document.body);
}
//# sourceMappingURL=OnboardingSurface.js.map