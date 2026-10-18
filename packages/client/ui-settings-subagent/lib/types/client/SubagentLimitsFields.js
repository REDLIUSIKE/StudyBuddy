import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './SubagentLimitsFields.module.css';
/**
 * Render the depth and capacity fields with their original validation and reset behavior.
 * @param props - Locale, staged fields, and edit callbacks.
 * @returns Two responsive fields and their application rules.
 */
export function SubagentLimitsFields(props) {
    const { t, state } = props;
    return (_jsx(_Fragment, { children: _jsxs("div", { className: css.limits, children: [_jsx("div", { className: css.limit, children: _jsx(SettingsValueField, { id: "plugin-config-subagent-depth", label: t('subagentMaxDepth'), help: { label: t('subagentDepthHelpLabel'), content: (_jsxs(_Fragment, { children: [_jsx("p", { children: t('subagentDepthHelp') }), _jsx("table", { className: css.depthTable, "aria-label": t('subagentDepthHelpLabel'), children: _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("th", { scope: "row", children: 0 }), _jsx("td", { children: t('subagentDepthZero') })] }), _jsxs("tr", { children: [_jsx("th", { scope: "row", children: 1 }), _jsx("td", { children: t('subagentDepthOne') })] })] }) }), _jsx("p", { children: t('subagentDepthOverride') })] })) }, overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('subagentDepthInvalid'), numeric: true, disabled: !state.writable || state.saving, ...state.maxDepth, onEdit: (text) => { props.edit('maxDepth', text); }, onReset: () => { props.resetField('maxDepth'); } }) }), _jsx("div", { className: css.limit, children: _jsx(SettingsValueField, { id: "plugin-config-subagent-capacity", label: t('subagentMaxActive'), help: { label: t('subagentCapacityHelpLabel'), content: _jsx("p", { children: t('subagentCapacityHelp') }) }, overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('subagentCapacityInvalid'), numeric: true, disabled: !state.writable || state.saving, ...state.maxActiveSubagents, onEdit: (text) => { props.edit('maxActiveSubagents', text); }, onReset: () => { props.resetField('maxActiveSubagents'); } }) })] }) }));
}
//# sourceMappingURL=SubagentLimitsFields.js.map