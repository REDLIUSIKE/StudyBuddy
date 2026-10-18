import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Button, IconDownloadOutlineRegular, IconEllipsisOutlineRegular, IconPaperPlaneOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { SessionLogDownloadDialog } from "./Dialog.js";
import css from './HeaderAction.module.css';
/**
 * Render the Session Header menu with download and optional feedback actions.
 * @param props - Session runtime, download controller, and localized copy.
 * @returns the persistent Header action and Session-scoped dialog.
 */
export function SessionLogDownloadHeaderAction(props) {
    const { sessionId, useSessionLogDownload, useFeedbackAvailable, request, openFeedback, t } = props;
    const feedbackAvailable = useFeedbackAvailable(value => value);
    const entry = useSessionLogDownload(state => state.bySession[String(sessionId)]);
    const busy = entry?.status === 'downloading';
    const [open, setOpen] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsx(Menu, { open: open, align: "end", dense: true, onClose: () => { setOpen(false); }, items: [
                    { id: 'download', label: t('menu.download'), icon: _jsx(IconDownloadOutlineRegular, {}), disabled: busy },
                    ...feedbackAvailable ? [{ id: 'feedback', label: t('menu.feedback'), icon: _jsx(IconPaperPlaneOutlineRegular, {}) }] : [],
                ], onSelect: (id) => {
                    setOpen(false);
                    if (id === 'feedback')
                        openFeedback(sessionId);
                    else
                        void request(sessionId);
                }, anchor: (_jsx(Button, { size: "sm", className: css.moreButton, "aria-label": t('header.more'), "aria-haspopup": "menu", "aria-expanded": open, "aria-busy": busy, onClick: () => { setOpen(value => !value); }, children: _jsx(IconEllipsisOutlineRegular, {}) })) }), _jsx(SessionLogDownloadDialog, { ...props })] }));
}
//# sourceMappingURL=HeaderAction.js.map