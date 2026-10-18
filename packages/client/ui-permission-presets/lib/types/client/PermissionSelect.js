import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { IconChevronDownOutlineRegular, Menu, PermissionIconAutoReviewRegular, PermissionIconFullAccessRegular, PermissionIconReadOnlyRegular, PermissionIconWorkspaceWriteRegular, RiskConfirmation, } from '@deepseek-ai/dsh-client-ui-primitives';
import { AUTO_REVIEW_PRESET as AUTO_REVIEW, displayPermissionPreset, FULL_ACCESS_PRESET as FULL_ACCESS, } from "./presentation.js";
import css from './PermissionSelect.module.css';
/* Permission glyphs follow currentColor so the trigger and menu rows tint the
   shared product artwork with their own text color. */
const permissionGlyphs = new Map([
    ['read-only', _jsx(PermissionIconReadOnlyRegular, {})],
    ['workspace-write', _jsx(PermissionIconWorkspaceWriteRegular, {})],
    [FULL_ACCESS, _jsx(PermissionIconFullAccessRegular, {})],
    [AUTO_REVIEW, _jsx(PermissionIconAutoReviewRegular, {})],
]);
/** Glyph for a permission option value; host-configured names outside the design set get none. */
function permissionGlyph(value) {
    return permissionGlyphs.get(value);
}
function permissionLabel(value, name, t) {
    if (value === AUTO_REVIEW)
        return t('auto.label');
    return displayPermissionPreset(value, name, key => t(key));
}
function optionBadge(value, t) {
    return value === AUTO_REVIEW ? t('auto.badge') : undefined;
}
/** Resolve locale-owned copy for the shipped Auto option; preserve host copy for other presets. */
function optionDescription(option, t) {
    return option.value === AUTO_REVIEW ? t('auto.description') : option.description;
}
export function PermissionSelect({ locked, select, usePermissionCatalog, useProjection, t, }) {
    const selection = useProjection('permissions');
    const catalog = usePermissionCatalog(state => state.value);
    const [pick, setPick] = useState(null);
    const [open, setOpen] = useState(false);
    const [confirmation, setConfirmation] = useState(null);
    const [acknowledged, setAcknowledged] = useState(false);
    useEffect(() => {
        if (!locked && selection !== undefined && catalog !== null
            && (confirmation === null || catalog.options.some(option => option.value === confirmation)))
            return;
        setOpen(false);
        setAcknowledged(false);
        setConfirmation(null);
    }, [catalog, confirmation, locked, selection]);
    if (selection === undefined || catalog === null)
        return null;
    const currentValue = pick !== null && catalog.options.some(option => option.value === pick)
        ? pick : selection.currentValue;
    const current = catalog.options.find(option => option.value === currentValue);
    const currentLabel = current === undefined
        ? permissionLabel(currentValue, currentValue, t)
        : permissionLabel(current.value, current.name, t);
    const busy = pick !== null || confirmation !== null;
    const items = catalog.options.map((option) => {
        const icon = permissionGlyph(option.value);
        const label = permissionLabel(option.value, option.name, t);
        const badge = optionBadge(option.value, t);
        return {
            id: option.value,
            label: badge === undefined
                ? label
                : (_jsxs("span", { className: css.optionLabel, "aria-label": `${label} ${badge}`, children: [_jsx("span", { className: css.optionLabelText, children: label }), _jsx("span", { className: css.badge, children: badge })] })),
            ...icon === undefined ? {} : { icon },
        };
    });
    const submit = (id) => {
        setPick(id);
        void select(id)
            .catch(() => false)
            .then(() => { setPick(null); });
    };
    const choose = (id) => {
        setOpen(false);
        if (id === selection.currentValue)
            return;
        if (id === FULL_ACCESS || id === AUTO_REVIEW) {
            setAcknowledged(false);
            setConfirmation(id);
            return;
        }
        submit(id);
    };
    const closeConfirmation = () => {
        setAcknowledged(false);
        setConfirmation(null);
    };
    const confirmSelection = (id) => {
        closeConfirmation();
        submit(id);
    };
    const confirmationTitle = confirmation === AUTO_REVIEW
        ? t('auto.confirm.title')
        : t('confirm.title');
    const confirmationDescription = confirmation === AUTO_REVIEW
        ? t('auto.confirm.description')
        : t('confirm.description');
    const confirmationAcknowledge = confirmation === AUTO_REVIEW
        ? t('auto.confirm.acknowledge')
        : t('confirm.acknowledge');
    const confirmationEnable = confirmation === AUTO_REVIEW
        ? t('auto.confirm.enable')
        : t('confirm.enable');
    return (_jsxs(_Fragment, { children: [_jsx(Menu, { open: open, items: items, selectedId: currentValue, onSelect: choose, onClose: () => { setOpen(false); }, side: "top", portal: true, anchor: _jsxs("button", { type: "button", className: css.trigger, "aria-label": t('mode', { name: currentLabel }), title: current === undefined ? undefined : optionDescription(current, t), disabled: locked || busy, onClick: () => { setOpen(!open); }, children: [permissionGlyph(currentValue) !== undefined && (_jsx("span", { className: css.triggerIcon, "aria-hidden": true, children: permissionGlyph(currentValue) })), _jsx("span", { className: css.triggerLabel, children: currentLabel }), _jsx("span", { className: clsx(css.chevron, open && css.chevronOpen), "aria-hidden": true, children: _jsx(IconChevronDownOutlineRegular, {}) })] }) }), confirmation !== null && (_jsx(RiskConfirmation, { open: true, title: confirmationTitle, description: confirmationDescription, acknowledgeLabel: confirmationAcknowledge, cancelLabel: t('confirm.cancel'), closeLabel: t('close'), confirmLabel: confirmationEnable, acknowledged: acknowledged, disabled: locked, onAcknowledgedChange: setAcknowledged, onCancel: closeConfirmation, onConfirm: () => { confirmSelection(confirmation); } }))] }));
}
//# sourceMappingURL=PermissionSelect.js.map