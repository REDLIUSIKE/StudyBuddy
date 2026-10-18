import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { currentBrowserTarget } from "../browser/BrowserPersistence.js";
import css from './Browser.module.css';
/** Browser icon and current host name. */
export function BrowserTitle({ useTabInfo, useStore }) {
    const { tab } = useTabInfo();
    const entry = useStore(state => currentBrowserTarget(state.byTab[tab.id]));
    return _jsxs(_Fragment, { children: [_jsx(IconGlobeOutlineRegular, { className: css.titleIcon }), entry?.title ?? tab.title] });
}
//# sourceMappingURL=BrowserTitle.js.map