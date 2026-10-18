import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Product welcome flow; website authorization is owned by the desktop main process. */
import { useEffect, useRef, useState } from 'react';
import './studybuddy-welcome.css';
export function StudyBuddyWelcome({ api }) {
    const [state, setState] = useState({ phase: 'signed-out' });
    const [failed, setFailed] = useState(false);
    const [pending, setPending] = useState(null);
    const epoch = useRef(0);
    const command = useRef(0);
    const current = useRef(null);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        const initial = epoch.current;
        const off = api.subscribe((value) => { if (mounted.current) {
            ++epoch.current;
            setState(value);
            setFailed(false);
        } });
        void api.status().then((value) => {
            if (mounted.current && epoch.current === initial)
                setState(value);
        }).catch(() => { if (mounted.current && epoch.current === initial)
            setFailed(true); });
        return () => { mounted.current = false; ++command.current; off(); };
    }, [api]);
    const run = (kind) => {
        if (current.current === kind || kind !== 'cancel' && current.current !== null)
            return;
        const id = ++command.current;
        const revision = epoch.current;
        current.current = kind;
        setPending(kind);
        setFailed(false);
        void api[kind]().then((value) => {
            if (mounted.current && command.current === id && epoch.current === revision)
                setState(value);
        }).catch(() => { if (mounted.current && command.current === id)
            setFailed(true); }).finally(() => {
            if (mounted.current && command.current === id) {
                current.current = null;
                setPending(null);
            }
        });
    };
    const waiting = state.phase === 'waiting';
    const checkingRecovery = state.startupRecoveryFailed === true;
    const exiting = state.logoutPending === true;
    const starting = state.phase === 'starting' || pending === 'start' && !waiting || pending === 'logout';
    const done = state.phase === 'authenticated';
    const busy = starting || waiting;
    const title = done ? '登录成功' : checkingRecovery ? starting ? '正在检查登录状态…' : '登录状态检查失败'
        : exiting ? starting ? '正在退出登录…' : '退出尚未完成' : waiting ? '请完成登录' : starting ? state.message ?? '正在连接登录服务…'
            : state.phase === 'error' || failed ? '暂时无法登录' : '你的AI学习搭子';
    const description = done ? '正在进入 StudyBuddy…'
        : checkingRecovery ? '账号数据已保留，重新检查后将恢复原登录。'
            : exiting ? '确认设备撤销和本机清理后，即可重新登录。' : waiting ? '在授权窗口中登录。成功后窗口会自动关闭，并返回客户端。'
                : starting ? '请稍候，正在准备你的账号。' : '登录 StudyBuddy，继续你的学习与创作。';
    return _jsxs(_Fragment, { children: [_jsx("div", { className: "titlebar", "aria-hidden": "true" }), _jsxs("main", { className: "studybuddy-login", "aria-labelledby": "studybuddy-login-heading", children: [_jsx("img", { className: "studybuddy-login-brand", src: "assets/studybuddy-wordmark-v4-1x.png", srcSet: "assets/studybuddy-wordmark-v4-1x.png 1x, assets/studybuddy-wordmark-v4-2x.png 2x", alt: "StudyBuddy \u7845\u57FA\u540C\u684C" }), _jsxs("section", { className: "studybuddy-login-content", "aria-live": "polite", children: [_jsx("h1", { id: "studybuddy-login-heading", children: title }), _jsx("p", { children: description }), _jsx("p", { className: "studybuddy-login-status", role: "status", children: failed ? checkingRecovery ? '状态检查暂时不可用，请重新检查。' : exiting ? '退出服务暂时不可用，请重试退出。' : '登录服务暂时不可用，请重试。' : state.phase === 'error' || waiting || state.logoutOutcome?.persistentCleanupRequired ? state.message ?? '' : '' })] }), _jsxs("div", { className: "studybuddy-login-actions", children: [_jsx("button", { className: "primary", type: "button", disabled: starting || done || pending === 'cancel', onClick: () => { run(exiting && !checkingRecovery ? 'logout' : 'start'); }, children: done ? '正在打开…' : checkingRecovery ? starting ? '正在检查…' : '重新检查' : exiting ? starting ? '正在退出…' : '重试退出登录' : starting ? '请稍候…' : waiting ? '返回登录窗口' : state.phase === 'error' || failed ? '重新登录' : '登录 StudyBuddy' }), busy && !exiting && _jsx("button", { className: "secondary", type: "button", disabled: pending === 'cancel', onClick: () => { run('cancel'); }, children: pending === 'cancel' ? '正在取消…' : '取消登录' }), !busy && !done && !exiting && _jsx("p", { className: "studybuddy-login-footnote", children: "\u6388\u6743\u5B8C\u6210\u540E\u81EA\u52A8\u8FD4\u56DE\u5BA2\u6237\u7AEF" })] })] })] });
}
//# sourceMappingURL=StudyBuddyWelcome.js.map