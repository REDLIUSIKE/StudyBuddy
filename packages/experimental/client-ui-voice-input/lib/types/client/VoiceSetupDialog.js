import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Shared modal for voice activation and unavailable recognition. */
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Guide activation or microphone clicks to the existing plugin details.
 * @param props - visibility, installation need and navigation callbacks.
 * @returns a dismissible prompt that never starts preparation or recording.
 */
export function VoiceSetupDialog({ open, needsInstallation, onDismiss, onOpenDetails, t }) {
    return _jsx(Modal, { open: open, title: t(needsInstallation ? 'setupPrompt.title' : 'setupPrompt.unavailableTitle'), closeLabel: t('cancel'), onClose: onDismiss, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: onDismiss, children: t('setupPrompt.later') }), _jsx(Button, { variant: "primary", "data-modal-autofocus": true, onClick: onOpenDetails, children: t(needsInstallation ? 'setupPrompt.open' : 'setupPrompt.details') })] }), children: _jsx("p", { children: t(needsInstallation ? 'setupPrompt.body' : 'setupPrompt.unavailableBody') }) });
}
//# sourceMappingURL=VoiceSetupDialog.js.map