import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Shared file and directory opener: one default action, application menu, and per-gesture feedback. */
import { useRef, useState } from 'react';
import { IconChevronDownOutlineRegular, IconFolderOpenOutlineRegular, IconRightUpOutlineRegular, Menu, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { useOpenFailureToast } from "./open-failure-toast.js";
import css from './OpenTargetButton.module.css';
/**
 * Serialize gestures and announce their failures through the initiating control's toast.
 * @param execute - target adapter that returns the failure to announce, or null.
 * @param t - localized control copy.
 * @returns the pending state, feedback, and guarded action callback.
 */
export function useOpenTargetGesture(execute, t) {
    const [pending, setPending] = useState(false);
    const inFlight = useRef(false);
    const { toast, show } = useOpenFailureToast();
    return {
        pending,
        toast,
        act: (operation) => {
            if (inFlight.current)
                return;
            inFlight.current = true;
            setPending(true);
            void execute(operation).then((failure) => {
                if (failure !== null)
                    show(t(`path.${failure}`));
            }).finally(() => { inFlight.current = false; setPending(false); });
        },
    };
}
/** One application image with a per-image fallback, shared by main and menu buttons. */
function ApplicationIcon({ source, size = 14 }) {
    const [failed, setFailed] = useState(false);
    return source === null || failed
        ? _jsx(IconRightUpOutlineRegular, { size: size })
        : _jsx("img", { src: source, width: size, height: size, className: css.appIcon, alt: "", draggable: false, onError: () => { setFailed(true); } });
}
/**
 * Render identical split buttons for files and directories. File reveal always
 * stays last; it is the default only when no application is registered.
 * @param props - target applications, default selection, and operations.
 * @returns the control and its transient failure feedback.
 */
export function OpenTargetButton(props) {
    const { applications, defaultId, kind, t } = props;
    const [menuOpen, setMenuOpen] = useState(false);
    const { pending, toast, act } = useOpenTargetGesture(props.execute, t);
    // Files open through an application whenever one is registered: the OS-marked
    // default when the Host reported one, else the first entry in the Shell's
    // preference order. Reveal is only promoted with no registered application, so
    // a missing default marker never hides the applications behind it.
    const preferred = kind === 'file'
        ? applications.find(app => app.id === defaultId) ?? applications[0]
        : applications.find(app => app.id === defaultId);
    const disabled = pending || props.busy === true || props.loading === true;
    const hasMenu = props.loading === true || props.failed || applications.length + (kind === 'file' ? 1 : 0) > 1;
    const revealDefault = kind === 'file' && preferred === undefined && props.loading !== true;
    const primaryLabel = preferred === undefined ? t('path.reveal') : t('open.title', { app: preferred.name });
    const run = (operation) => { setMenuOpen(false); act(operation); };
    const primary = () => {
        if (revealDefault) {
            run({ kind: 'reveal' });
            return;
        }
        // The Host's default marker is best effort. With none, request the application
        // this control names instead of letting the OS resolve the association again.
        if (preferred !== undefined && preferred.id !== defaultId) {
            run({ kind: 'application', id: preferred.id });
            return;
        }
        run({ kind: 'default' });
    };
    const icon = props.loading === true && preferred === undefined
        ? _jsx("span", { className: css.skeleton, "data-open-target-skeleton": true, "aria-hidden": "true", style: { width: props.prominent ? 18 : 13, height: props.prominent ? 18 : 13 } })
        : revealDefault
            ? _jsx(IconFolderOpenOutlineRegular, { size: props.prominent ? 18 : 13 })
            : _jsx(ApplicationIcon, { source: preferred?.icon ?? null, size: props.prominent ? 18 : 13 }, preferred?.icon);
    return (_jsxs(_Fragment, { children: [_jsx(Menu, { className: css.menuAnchor, open: menuOpen && !disabled && hasMenu, autoFocus: true, portal: true, dense: true, align: "end", onClose: () => { setMenuOpen(false); }, items: [
                    ...applications.map(app => ({
                        id: `app:${app.id}`,
                        icon: _jsx(ApplicationIcon, { source: app.icon }, app.icon),
                        label: app.id === preferred?.id ? t('path.appDefault', { app: app.name }) : app.name,
                    })),
                    ...(props.failed ? [{ id: 'unavailable', label: t('path.appsError'), disabled: true }] : []),
                ], footer: kind === 'file' ? [{
                        id: 'reveal', icon: _jsx(IconFolderOpenOutlineRegular, {}),
                        label: revealDefault ? t('path.appDefault', { app: t('path.reveal') }) : t('path.reveal'),
                    }] : [], onSelect: (id) => { run(id === 'reveal' ? { kind: 'reveal' } : { kind: 'application', id: id.slice(4) }); }, anchor: (_jsxs("div", { className: css.split, "data-open-target": kind, "data-size": props.prominent ? 'large' : 'compact', "data-open-path": kind === 'file' && !props.prominent ? '' : undefined, "data-state": disabled ? 'busy' : 'idle', children: [_jsx(Tooltip, { portal: true, label: primaryLabel, shortcutKeys: props.shortcut?.keys, side: "bottom", delayMs: 500, children: _jsxs("button", { type: "button", className: css.main, disabled: disabled, "aria-label": props.prominent ? undefined : primaryLabel, "aria-keyshortcuts": props.shortcut?.aria, "data-open-path-open": kind === 'file' && !props.prominent ? '' : undefined, "data-open-path-unpreviewable": props.prominent ? '' : undefined, onClick: primary, children: [icon, (props.prominent) && (revealDefault ? t('path.reveal') : t('path.open'))] }) }), hasMenu && _jsx("button", { type: "button", className: css.chevron, disabled: disabled, "aria-haspopup": "menu", "aria-expanded": menuOpen && !disabled, "aria-label": t('path.more'), "data-open-path-more": kind === 'file' && !props.prominent ? '' : undefined, onClick: () => {
                                if (!menuOpen)
                                    props.refresh?.();
                                setMenuOpen(value => !value);
                            }, children: _jsx(IconChevronDownOutlineRegular, { size: props.prominent ? 14 : 10 }) })] })) }), toast] }));
}
//# sourceMappingURL=OpenTargetButton.js.map