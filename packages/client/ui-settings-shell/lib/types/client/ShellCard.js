import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import { formLabels } from "./locales.js";
/**
 * Render the shell executor's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function ShellCard(props) {
    const { t } = props;
    const state = props.useShellCard(snapshot => snapshot);
    if (props.view === 'summary')
        return t('description');
    const disabled = !state.writable;
    return (_jsxs(SettingsForm, { labels: formLabels(t), state: state, onSave: props.save, onDiscard: props.discard, children: [_jsx(SettingsValueField, { id: "plugin-config-shell-timeout", label: t('timeoutMs'), hint: t('timeoutMsHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), numeric: true, disabled: disabled, ...state.timeoutMs, onEdit: (text) => { props.edit('timeoutMs', text); }, onReset: () => { props.resetField('timeoutMs'); } }), _jsx(SettingsValueField, { id: "plugin-config-shell-output", label: t('maxOutputBytes'), hint: t('maxOutputBytesHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), numeric: true, disabled: disabled, ...state.maxOutputBytes, onEdit: (text) => { props.edit('maxOutputBytes', text); }, onReset: () => { props.resetField('maxOutputBytes'); } })] }));
}
//# sourceMappingURL=ShellCard.js.map