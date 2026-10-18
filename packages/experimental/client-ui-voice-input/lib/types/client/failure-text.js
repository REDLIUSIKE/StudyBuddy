import { RecordingError } from "./audio.js";
/**
 * Translate a capture or transcription failure.
 * @param failure - the rejected value.
 * @param t - the active voice-input translator.
 * @returns localized failure text.
 */
export function failureText(failure, t) {
    return failure instanceof RecordingError ? t(failure.kind)
        : t('failed', { message: failure instanceof Error ? failure.message : String(failure) });
}
//# sourceMappingURL=failure-text.js.map