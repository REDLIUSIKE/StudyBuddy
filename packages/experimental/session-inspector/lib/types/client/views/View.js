import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** One Sidebar Inspector with locally selected Chat and Session-log presentations. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InspectorTable } from "./InspectorTable.js";
import { InspectorChatRevealer } from "./chat-node/reveal.js";
import css from './inspector.module.css';
/** @param props - Session-bound sources. @returns One Inspector with an in-toolbar presentation selector. */
export function SessionInspectorView(props) {
    const [mode, setMode] = useState('session-log');
    const [picking, setPicking] = useState(false);
    const [pickFailed, setPickFailed] = useState(false);
    const [pickedRow, setPickedRow] = useState();
    const pickButton = useRef(null);
    const chat = mode === 'chat-node';
    const revealer = useMemo(() => new InspectorChatRevealer(props.chatRoot), [props.chatRoot]);
    useEffect(() => () => { revealer.dispose(); }, [revealer, mode]);
    const typeOf = useCallback((key) => props.recordType(key, mode), [props.recordType, mode]);
    const revealChat = useCallback((target) => {
        revealer.reveal(props.resolveChatTargets(target));
    }, [revealer, props.resolveChatTargets]);
    const navigation = useMemo(() => ({ reveal: revealChat,
        target: chat ? (key) => props.objects.row(key)?.target : props.logChatTarget,
    }), [chat, props.objects, props.logChatTarget, revealChat]);
    useEffect(() => {
        if (!picking || pickButton.current === null)
            return;
        revealer.dispose();
        const stopPicking = props.pickChat(pickButton.current, (target) => {
            const key = props.pickRow(target, mode);
            if (key === undefined) {
                setPickFailed(true);
                return false;
            }
            setPickedRow({ key });
            setPicking(false);
            setPickFailed(false);
            return true;
        }, () => { setPicking(false); setPickFailed(false); });
        if (stopPicking === undefined) {
            setPicking(false);
            setPickFailed(true);
        }
        return stopPicking;
    }, [picking, mode, props.pickChat, props.pickRow, revealer]);
    const selector = _jsxs("span", { className: css.modeControls, children: [_jsxs("select", { className: css.modeSelector, "aria-label": props.t('view.presentation'), value: mode, onChange: (event) => {
                    setPicking(false);
                    setPickFailed(false);
                    setPickedRow(undefined);
                    setMode(event.currentTarget.value === 'chat-node' ? 'chat-node' : 'session-log');
                }, children: [_jsx("option", { value: "session-log", children: props.t('view.sessionLog') }), _jsx("option", { value: "chat-node", children: props.t('view.chatNode') })] }), _jsx("button", { ref: pickButton, type: "button", className: css.pickButton, "aria-pressed": picking, "aria-label": props.t('picker.pick'), title: props.t(picking ? 'picker.cancel' : 'picker.pick'), onClick: () => { setPickFailed(false); setPicking(value => !value); }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", "aria-hidden": "true", children: [_jsx("circle", { cx: "8", cy: "8", r: "4.5" }), _jsx("path", { d: "M8 0v5M8 11v5M0 8h5M11 8h5" })] }) })] });
    return _jsx(InspectorTable, { title: props.t(chat ? 'view.chatNode' : 'view.sessionLog'), modeSelector: selector, pickedRow: pickedRow, notice: picking ? props.t(pickFailed ? 'picker.noMatch' : 'picker.instructions') : pickFailed ? props.t('picker.noChat') : undefined, useRows: chat ? props.useChatRows : props.useLogRows, useRecord: chat ? props.useChatRecord : props.useLogRecord, useSession: props.useSession, loadOlder: props.loadOlder, typeOf: typeOf, t: props.t, flash: chat, showTime: !chat, navigation: navigation, ...chat ? { objects: props.objects } : {} }, mode);
}
//# sourceMappingURL=View.js.map