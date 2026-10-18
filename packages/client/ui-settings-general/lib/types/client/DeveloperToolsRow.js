import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** General Settings control for shared developer-tool visibility and previews. */
import { useState } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './DeveloperToolsRow.module.css';
/**
 * Render the developer-tool toggle.
 * @param props - accepted preference, writer and localized copy.
 * @returns the General Settings row.
 */
export function DeveloperToolsRow({ useDeveloperTools, setEnabled, t }) {
    const enabled = useDeveloperTools(value => value);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    return _jsxs("div", { className: css.row, children: [_jsxs("div", { children: [_jsx("div", { className: css.title, children: t('developerTools.title') }), _jsx("div", { className: css.description, children: t('developerTools.description') }), failed && _jsx("div", { role: "alert", children: t('developerTools.error') })] }), _jsx(Switch, { checked: enabled, disabled: busy, label: t('developerTools.title'), onChange: (next) => {
                    setFailed(false);
                    setBusy(true);
                    void setEnabled(next).catch(() => { setFailed(true); }).finally(() => { setBusy(false); });
                } })] });
}
//# sourceMappingURL=DeveloperToolsRow.js.map