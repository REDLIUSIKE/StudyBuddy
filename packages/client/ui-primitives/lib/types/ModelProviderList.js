import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconPlusOutlineRegular } from "./icons/index.js";
import styles from './ModelProviderList.module.css';
/**
 * Render the native single-column provider list without settings or credential operations.
 * @param props - provider rows, including any owner-rendered setup card.
 * @returns the list with the native Models spacing.
 */
export function ModelProviderList({ children }) {
    return _jsx("ul", { className: styles.rows, children: children });
}
/**
 * Render one provider row with owner-supplied status and edit behavior.
 * @param props - display facts, localized labels and callbacks belonging to the caller.
 * @returns a native provider row; a configured credential does not imply model readiness.
 */
export function ModelProviderRow({ name, tag, credential, readiness, status, editLabel, editAccessibleLabel, editDisabled, onEdit, extraActions, children, }) {
    return _jsxs("li", { className: styles.rowCard, children: [_jsxs("div", { className: styles.rowHead, children: [_jsxs("div", { className: styles.rowSummary, children: [_jsxs("span", { className: styles.rowIdentity, children: [_jsx("span", { className: styles.rowName, children: name }), tag === undefined ? null : _jsx("span", { className: styles.rowTag, children: tag }), readiness !== undefined ? _jsx("span", { className: `${styles.credentialDot} ${styles['readiness_' + readiness.state]}`, "data-model-readiness": readiness.state, role: "img", "aria-label": readiness.label, title: readiness.label }) : credential === undefined ? null : _jsx("span", { className: `${styles.credentialDot} ${credential.configured ? styles.credentialDotConfigured : styles.credentialDotMissing}`, role: "img", "aria-label": credential.label, title: credential.label })] }), status === undefined ? null : _jsx("div", { className: styles.rowStatus, children: status })] }), _jsxs("span", { className: styles.rowActions, children: [_jsx("button", { type: "button", className: styles.editButton, "aria-label": editAccessibleLabel, disabled: editDisabled, onClick: onEdit, children: editLabel }), extraActions] })] }), children] });
}
/**
 * Render the original full-width dashed add entry.
 * @param props - localized text and native button attributes; the caller owns creation.
 * @returns the add row with the original plus icon and keyboard behavior.
 */
export function ModelProviderAddButton({ label, ...props }) {
    return _jsx("div", { className: styles.addActions, children: _jsxs("button", { ...props, type: "button", className: styles.addButton, children: [_jsx(IconPlusOutlineRegular, { size: 14 }), label] }) });
}
//# sourceMappingURL=ModelProviderList.js.map