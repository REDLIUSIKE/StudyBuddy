import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Localized cards for `cordis_stop` and `cordis_undefine`. */
import { IconInspectOutlineRegular, IconStopFillRegular, IconTrashOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { cordisActionCard } from "./card-model.js";
import css from './CordisRunRow.module.css';
import { CordisPreparingRow } from "./CordisPreparingRow.js";
/** Render one Stop or Remove call with Cordis-owned localized copy. */
export function CordisActionRow(props) {
    if (props.phase === 'preparing') {
        const remove = props.toolName === 'cordis_undefine';
        return _jsx(CordisPreparingRow, { ...props, icon: remove ? _jsx(IconTrashOutlineRegular, { size: 14 }) : _jsx(IconStopFillRegular, { size: 14 }), title: props.t(remove ? 'row.removeTitle' : 'row.stopTitle'), className: css.card, rowClassName: css.row, titleClassName: css.title });
    }
    return _jsx(StartedCordisActionRow, { ...props });
}
function StartedCordisActionRow({ callId, toolName, block, inspect, t }) {
    const card = cordisActionCard(block);
    const remove = toolName === 'cordis_undefine';
    const summary = card.errorSummary ?? card.pluginId ?? callId;
    return (_jsxs("div", { className: css.card, "data-tool": toolName, "data-state": card.state, children: [_jsxs("div", { className: css.row, children: [_jsx("span", { className: css.icon, children: remove ? _jsx(IconTrashOutlineRegular, { size: 14 }) : _jsx(IconStopFillRegular, { size: 14 }) }), _jsx("span", { className: css.title, children: t(remove ? 'row.removeTitle' : 'row.stopTitle') }), _jsx("span", { className: css.separator, "aria-hidden": true }), _jsx("span", { className: card.errorSummary === null ? css.summary : css.error, children: summary }), inspect !== undefined && (_jsx("button", { type: "button", className: css.inspect, "aria-label": t('action.inspect'), onClick: inspect, children: _jsx(IconInspectOutlineRegular, {}) }))] }), card.output !== null && _jsx("pre", { className: css.output, children: card.output })] }));
}
//# sourceMappingURL=CordisActionRow.js.map