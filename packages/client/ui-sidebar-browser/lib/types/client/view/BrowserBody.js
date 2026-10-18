import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Common browser chrome; a presentation adapter attaches the page inside its content container. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconLinkOutlineRegular, IconRefreshOutlineRegular, Tooltip, IconRightUpOutlineRegular, SHIELD_OUTLINE_PATH, ICON_REGULAR_STROKE, } from '@deepseek-ai/dsh-client-ui-primitives';
import { emptyBrowserFrame } from "../browser/BrowserFrame.js";
import { currentBrowserTarget } from "../browser/BrowserPersistence.js";
import css from './Browser.module.css';
const EMPTY_FRAME = emptyBrowserFrame();
function SandboxPolicyIcon({ sandboxed }) {
    return (_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, children: [_jsx("path", { d: SHIELD_OUTLINE_PATH, stroke: "currentColor", strokeWidth: ICON_REGULAR_STROKE, strokeLinejoin: "round" }), sandboxed
                ? _jsx("path", { d: "M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z", fill: "currentColor" })
                : _jsx("path", { d: "M10.6074 4.40278L8.00975 6.99973L10.6074 9.59739L9.59736 10.6074L6.9997 8.00978L4.40274 10.6074L3.3927 9.59739L5.98966 6.99973L3.3927 4.40278L4.40274 3.39273L6.9997 5.98969L9.59736 3.39273L10.6074 4.40278Z", fill: "currentColor", transform: "translate(1.2 0.8)" })] }));
}
function useBrowserDraft(url, revision) {
    const [edit, setEdit] = useState();
    return [edit?.revision === revision ? edit.value : url ?? '',
        (value) => { setEdit({ revision, value }); }];
}
/** Render provider-neutral navigation state and optional controls. */
export function BrowserBody(props) {
    const { mount, loadUrl, restore, goBack, goForward, reload, setSandbox, useBrowserState, useStore, useTabInfo, t } = props;
    const { tab } = useTabInfo();
    useEffect(() => tab.actions.bindCommands({ refresh: () => { reload(tab.id); } }), [tab.actions, tab.id, reload]);
    const saved = useStore(state => state.byTab[tab.id]);
    const initial = useRef(saved);
    const initialUrl = useRef(tab.navigation.params?.url);
    const viewportId = useId();
    const [mountEpoch, setMountEpoch] = useState(0);
    const state = useBrowserState(tab.id);
    const frame = state?.frame ?? EMPTY_FRAME;
    const restoreTarget = state === undefined ? currentBrowserTarget(initial.current) : state.restoreTarget;
    const target = frame.target ?? restoreTarget;
    const [draft, setDraft] = useBrowserDraft(target?.url ?? initialUrl.current, state?.addressRevision ?? 0);
    useLayoutEffect(() => {
        const hide = mount({
            tabId: tab.id, signal: tab.signal, viewportId, applicationOrigin: window.location.origin,
            initial: initial.current, initialUrl: initialUrl.current,
            openTab: (url) => { tab.actions.openTab('browser', { params: { url }, revealIfOpened: false }); },
        });
        setMountEpoch(value => value + 1);
        return hide;
    }, [mount, tab.id, tab.signal, tab.actions, viewportId, props.actions]);
    const unknown = frame.address === 'unknown';
    const externalUrl = unknown ? undefined : target?.url;
    const sandboxed = frame.sandboxEnabled;
    const failure = state?.addressFailure;
    const error = frame.error;
    const submit = (event) => { event.preventDefault(); loadUrl(tab.id, draft); };
    return (_jsxs("div", { className: css.root, children: [_jsxs("form", { className: css.toolbar, onSubmit: submit, children: [_jsx("button", { type: "button", className: css.tool, "aria-label": t('back'), title: t('back'), disabled: !frame.canGoBack, onClick: () => { goBack(tab.id); }, children: _jsx(IconChevronLeftOutlineRegular, {}) }), _jsx("button", { type: "button", className: css.tool, "aria-label": t('forward'), title: t('forward'), disabled: !frame.canGoForward, onClick: () => { goForward(tab.id); }, children: _jsx(IconChevronRightOutlineRegular, {}) }), _jsx(Tooltip, { label: t('reload'), shortcutKeys: tab.refreshShortcut?.keys, side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('reload'), "aria-keyshortcuts": tab.refreshShortcut?.aria, disabled: target === undefined || mountEpoch === 0, onClick: () => { reload(tab.id); }, children: _jsx(IconRefreshOutlineRegular, {}) }) }), _jsxs("div", { className: css.addressBox, children: [_jsx("input", { className: [css.address, unknown ? css.addressUnknown : ''].join(' '), value: draft, "aria-label": t('address.placeholder'), placeholder: t('address.placeholder'), spellCheck: false, onChange: (event) => { setDraft(event.currentTarget.value); } }), unknown && _jsx("span", { className: css.addressChanged, children: t('address.changed') }), _jsx("button", { type: "submit", className: [css.tool, css.addressGo].join(' '), "aria-label": t('go'), title: t('go'), children: _jsx(IconLinkOutlineRegular, {}) })] }), _jsx("button", { type: "button", className: css.tool, "aria-label": t('external'), title: t('external'), disabled: externalUrl === undefined, onClick: externalUrl === undefined ? undefined : () => { window.open(externalUrl, '_blank', 'noopener,noreferrer'); }, children: _jsx(IconRightUpOutlineRegular, { size: 14 }) }), sandboxed !== undefined && _jsx("button", { type: "button", className: [css.tool, sandboxed ? '' : css.sandboxOff].join(' '), "aria-label": t(sandboxed ? 'sandbox.disable' : 'sandbox.enable'), title: t(sandboxed ? 'sandbox.disable' : 'sandbox.enable'), "aria-pressed": !sandboxed, onClick: () => { setSandbox(tab.id, !sandboxed); }, children: _jsx(SandboxPolicyIcon, { sandboxed: sandboxed }) })] }), sandboxed === false && _jsx("div", { className: css.sandboxWarning, role: "status", children: t('sandbox.warning') }), error !== undefined && _jsx("div", { className: css.failure, role: "status", children: error.code !== undefined && error.description !== undefined
                    ? t('load.failed.detail', { code: String(error.code), description: error.description })
                    : t('load.failed') }), failure !== undefined && _jsx("div", { className: css.failure, role: "alert", children: t(`error.${failure}`) }), _jsxs("div", { className: css.content, "aria-busy": frame.loading, children: [_jsx("div", { id: viewportId, className: css.viewport, "aria-label": t('type.label') }), restoreTarget !== undefined && _jsxs("section", { className: css.restore, "aria-label": t('restore.previous'), children: [_jsx("p", { className: css.restoreLabel, children: t('restore.previous') }), _jsx("p", { className: css.restoreTitle, children: restoreTarget.title }), _jsx("p", { className: css.restoreUrl, children: restoreTarget.url }), _jsx(Button, { variant: "primary", size: "sm", disabled: mountEpoch === 0, onClick: () => { restore(tab.id); }, children: t('restore.action') })] }), restoreTarget === undefined && (target === undefined || frame.loading) && error === undefined && _jsx("div", { className: css.placeholder, children: _jsx("div", { className: css.start, children: t(target === undefined ? 'start' : 'loading') }) })] }), unknown && _jsx("p", { className: css.limit, children: t('address.unknown') })] }));
}
//# sourceMappingURL=BrowserBody.js.map