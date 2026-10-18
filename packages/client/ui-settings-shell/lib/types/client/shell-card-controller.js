/** The shell page's staged form over the composed shell executor entry. */
import { SettingsFormModel, settingsNumberField, } from '@deepseek-ai/dsh-client-ui-primitives';
/** Profile entry id of the POSIX shell executor; the base bundle composes it off Windows. */
export const BASH_NS = 'bash-sandbox';
/** Profile entry id of the PowerShell executor; the base bundle composes it on Windows. */
export const PWSH_NS = 'pwsh-sandbox';
/** Bridges one shell executor entry's form onto the page's staged form. */
export class ShellCardController {
    form;
    store;
    /** @param scope - the shared configuration form of the composed shell executor entry. */
    constructor(scope) {
        this.form = new SettingsFormModel(scope, [settingsNumberField('timeoutMs'), settingsNumberField('maxOutputBytes')]);
        this.store = this.form.bind(() => this.projection());
    }
    projection() {
        return {
            ...this.form.shell(),
            timeoutMs: this.form.field('timeoutMs'),
            maxOutputBytes: this.form.field('maxOutputBytes'),
        };
    }
    /**
     * Build the face the page's slot registration injects.
     * @returns the page's snapshot and its form actions.
     */
    inject() {
        return { hooks: { shellCard: this.store }, ...this.form.actions() };
    }
    /** Release the form subscription. */
    dispose() { this.form.dispose(); }
}
//# sourceMappingURL=shell-card-controller.js.map