import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import css from './Band.module.css';
/** The terminal color names Claude Code's `Text` and `Box` accept; the stylesheet maps each to a theme token. */
const COLORS = new Set(['yellow', 'red', 'green', 'cyan', 'blue', 'magenta', 'gray', 'grey', 'white', 'black']);
function colorOf(value) {
    if (typeof value !== 'string' || !COLORS.has(value))
        return undefined;
    return value === 'grey' ? 'gray' : value;
}
function flag(value) {
    return value === true ? true : undefined;
}
function textAttributes(props) {
    return {
        'data-color': colorOf(props['color']),
        'data-bold': flag(props['bold']),
        'data-dim': flag(props['dimColor']),
        'data-italic': flag(props['italic']),
        'data-underline': flag(props['underline']),
    };
}
function boxStyle(props) {
    const style = {};
    const unit = (value) => typeof value === 'number' ? `${value * 4}px` : undefined;
    const paddingX = unit(props['paddingX'] ?? props['padding']);
    const paddingY = unit(props['paddingY'] ?? props['padding']);
    if (paddingX !== undefined)
        style.paddingLeft = style.paddingRight = paddingX;
    if (paddingY !== undefined)
        style.paddingTop = style.paddingBottom = paddingY;
    const gap = unit(props['gap']);
    if (gap !== undefined)
        style.gap = gap;
    const bordered = props['border'] !== undefined && props['border'] !== false;
    return {
        attributes: {
            'data-direction': props['flexDirection'] === 'row' ? 'row' : 'column',
            'data-border': bordered ? true : undefined,
            'data-color': bordered ? colorOf(props['borderColor']) : undefined,
        },
        style,
    };
}
function Node({ node, path, generation, pending, onPress, hotkeyLabel }) {
    if (typeof node === 'string')
        return _jsx(_Fragment, { children: node });
    const children = node.children.map((child, index) => (_jsx(Node, { node: child, path: `${path}.${index}`, generation: generation, pending: pending, onPress: onPress, hotkeyLabel: hotkeyLabel }, `${path}.${index}`)));
    if (node.type === 'Text')
        return _jsx("span", { className: css.text, ...textAttributes(node.props), children: children });
    if (node.type === 'Button') {
        const label = String(node.props['label']);
        const hotkey = typeof node.props['hotkey'] === 'string' ? node.props['hotkey'] : undefined;
        // A Button without an action id has no onPress: drawn, never pressable.
        const actionId = node.actionId ?? '';
        const disabled = node.props['disabled'] === true || actionId === '' || pending !== undefined;
        return (_jsxs("button", { type: "button", className: css.button, disabled: disabled, "aria-busy": pending === actionId, onClick: () => { onPress(actionId); }, children: [label, hotkey === undefined ? null : _jsx("span", { className: css.hotkey, children: hotkeyLabel(hotkey) })] }));
    }
    const { attributes, style } = boxStyle(node.props);
    return _jsx("div", { className: css.box, style: style, ...attributes, children: children });
}
/**
 * The band above the prompt: the session's current mod drawing, with buttons
 * that run their `onPress` on the Host. Hotkeys are shown as hints; a press is
 * a click.
 */
export function Band({ press, useBand, t }) {
    const snapshot = useBand(value => value);
    const [pending, setPending] = useState(undefined);
    const [notice, setNotice] = useState(undefined);
    if (snapshot === undefined || snapshot.tree === null)
        return null;
    const onPress = (actionId) => {
        setPending(actionId);
        setNotice(undefined);
        press(snapshot.generation, actionId).then(() => { setPending(undefined); }, (error) => {
            setPending(undefined);
            setNotice(t('press.failed', { message: error instanceof Error ? error.message : String(error) }));
        });
    };
    return (_jsxs("div", { className: css.band, role: "group", "aria-label": t('band'), "data-generation": snapshot.generation, children: [snapshot.tree.map((node, index) => (_jsx("span", { className: css.text, children: _jsx(Node, { node: node, path: String(index), generation: snapshot.generation, pending: pending, onPress: onPress, hotkeyLabel: hotkey => `[${hotkey}]` }) }, `${snapshot.generation}.${index}`))), notice === undefined ? null : _jsx("div", { className: css.notice, role: "status", children: notice })] }));
}
//# sourceMappingURL=Band.js.map