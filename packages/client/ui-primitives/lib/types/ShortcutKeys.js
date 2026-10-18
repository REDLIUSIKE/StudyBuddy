import { jsx as _jsx } from "react/jsx-runtime";
/** Shared shortcut keycaps; callers supply the effective platform presentation. */
import css from './ShortcutKeys.module.css';
import clsx from 'clsx';
/**
 * Render one command's keycaps without owning binding defaults or localized copy.
 * @param props - effective key labels, presentation variant and optional interaction styling.
 * @returns unboxed keys by default, or tooltip keycaps with plus-separated combinations grouped together.
 */
export function ShortcutKeys({ keys, variant = 'plain', className }) {
    return _jsx("span", { className: clsx(css.keys, variant === 'tooltip' && css.tooltip, variant === 'tooltip' && keys.includes('+') && css.joined, className), children: keys.map((key, index) => _jsx("kbd", { className: key === '+' ? css.separator : css.key, children: key }, index)) });
}
//# sourceMappingURL=ShortcutKeys.js.map