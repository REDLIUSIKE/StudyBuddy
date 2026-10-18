import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { onboardingReadiness } from "./store.js";
import { ProviderEditor } from "./ProviderEditor.js";
import { OnboardingModal } from "./OnboardingModal.js";
import styles from './DeepSeekOnboardingDialog.module.css';
/* v8 ignore next 3 -- closed-union defaults only defend future source widening */
function assertNever(_value) {
    throw new Error('unexpected DeepSeek onboarding state');
}
/**
 * Prompt a first-run user for the official DeepSeek credential while no
 * provider can serve requests and that credential is writable.
 * @param props - settings-shell owner state and Models feature dependencies.
 * @returns the onboarding modal or null when onboarding needs no intervention.
 */
export function DeepSeekOnboardingDialog(props) {
    const { complete, controller, useModels, operations, schema, t, renderSlot, automatic, explicit = false } = props;
    const [apiKey, setApiKey] = useState(explicit);
    const state = useModels(snapshot => snapshot);
    const readiness = onboardingReadiness(state);
    useEffect(() => {
        if ((automatic || explicit) && state.status === 'idle')
            void controller.load();
    }, [controller, state.status, automatic, explicit]);
    useEffect(() => {
        if ((!automatic && !explicit)
            || readiness.kind === 'adapter-absent'
            || (!explicit && readiness.kind === 'provider-ready')
            || readiness.kind === 'unavailable')
            complete();
    }, [complete, readiness.kind, explicit, automatic]);
    if (!automatic && !explicit)
        return null;
    switch (readiness.kind) {
        case 'loading':
        case 'adapter-absent':
        case 'unavailable':
            return null;
        case 'provider-ready':
            if (!explicit)
                return null;
            break;
        case 'credential-missing':
            break;
        /* v8 ignore next -- every current readiness variant is handled above */
        default:
            return assertNever(readiness);
    }
    const row = state.rows.find(candidate => candidate.entry.provider === 'deepseek-official'
        && candidate.entry.settingsNs === 'llm-deepseek'
        && candidate.entry.settingsPath.length === 0);
    const namespace = state.namespaces.get('llm-deepseek');
    /* v8 ignore next 2 -- credential-missing is derived only from this exact joined row. */
    if (row === undefined || namespace === undefined)
        return null;
    const finishCredential = (changed) => {
        if (!changed) {
            complete();
            return;
        }
        void controller.load();
    };
    const editor = (_jsxs(OnboardingModal, { title: t('onboardingTitle'), children: [_jsx("p", { className: styles.description, children: t('onboardingDescription') }), _jsx("div", { className: styles.editor, children: _jsx(ProviderEditor, { provider: row.entry.provider, displayName: row.entry.displayName, namespace: namespace, schema: schema, settingsPath: row.entry.settingsPath, operations: operations, t: t, readOnly: false, hideTitle: true, credentialOnly: true, onSubmitCredential: () => { props.track?.('api_key_save_click', {}); }, credentialRequired: true, autoFocusCredential: true, cancelLabelKey: "onboardingLater", submitLabelKey: "onboardingSave", submitBusyLabelKey: "onboardingSaving", onClose: finishCredential }) })] }));
    return apiKey ? editor : renderSlot('settings.models.sign-in', { complete, useApiKey: () => { setApiKey(true); } }, { fallback: editor });
}
//# sourceMappingURL=DeepSeekOnboardingDialog.js.map