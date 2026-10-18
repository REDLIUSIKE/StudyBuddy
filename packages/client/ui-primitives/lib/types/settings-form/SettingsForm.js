import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * One plugin's settings form as its page on the Plugins page shows it: the
 * read-only notice when the deployment stores settings read-only, the
 * plugin's controls, and the save that writes every staged edit. The page
 * draws the plugin's title and one-liner itself.
 *
 * Only a save writes. Leaving the page drops every staged edit, so the form
 * discards on unmount and offers no discard control. A form whose namespace
 * the Host stopped serving says so in place of its controls rather than
 * showing fields nothing would accept.
 */
import { useEffect, useRef } from 'react';
import css from './SettingsForm.module.css';
/**
 * Render one plugin's settings form.
 * @param props - the form's copy and state, its controls, and the save and discard actions.
 * @returns the form, or the unavailable line while the namespace is not served.
 */
export function SettingsForm(props) {
    const { state, labels } = props;
    const discard = useRef(props.onDiscard);
    discard.current = props.onDiscard;
    useEffect(() => () => { discard.current(); }, []);
    if (!state.available)
        return _jsx("p", { className: css.unavailable, role: "status", children: labels.unavailable });
    const blocked = !state.dirty || state.invalid || state.saving;
    return (_jsxs("div", { className: css.form, children: [!state.writable ? _jsx("p", { className: css.readOnly, role: "status", children: labels.readOnly }) : null, props.children, _jsxs("div", { className: css.footer, children: [state.failed ? _jsx("p", { className: css.failed, role: "status", children: labels.saveFailed }) : null, _jsx("button", { type: "button", className: css.save, disabled: blocked, onClick: props.onSave, children: state.saving ? labels.saving : labels.save })] })] }));
}
//# sourceMappingURL=SettingsForm.js.map