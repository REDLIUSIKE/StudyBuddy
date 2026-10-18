import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { CONVERSATION_NS } from "../../locale.js";
import { MEDIA_NS } from "../../generated-images/locale.js";
import { creativeProjectAction } from "../models/creative-project-model.js";
import { GenericToolCard } from "./GenericToolCard.js";
import css from './creative-project-row.module.css';
export function CreativeProjectRow(props) {
    const action = props.phase === 'result' && !props.block.isError ? creativeProjectAction(props.block.meta) : null;
    const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
    const open = async () => {
        if (!action || busy)
            return;
        setBusy(true);
        setFailed(false);
        try {
            const host = Reflect.get(window, 'studybuddy');
            if (!host?.capabilities?.openProject)
                throw Error('CAPABILITY_OPEN_UNAVAILABLE');
            await host.capabilities.openProject(action.id);
        }
        catch {
            setFailed(true);
        }
        finally {
            setBusy(false);
        }
    };
    return _jsxs(_Fragment, { children: [_jsx(GenericToolCard, { ...props }), action && _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", onClick: () => { void open(); }, disabled: busy, children: props.projectT(busy ? 'project.opening' : 'project.open') }), failed && _jsx("span", { role: "status", children: props.projectT('project.unavailable') })] })] });
}
export const creativeProjectToolview = { name: 'studybuddy-creative-project-toolview', inject: ['slots', 'locale'], apply(ctx) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'creative_project', locale: CONVERSATION_NS }, props => _jsx(CreativeProjectRow, { ...props, projectT: ctx.locale.bind(MEDIA_NS) })));
    } };
//# sourceMappingURL=creative-project-row.js.map