/** Staged translation preferences using the shared Plugins form model. */
import { SettingsFormModel, settingsTextField } from '@deepseek-ai/dsh-client-ui-primitives';
import { LANGUAGE_PREFERENCE_PATTERN, PROVIDER_PREFERENCES } from "../preferences.js";
/** Stages provider and language edits until the reader saves them. */
export class TranslationPreferencesForm {
    form;
    state;
    /** @param scope - Host-backed configuration form for this plugin. */
    constructor(scope) {
        this.form = new SettingsFormModel(scope, [{
                ...settingsTextField('provider'),
                parse: (text) => {
                    const provider = text.trim();
                    return provider === '' ? { kind: 'clear' }
                        : PROVIDER_PREFERENCES.some(choice => choice === provider) ? { kind: 'set', value: provider } : undefined;
                },
            }, {
                ...settingsTextField('targetLanguage'),
                parse: text => LANGUAGE_PREFERENCE_PATTERN.test(text.trim())
                    ? { kind: 'set', value: text.trim() } : undefined,
            }]);
        this.state = this.form.bind(() => ({ ...this.form.shell(), provider: this.form.field('provider'),
            targetLanguage: this.form.field('targetLanguage') }));
    }
    /**
     * Build the registration face for the preferences form.
     * @returns draft observable and shared edit/save actions.
     */
    inject() { return { hooks: { translationForm: this.state }, ...this.form.actions() }; }
    /** Release the accepted-preference subscription. */
    dispose() { this.form.dispose(); }
}
//# sourceMappingURL=preferences-form.js.map