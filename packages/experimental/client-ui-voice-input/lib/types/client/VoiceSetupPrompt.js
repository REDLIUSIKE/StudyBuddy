import { jsx as _jsx } from "react/jsx-runtime";
/** Activation guidance after the Host inspects local recognition resources. */
import { useEffect } from 'react';
import { VoiceSetupDialog } from "./VoiceSetupDialog.js";
/**
 * Offer navigation to installation without starting a download.
 * @param props - activation navigation and the shared Host readiness observer.
 * @returns the shared modal only when the selected local provider needs preparation.
 */
export function VoiceSetupPrompt({ useSpeechReadiness, onDismiss, onOpenDetails, t }) {
    const readiness = useSpeechReadiness(value => value);
    const provider = readiness.catalog?.providers.find(item => item.id === readiness.catalog?.selection.providerId);
    const phase = readiness.connected ? provider?.preparation.phase : undefined;
    const needsSetup = phase === 'unprepared' && provider?.location === 'host-local';
    useEffect(() => {
        if (phase !== undefined && phase !== 'checking' && !needsSetup)
            onDismiss();
    }, [phase, needsSetup, onDismiss]);
    return _jsx(VoiceSetupDialog, { open: needsSetup, needsInstallation: true, onDismiss: onDismiss, onOpenDetails: onOpenDetails, t: t });
}
//# sourceMappingURL=VoiceSetupPrompt.js.map