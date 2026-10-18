import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Settings shell root: the sidebar-foot trigger row plus the centered modal
 * panel (figma 2552:26025, 760x500) with the section nav rail. The shell is
 * a pure composition face — slot-owned text (trigger label, panel title,
 * close label, sections) arrives from registrants through slots; accessible
 * names resolve from localized content (trigger: shell locale; dialog:
 * aria-labelledby the title node; close: visually-hidden slot text). Modal
 * open state and the active section id belong to the declared owner store;
 * the onboarding coordinator mounts exactly one ordered registrant while the
 * sessions-derived empty-Hero fact is active. Visible dialog chrome belongs
 * to the step, so a mounted-but-deciding step paints nothing here.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ConnectionIndicator, Tooltip, useModalLayer, IconAgentPresetOutlineMedium, IconArchiveOutlineMedium, IconCloseOutlineRegular, IconDataOutlineMedium, IconPersonalizationOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium, IconQuestionOutlineRegular, IconInfoOutlineRegular, IconPluginPinwheelOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './SettingsRoot.module.css';
import { DesktopUpdateIndicator } from "./DesktopUpdateIndicator.js";
const RECOVERY_CONFIRMATION_MS = 2_000;
/** Minimum visible time for the connecting pill; shorter attempts read as flicker. */
const CONNECTING_MIN_VISIBLE_MS = 800;
/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id) {
    if (id === 'account')
        return _jsx(IconUserOutlineMedium, { className: css.navIcon, size: 16 });
    if (id === 'help-feedback')
        return _jsx(IconQuestionOutlineRegular, { className: css.navIcon, size: 16 });
    if (id === 'about-studybuddy')
        return _jsx(IconInfoOutlineRegular, { className: css.navIcon, size: 16 });
    if (id === 'models')
        return _jsx(IconDataOutlineMedium, { className: css.navIcon, size: 16 });
    if (id === 'agent-presets')
        return _jsx(IconAgentPresetOutlineMedium, { className: css.navIcon, size: 16 });
    if (id === 'plugins')
        return _jsx(IconPersonalizationOutlineMedium, { className: css.navIcon, size: 16 });
    if (id === 'plugin-manager')
        return _jsx(IconPluginPinwheelOutlineRegular, { className: css.navIcon, size: 16 });
    if (id === 'labs')
        return _jsx("svg", { className: css.navIcon, width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "M9 3h6M10 3v6l-5.6 9.3A1.8 1.8 0 0 0 6 21h12a1.8 1.8 0 0 0 1.6-2.7L14 9V3M7.2 14h9.6" }) });
    if (id === 'archived-sessions')
        return _jsx(IconArchiveOutlineMedium, { className: css.navIcon, size: 16 });
    return _jsx(IconSettingsOutlineMedium, { className: css.navIcon, size: 16 });
}
/**
 * Body-portaled modal layer: full-viewport mask + centered panel. Close paths: the
 * header button, a mask click, and document-level Escape (mounted only while
 * open, so the listener lifetime is the panel's).
 */
function SettingsPanel({ rows, renderSlot, activeId, onSelect, onClose }) {
    // Entries can unmount underneath the requested id, so the render-time
    // projection falls back to the first row when the id is gone.
    const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id;
    const titleId = useId();
    const panel = useRef(null);
    useModalLayer(panel, true, onClose);
    // Portalled beside #root like the Modal primitive: a covering surface mounted
    // inside the root would precede the columns' chrome in document order, so a
    // chrome row that declares window drag after it would override its subtraction.
    // Beside the root, base.css's `body > :not(#root)` rule subtracts it instead.
    return createPortal((_jsxs("div", { className: css.overlay, role: "presentation", children: [_jsx("div", { className: css.mask, "aria-hidden": "true", onClick: onClose }), _jsxs("div", { ref: panel, tabIndex: -1, "data-shortcut-modal": "settings", className: css.panel, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, children: [_jsxs("nav", { className: css.nav, children: [_jsx("div", { className: css.navTitle, id: titleId, tabIndex: -1, "data-modal-autofocus": active === undefined ? '' : undefined, children: renderSlot('settings.header', {}) }), _jsx("div", { className: css.navList, children: rows.map(row => (_jsxs("button", { type: "button", className: clsx(css.navCell, row.id === active && css.active), "aria-current": row.id === active ? 'true' : undefined, "data-modal-autofocus": row.id === active ? '' : undefined, onClick: () => { onSelect(row.id); }, children: [navIcon(row.id), _jsx("span", { className: css.navLabel, children: row.label })] }, row.id))) })] }), _jsxs("div", { className: css.content, children: [_jsxs("div", { className: css.header, children: [_jsx("div", { className: css.actions, children: renderSlot('settings.action', {}) }), _jsxs("button", { type: "button", className: css.close, onClick: onClose, children: [_jsx(IconCloseOutlineRegular, { size: 14 }), _jsx("span", { className: css.hiddenLabel, children: renderSlot('settings.close', {}) })] })] }), _jsx("div", { className: css.options, children: active !== undefined && renderSlot('settings.section', { close: onClose }, { only: active }) })] })] })] })), document.body);
}
/**
 * Render the settings trigger and panel.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the settings shell element tree.
 */
