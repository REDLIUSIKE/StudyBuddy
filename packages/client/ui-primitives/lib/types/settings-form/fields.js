import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The controls of a settings form. Each renders one field's label, its staged
 * text, whether saving would leave an override, and — when one stands — the
 * reset that stages a clear back to the composition layer. Nothing here
 * writes: a control reports what the user typed, and the form's save is the
 * single point where a draft becomes a document mutation.
 */
import { useState } from 'react';
import { IconInfoOutlineRegular } from "../icons/index.js";
import { Tag } from "../Tag.js";
import css from './fields.module.css';
/**
 * A staged value field. `numeric` only hints the keypad: which drafts a field
 * accepts is decided by its spec, so the control never silently rewrites what
 * the user typed.
 * @param props - the field's copy, its staged text, and the edit actions.
 * @returns the labelled control.
 */
export function SettingsValueField(props) {
    const [helpOpen, setHelpOpen] = useState(false);
    const helpId = `${props.id}-help`;
    const messageId = `${props.id}-message`;
    const hasMessage = props.invalid || Boolean(props.hint);
    const description = [hasMessage ? messageId : '', helpOpen ? helpId : ''].filter(Boolean).join(' ');
    return (_jsxs("div", { className: css.field, children: [_jsxs("div", { className: css.head, children: [_jsxs("div", { className: css.labelGroup, children: [_jsx("label", { className: css.label, htmlFor: props.id, children: props.label }), props.help !== undefined
                                ? (_jsx("button", { type: "button", className: css.helpButton, "aria-label": props.help.label, "aria-expanded": helpOpen, "aria-controls": helpId, onClick: () => { setHelpOpen(!helpOpen); }, children: _jsx(IconInfoOutlineRegular, { size: 12 }) }))
                                : null] }), props.overridden
                        ? (_jsxs("span", { className: css.badges, children: [_jsx(Tag, { tone: "neutral", children: props.overriddenLabel }), _jsx("button", { type: "button", className: css.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })] }))
                        : null] }), _jsx("input", { id: props.id, className: css.input, type: "text", ...props.numeric === true ? { inputMode: 'numeric' } : {}, ...props.invalid ? { 'aria-invalid': true } : {}, "aria-describedby": description || undefined, value: props.text, placeholder: props.placeholder ?? '', disabled: props.disabled, onChange: (event) => { props.onEdit(event.target.value); } }), hasMessage
                ? _jsx("p", { id: messageId, className: props.invalid ? css.invalid : css.hint, children: props.invalid ? props.invalidLabel : props.hint })
                : null, props.help !== undefined && helpOpen
                ? _jsx("div", { id: helpId, className: css.help, role: "region", "aria-label": props.help.label, children: props.help.content })
                : null] }));
}
/**
 * A write-only credential control. The value never rides a response, so the
 * control reports only whether one is configured and starts blank; a blank
 * draft writes nothing, which keeps the stored key rather than clearing it.
 * The control asks browsers not to autofill saved login passwords.
 * @param props - the field's copy, its staged text, and the configured state.
 * @returns the labelled control.
 */
export function SettingsSecretField(props) {
    return (_jsxs("div", { className: css.field, children: [_jsxs("div", { className: css.head, children: [_jsx("label", { className: css.label, htmlFor: props.id, children: props.label }), _jsx("span", { className: css.badges, children: _jsx(Tag, { tone: props.configured ? 'neutral' : 'quiet', children: props.stateLabel }) })] }), _jsx("input", { id: props.id, className: css.input, type: "password", autoComplete: "new-password", value: props.text, disabled: props.disabled, onChange: (event) => { props.onEdit(event.target.value); } }), _jsx("p", { className: css.hint, children: props.hint })] }));
}
//# sourceMappingURL=fields.js.map