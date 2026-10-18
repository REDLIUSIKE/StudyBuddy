import { jsx as _jsx } from "react/jsx-runtime";
import css from './CurrentVersionRow.module.css';
/**
 * Render the version embedded by the client build; partial builds without metadata omit the row.
 * @param props - runtime share and localized copy.
 * @returns the current release label, or nothing when build metadata is absent.
 */
export function CurrentVersionRow({ t }) {
    const version = process.env.DSH_CLIENT_VERSION;
    if (version === undefined)
        return null;
    return _jsx("div", { className: css.row, children: t('general.currentVersion', { version }) });
}
//# sourceMappingURL=CurrentVersionRow.js.map