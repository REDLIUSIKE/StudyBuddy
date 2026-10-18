import { jsx as _jsx } from "react/jsx-runtime";
// Switch: two-state toggle. `label` is required and has no default, so a render
// site cannot ship the control without an accessible name.
import clsx from 'clsx';
import css from './Switch.module.css';
/**
 * Render a toggle switch.
 * @param props.checked - the current state; the control is fully controlled.
 * @param props.onChange - called with the state the click asks for.
 * @param props.label - localized accessible name, owned by the render site.
 * @param props.disabled - whether the control refuses input; owners also set it
 * while a write is in flight, not only when a deployment locks the toggle.
 * @param props.title - localized hover text, typically why the toggle is locked.
 * @param props.className - extra class for layout placement.
 * @returns the switch element.
 */
export function Switch({ checked, onChange, label, disabled = false, title, className }) {
    return (_jsx("button", { type: "button", role: "switch", "aria-checked": checked, "aria-label": label, title: title, disabled: disabled, className: clsx(css.switch, className), onClick: () => { onChange(!checked); }, children: _jsx("span", { className: css.thumb }) }));
}
//# sourceMappingURL=Switch.js.map