export function SettingsRoot(props) {
    const { wide, reconnect, useConnectionState, useSections, useOnboardingSteps, useSessions, renderSlot, t, useDesktopUpdate, openDesktopUpdate, useStore, actions, useShortcuts, } = props;
    const { open, activeId } = useStore(state => state);
    const shortcut = useShortcuts(rows => rows.find(row => row.id === 'settings.open'));
    const { close, openSection } = actions;
    const [requestedOnboarding, setRequestedOnboarding] = useState();
    const [completedOnboarding, setCompletedOnboarding] = useState(() => new Set());
    const [showRecovery, setShowRecovery] = useState(false);
    const [holdConnecting, setHoldConnecting] = useState(false);
    const connectingShownAt = useRef(undefined);
    // The ledger tick keeps the nav rows fresh: registrants re-register with
    // freshly localized text on locale change, and the trigger/header/close
    // seats re-render through their own outlets' subscriptions.
    const rows = useSections(s => s);
    const desktopUpdate = useDesktopUpdate(state => state);
    const connectionState = useConnectionState(state => state);
    const previousConnectionState = useRef(connectionState);
    const onboardingSteps = useOnboardingSteps(s => s);
    const onboardingActive = useSessions((state) => {
        const main = Object.values(state.byId)
            .find(session => (session.retainedBy.mainView ?? 0) > 0);
        return state.phase === 'ready' && (main === undefined || main.blank);
    });
    const onboardingStep = requestedOnboarding !== undefined
        ? onboardingSteps.find(step => step.id === requestedOnboarding)
        : onboardingActive
            ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
            : undefined;
    useEffect(() => {
        if (onboardingActive)
            return;
        setCompletedOnboarding(new Set());
    }, [onboardingActive]);
    const onboardingStepSeen = useRef(onboardingStep);
    // An onboarding step owns the viewport and marks `#root` inert. The panel portals
    // beside `#root`, outside that mark, so a step that appears while the panel is open
    // takes the panel down rather than leaving it focusable behind the onboarding mask.
    useEffect(() => {
        const appeared = onboardingStepSeen.current === undefined && onboardingStep !== undefined;
        onboardingStepSeen.current = onboardingStep;
        if (appeared && open)
            close();
    }, [onboardingStep, open, close]);
    useLayoutEffect(() => {
        const previous = previousConnectionState.current;
        previousConnectionState.current = connectionState;
        if (connectionState !== 'connected') {
            setShowRecovery(false);
            return;
        }
        if (previous !== 'disconnected' && previous !== 'connecting')
            return;
        setShowRecovery(true);
    }, [connectionState]);
    // The confirmation window starts when the recovered pill becomes visible,
    // which the connecting minimum-visible hold can delay past the transition.
    useLayoutEffect(() => {
        if (!showRecovery || holdConnecting)
            return;
        const timeout = window.setTimeout(() => { setShowRecovery(false); }, RECOVERY_CONFIRMATION_MS);
        return () => { window.clearTimeout(timeout); };
    }, [showRecovery, holdConnecting]);
    useLayoutEffect(() => {
        if (connectionState === 'connecting') {
            connectingShownAt.current = Date.now();
            return;
        }
        const shownAt = connectingShownAt.current;
        if (shownAt === undefined)
            return;
        connectingShownAt.current = undefined;
        const remaining = CONNECTING_MIN_VISIBLE_MS - (Date.now() - shownAt);
        if (remaining <= 0)
            return;
        setHoldConnecting(true);
        const timeout = window.setTimeout(() => { setHoldConnecting(false); }, remaining);
        return () => {
            window.clearTimeout(timeout);
            setHoldConnecting(false);
        };
    }, [connectionState]);
    const completeOnboardingStep = useCallback((id) => {
        setRequestedOnboarding(undefined);
        setCompletedOnboarding((previous) => {
            if (previous.has(id))
                return previous;
            return new Set([...previous, id]);
        });
    }, []);
    let connectionIndicator;
    if (connectionState === 'connecting' || holdConnecting) {
        connectionIndicator = 'connecting';
    }
    else if (connectionState === 'disconnected') {
        connectionIndicator = 'disconnected';
    }
    else if (showRecovery) {
        connectionIndicator = 'recovered';
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: clsx(css.triggerRow, !wide && css.railRow), children: [renderSlot('settings.launcher', {
                        wide, settingsOpen: open, openSettings: actions.open,
                        ...(shortcut?.keys.length ? { settingsShortcut: { keys: shortcut.keys, aria: shortcut.aria } } : {}),
                        openOnboarding: (id) => { close(); setRequestedOnboarding(id); },
                    }, { fallback: _jsx(Tooltip, { disabled: open, label: t('trigger'), shortcutKeys: shortcut?.keys, children: _jsx("button", { type: "button", className: clsx(css.trigger, !wide && css.rail), "aria-label": t('trigger'), "aria-keyshortcuts": shortcut?.aria, "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => { actions.open(); }, children: renderSlot('settings.trigger', { wide }) }) }) }), _jsx(ConnectionIndicator, { state: wide && desktopUpdate.presentation?.phase !== 'installing' ? connectionIndicator : undefined, disconnectedLabel: t('connection.error'), connectingLabel: t('connection.connecting'), recoveredLabel: t('connection.connected'), reconnectActionLabel: t('connection.reconnect'), restartActionLabel: t('connection.restart'), onReconnect: reconnect }), _jsx(DesktopUpdateIndicator, { wide: wide, hidden: connectionIndicator !== undefined && desktopUpdate.presentation?.phase !== 'installing', t: t, view: desktopUpdate, onOpen: openDesktopUpdate })] }), open && (_jsx(SettingsPanel, { rows: rows, renderSlot: renderSlot, activeId: activeId, onSelect: actions.select, onClose: close })), onboardingStep !== undefined && renderSlot('settings.onboarding', {
                stepId: onboardingStep.id,
                explicit: requestedOnboarding !== undefined,
                complete: () => { completeOnboardingStep(onboardingStep.id); },
                openSection,
            }, { only: onboardingStep.id })] }));
}
//# sourceMappingURL=SettingsRoot.js.map