import { SupportController } from "./support-controller.js";
import { createSupportViewStore } from "./view-store.js";
import { HelpFeedbackSection } from "./HelpFeedbackSection.js";
import { AboutStudyBuddySection } from "./AboutStudyBuddySection.js";
import { en, zh } from "./locales.js";
export const inject = ['slots', 'locale'];
/** Register inside Settings and retain the account-owned workflow for this plugin's lifetime. @param ctx Client context. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('studybuddy.support', { en, zh }), 'support dictionaries');
    const t = ctx.locale.bind('studybuddy.support'), host = Reflect.get(globalThis, 'studybuddy');
    const controller = new SupportController(host), store = createSupportViewStore();
    ctx.effect(() => {
        let active = true;
        const adopt = (state) => {
            if (active)
                controller.setScope(state.phase === 'authenticated' ? state.scope ?? null : null);
        };
        const off = host?.subscribe(adopt);
        void host?.status().then(adopt).catch((_error) => { if (active)
            controller.setScope(null); });
        return () => { active = false; off?.(); controller.dispose(); };
    }, 'support account lifetime');
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'help-feedback', order: 1000,
        label: () => t('nav'), locale: 'studybuddy.support', store,
        inject: (actions) => {
            controller.bindDraftReset(actions.reset);
            return { hooks: { support: controller }, preview: controller.preview, uploadLogs: controller.uploadLogs,
                submitIssue: controller.submitIssue, selectScreenshots: controller.selectScreenshots,
                copyReference: controller.copyReference, checkUpdates: controller.checkUpdates };
        },
    }, HelpFeedbackSection));
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'about-studybuddy', order: 1100,
        label: () => t('aboutNav'), locale: 'studybuddy.support',
    }, AboutStudyBuddySection));
}
//# sourceMappingURL=index.js.map