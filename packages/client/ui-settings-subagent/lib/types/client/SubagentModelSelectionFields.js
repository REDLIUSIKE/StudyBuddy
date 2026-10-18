import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** User control for model-selectable subagent delegation in new sessions. */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './SubagentModelSelectionFields.module.css';
/**
 * Render the default-off preference and its exact adapter-route choices.
 * @param props - locale copy, the card snapshot, and its toggle action.
 * @returns the model permission and route choices inside the shared card.
 */
export function SubagentModelSelectionFields(props) {
    const { t, state } = props;
    const availableGroups = new Map();
    const unavailable = [];
    for (const candidate of state.candidates) {
        if (!candidate.available) {
            unavailable.push(candidate);
            continue;
        }
        const group = availableGroups.get(candidate.provider);
        if (group === undefined) {
            availableGroups.set(candidate.provider, {
                providerName: candidate.providerName,
                candidates: [candidate],
            });
        }
        else {
            group.candidates.push(candidate);
        }
    }
    const renderCandidate = (candidate) => (_jsxs("label", { className: css.model, children: [_jsx("input", { type: "checkbox", checked: candidate.selected, disabled: !state.writable || state.saving, onChange: () => { props.toggleModel(candidate.key); } }), _jsxs("span", { children: [_jsx("span", { className: css.modelName, children: candidate.modelName }), _jsx("span", { className: css.route, children: `${candidate.providerName} · ${candidate.provider}/${candidate.model}` })] }), !candidate.available
                ? _jsx("span", { className: css.unavailable, children: t('subagentModelSelectionUnavailable') })
                : null] }, candidate.key));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.permission, children: [_jsxs("div", { className: css.toggleRow, children: [_jsx("span", { className: css.toggleLabel, children: t('subagentModelSelectionToggle') }), _jsx(Switch, { checked: state.enabled, label: t('subagentModelSelectionToggle'), disabled: !state.writable || state.saving, onChange: props.toggleEnabled })] }), _jsx("p", { className: css.hint, children: t(state.enabled ? 'subagentModelSelectionChoose' : 'subagentModelSelectionOff') })] }), state.enabled
                ? (_jsxs("div", { className: css.selection, children: [state.catalogStatus === 'loading'
                            ? _jsx("p", { className: css.notice, role: "status", children: t('subagentModelSelectionLoading') })
                            : null, state.catalogStatus === 'error'
                            ? (_jsxs("div", { className: css.catalogError, role: "alert", children: [_jsx("span", { children: t('subagentModelSelectionLoadFailed') }), _jsx("button", { type: "button", disabled: state.saving, onClick: props.retryCatalog, children: t('subagentModelSelectionRetry') })] }))
                            : null, state.catalogPartial
                            ? _jsx("p", { className: css.notice, children: t('subagentModelSelectionPartial') })
                            : null, state.candidates.length > 0
                            ? (_jsxs("fieldset", { className: css.models, children: [_jsx("legend", { children: t('subagentModelSelectionAllowed') }), [...availableGroups].map(([provider, group]) => (_jsxs("div", { className: css.modelGroup, children: [_jsx("div", { className: css.providerName, children: group.providerName }), group.candidates.map(renderCandidate)] }, provider))), unavailable.length > 0
                                        ? (_jsxs("div", { className: css.modelGroup, children: [_jsx("div", { className: css.providerName, children: t('subagentModelSelectionUnavailableGroup') }), unavailable.map(renderCandidate)] }))
                                        : null] }))
                            : state.catalogStatus === 'ready'
                                ? _jsx("p", { className: css.notice, children: t('subagentModelSelectionEmpty') })
                                : null, state.invalid ? _jsx("p", { className: css.invalid, children: t('subagentModelSelectionRequired') }) : null] }))
                : null, state.conflicted
                ? _jsx("p", { className: css.conflict, role: "status", children: t('subagentModelSelectionConflict') })
                : null] }));
}
//# sourceMappingURL=SubagentModelSelectionFields.js.map