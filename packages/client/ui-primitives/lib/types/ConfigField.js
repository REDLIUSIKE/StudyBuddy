import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Controlled configuration input shared by generated and custom forms. */
import { useId } from 'react';
import css from './ConfigField.module.css';
/** Render a field without owning its schema, draft, or persistence.
 * @param props Controlled field state and actions.
 * @returns A labelled input with reset and validation feedback.
 */
export function ConfigField(props) {
    const id = useId();
    return _jsxs("div", { className: css.field, children: [_jsxs("div", { className: css.head, children: [_jsx("label", { htmlFor: id, children: props.label }), props.overridden ? _jsx("button", { type: "button", disabled: props.disabled, onClick: props.onReset, children: props.labels.reset }) : null] }), props.choices.length > 0
                ? _jsxs("select", { id: id, value: props.value, disabled: props.disabled, "aria-invalid": props.invalid, onChange: (event) => { if (event.target.value === '')
                        props.onReset();
                    else
                        props.onChange(event.target.value); }, children: [_jsx("option", { value: "", children: props.labels.inherited }), props.choices.map(choice => _jsx("option", { value: choice, children: choice }, choice))] })
                : props.secret
                    ? _jsx("input", { id: id, type: "password", autoComplete: "new-password", value: props.value, disabled: props.disabled, "aria-invalid": props.invalid, onChange: (event) => { props.onChange(event.target.value); } })
                    : _jsx("textarea", { id: id, value: props.value, disabled: props.disabled, "aria-invalid": props.invalid, rows: Math.min(8, Math.max(1, props.value.split('\n').length)), onChange: (event) => { props.onChange(event.target.value); } }), props.invalid ? _jsx("p", { role: "status", children: props.labels.invalid }) : null] });
}
//# sourceMappingURL=ConfigField.js.map