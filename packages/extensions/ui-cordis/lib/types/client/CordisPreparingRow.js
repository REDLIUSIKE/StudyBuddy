import { jsx as _jsx } from "react/jsx-runtime";
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives';
/* v8 ignore next -- Non-expandable rows never invoke DisclosureRow's required toggle callback. */
const noop = () => undefined;
/**
 * Render a Cordis-owned prefix without disclosure.
 * @param props - Cordis prefix, styling, and locale.
 * @returns the preparation row.
 */
export function CordisPreparingRow({ toolName, t, icon, title, className, rowClassName, titleClassName, }) {
    return _jsx("div", { "data-tool": toolName, "data-state": "preparing", "aria-label": t('a11y.preparing'), children: _jsx(DisclosureRow, { icon: icon, title: title, className: className, rowClassName: rowClassName, titleClassName: titleClassName, open: false, expandable: false, onToggle: noop, running: true }) });
}
//# sourceMappingURL=CordisPreparingRow.js.map