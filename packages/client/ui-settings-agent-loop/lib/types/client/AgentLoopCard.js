import { jsx as _jsx } from "react/jsx-runtime";
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import { formLabels } from "./locales.js";
/**
 * Render the agent loop's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function AgentLoopCard(props) {
    const { t } = props;
    const state = props.useAgentLoopCard(snapshot => snapshot);
    if (props.view === 'summary')
        return t('description');
    return (_jsx(SettingsForm, { labels: formLabels(t), state: state, onSave: props.save, onDiscard: props.discard, children: _jsx(SettingsValueField, { id: "plugin-config-agent-loop-parallel", label: t('maxParallel'), hint: t('maxParallelHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), numeric: true, disabled: !state.writable, ...state.maxParallelToolCalls, onEdit: (text) => { props.edit('maxParallelToolCalls', text); }, onReset: () => { props.resetField('maxParallelToolCalls'); } }) }));
}
//# sourceMappingURL=AgentLoopCard.js.map