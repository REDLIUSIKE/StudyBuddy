import { VoiceInput } from "./VoiceInput.js";
import { Recording } from "./audio.js";
import { createMicrophoneDeviceStore } from "./microphone-device.js";
import { en, NS, zh } from "./locales.js";
import { observeReadiness } from "./readiness.js";
import { VoicePreparation } from "./PreparationCard.js";
import { VoiceSetupPrompt } from "./VoiceSetupPrompt.js";
export const inject = ['remote', 'slots', 'locale', 'pluginNavigation'];
function registerUi(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }));
    const recordings = new Set();
    const microphone = createMicrophoneDeviceStore();
    const readiness = observeReadiness(ctx);
    ctx.effect(() => readiness.dispose);
    ctx.effect(() => async () => { await Promise.all([...recordings].map(recording => recording.dispose())); });
    const actions = {
        openSettings: () => { ctx.pluginNavigation.openBundle('@deepseek-ai/dsh-experimental-voice-input-bundle'); },
        hooks: { speechReadiness: readiness.state, microphoneDevice: microphone },
        selectMicrophone: (device) => { microphone.set(device); },
        createRecording: () => {
            const recording = new Recording(() => { recordings.delete(recording); }, microphone.getSnapshot().id);
            recordings.add(recording);
            return recording;
        },
        transcribe: async (request, signal) => await ctx.remote.speech.transcribe(request, signal),
        configure: async (patch) => { const result = await ctx.remote.speech.configure(patch); if (!result.ok)
            throw result.error; },
        prepare: async (providerId, options) => {
            const result = await ctx.remote.speech.prepare(providerId, options);
            if (!result.ok)
                throw result.error;
        },
        cancelPreparation: async (providerId) => {
            const result = await ctx.remote.speech.cancelPreparation(providerId);
            if (!result.ok)
                throw result.error;
        },
    };
    ctx.slots.inject('conversation.input.activity', () => ctx.slots.register({
        name: 'conversation.input.activity', locale: NS, inject: () => actions,
    }, VoiceInput));
    ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config',
        key: '@deepseek-ai/dsh-experimental-voice-input-bundle', locale: NS, inject: () => actions,
    }, VoicePreparation));
    ctx.slots.inject('plugins.bundle.activation', () => ctx.slots.register({ name: 'plugins.bundle.activation',
        key: '@deepseek-ai/dsh-experimental-voice-input-bundle', locale: NS, inject: () => actions,
    }, VoiceSetupPrompt));
}
/**
 * Mount this experimental namespace without adding it to stable API Remotes.
 * @param ctx - Client runtime owning the Remote, dictionaries and slots.
 * @param contribution - generated speech Remote definitions.
 * @returns disposer joining UI and Remote withdrawal.
 */
export async function mountVoiceInput(ctx, contribution) {
    const disposeRemote = await ctx.remote.$mount(contribution);
    const ui = ctx.inject(['remote.speech', 'slots', 'locale', 'pluginNavigation'], registerUi);
    try {
        await ui;
    }
    catch (error) {
        await ui.dispose();
        await disposeRemote();
        throw error;
    }
    return async () => { await ui.dispose(); await disposeRemote(); };
}
//# sourceMappingURL=mount.js.map