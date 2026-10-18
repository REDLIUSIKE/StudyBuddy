import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId } from 'react';
import { Button, SettingsForm, SettingsValueField, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { formLabels } from "./locales.js";
import css from './Translation.module.css';
function providerLabel(provider, t) {
    switch (provider) {
        case 'bing': return t('bing');
        case 'google': return t('google');
        case 'deepseek-account': return t('deepseekAccount');
        case 'deepseek-official': return t('deepseekOfficial');
        default: return provider;
    }
}
/**
 * Render staged translation preferences and name which text leaves the Host.
 * @param props - current draft fields, accepted-value metadata, and save actions.
 * @returns the bundle's translation preferences.
 */
export function TranslationSettings(props) {
    const { t } = props;
    const providerId = useId(), languageId = useId();
    const state = props.useTranslationForm(value => value);
    const availableProviders = props.useAvailableProviders(value => value);
    useEffect(() => { props.refreshProviders(); }, [props.refreshProviders]);
    const missingProvider = state.provider.text !== '' && !availableProviders.some(provider => provider === state.provider.text);
    const paid = state.provider.text === 'deepseek-account' || state.provider.text === 'deepseek-official';
    const disabled = !state.writable || state.saving;
    return _jsxs(SettingsForm, { labels: formLabels(t), state: state, onSave: props.save, onDiscard: props.discard, children: [_jsx("p", { className: css.notice, children: t('privacy') }), _jsx("p", { className: css.notice, children: t(paid ? 'paidNotice' : 'anonymousNotice') }), _jsxs("div", { className: css.field, children: [_jsxs("div", { className: css.toolbar, children: [_jsx("label", { htmlFor: providerId, children: t('provider') }), state.provider.overridden && _jsxs(_Fragment, { children: [_jsx(Tag, { tone: "neutral", children: t('overridden') }), _jsx(Button, { size: "sm", disabled: disabled, onClick: () => { props.resetField('provider'); }, children: t('reset') })] })] }), _jsxs("select", { id: providerId, value: state.provider.text, disabled: disabled, "aria-invalid": state.provider.invalid || undefined, onChange: (event) => { props.edit('provider', event.target.value); }, children: [missingProvider && _jsx("option", { value: state.provider.text, disabled: true, children: t('providerUnavailableOption', {
                                    provider: providerLabel(state.provider.text, t),
                                }) }), availableProviders.map(provider => _jsx("option", { value: provider, children: providerLabel(provider, t) }, provider))] }), state.provider.invalid && _jsx("p", { role: "status", children: t('invalidProvider') }), missingProvider && !state.provider.invalid && _jsx("p", { role: "status", className: css.notice, children: t('providerUnavailable') })] }), _jsx(SettingsValueField, { id: languageId, label: t('targetLanguage'), hint: t('targetLanguageHint'), ...state.targetLanguage, overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidLanguage'), disabled: disabled, onEdit: (value) => { props.edit('targetLanguage', value); }, onReset: () => { props.resetField('targetLanguage'); } })] });
}
//# sourceMappingURL=TranslationSettings.js.map