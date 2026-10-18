import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** StudyBuddy product identity occupies the existing account seats. */
import { useRef, useState } from 'react';
import { Button, IconEllipsisOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium, Menu, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './AccountMenu.module.css';
export function StudyBuddyAccountMenu({ useStudybuddy, logout, checkUpdates, openSettings, wide, settingsShortcut }) {
    const account = useStudybuddy(value => value);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const trigger = useRef(null);
    return _jsxs("div", { className: css.root, children: [_jsx(Menu, { open: open, side: "top", portal: true, autoFocus: true, className: css.anchor, anchor: _jsxs("button", { ref: trigger, type: "button", className: css.trigger, "data-collapsed": !wide, "aria-label": "StudyBuddy \u8D26\u53F7", "aria-haspopup": "menu", "aria-expanded": open, onClick: () => { setOpen(value => !value); }, children: [_jsx(IconUserOutlineMedium, { size: 24 }), wide && _jsxs(_Fragment, { children: [_jsx("span", { className: css.label, children: account.account?.label ?? 'StudyBuddy' }), _jsx(IconEllipsisOutlineMedium, { size: 18 })] })] }), items: [
                    { id: 'settings', label: '设置', icon: _jsx(IconSettingsOutlineMedium, { size: 16 }), ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
                    { id: 'updates', label: '检查 StudyBuddy 更新', disabled: busy },
                    { id: 'logout', label: '退出 StudyBuddy 登录', disabled: busy },
                ], onClose: () => { setOpen(false); }, onSelect: (id) => {
                    setOpen(false);
                    if (id === 'settings') {
                        trigger.current?.focus();
                        openSettings();
                        return;
                    }
                    setBusy(true);
                    const operation = id === 'updates' ? checkUpdates() : logout();
                    void operation.then((value) => { setMessage(value.message ?? ''); }).catch(() => { setMessage('操作暂时无法完成，请重试。'); }).finally(() => { setBusy(false); });
                } }), message && _jsx(Toast, { text: message, onDone: () => { setMessage(''); } })] });
}
export function StudyBuddyAccountSection({ useStudybuddy, logout, checkUpdates }) {
    const account = useStudybuddy(value => value);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const action = (operation) => {
        setBusy(true);
        void operation().then((value) => { setMessage(value.message ?? ''); }).catch(() => { setMessage('操作暂时无法完成，请重试。'); }).finally(() => { setBusy(false); });
    };
    return _jsxs("section", { children: [_jsx("h2", { children: "StudyBuddy \u8D26\u53F7" }), _jsx("p", { children: account.account?.label ?? '登录状态正在恢复' }), _jsx(Button, { disabled: busy, onClick: () => { action(checkUpdates); }, children: "\u68C0\u67E5\u66F4\u65B0" }), _jsx(Button, { disabled: busy, onClick: () => { action(logout); }, children: "\u9000\u51FA\u767B\u5F55" }), _jsx("p", { role: "status", children: message || account.message })] });
}
//# sourceMappingURL=StudyBuddyAccount.js.map