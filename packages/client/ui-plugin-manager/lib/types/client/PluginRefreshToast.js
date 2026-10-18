import { jsx as _jsx } from "react/jsx-runtime";
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { noticeText } from "./presentation.js";
/**
 * Display refresh failures even after navigation leaves the Plugins panel.
 * @param props - shared notice hook, dismissal action, and locale seat.
 * @returns the refresh failure toast, or null for other notices.
 */
export function PluginRefreshToast({ usePluginManager, dismissNotice, t }) {
    const notice = usePluginManager(state => state.notice);
    if (notice?.kind !== 'refresh-failed')
        return null;
    return (_jsx(Toast, { text: noticeText(notice, t), icon: _jsx(IconWarningOutlineRegular, {}), onDone: dismissNotice }, notice.seq));
}
//# sourceMappingURL=PluginRefreshToast.js.map