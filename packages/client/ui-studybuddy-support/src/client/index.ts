/** Settings-only help and About contributions. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { HarnessSupportIssueInput, SupportLogRange } from '@studybuddy/contracts'
import { SupportController, type SupportHost } from './support-controller.ts'
import { createSupportViewStore } from './view-store.ts'
import { HelpFeedbackSection } from './HelpFeedbackSection.tsx'
import { AboutStudyBuddySection } from './AboutStudyBuddySection.tsx'
import { en, zh, type SupportKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'studybuddy.support': SupportKey } }
export interface SupportInjected {
  hooks: { support: SupportController }
  preview(range: SupportLogRange): Promise<void>
  uploadLogs(range: SupportLogRange): Promise<void>
  submitIssue(input: Omit<HarnessSupportIssueInput, 'screenshotSelectionIds'>): Promise<void>
  selectScreenshots(): Promise<void>
  copyReference(reference: string): Promise<void>
  checkUpdates(): Promise<void>
}
export const inject = ['slots', 'locale']
/** Register inside Settings and retain the account-owned workflow for this plugin's lifetime. @param ctx Client context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('studybuddy.support', { en, zh }), 'support dictionaries')
  const t = ctx.locale.bind('studybuddy.support'), host = Reflect.get(globalThis, 'studybuddy') as SupportHost | undefined
  const controller = new SupportController(host), store = createSupportViewStore()
  ctx.effect(() => {
    let active = true
    const adopt = (state: { phase: string; scope?: import('@studybuddy/contracts').OwnedScope | null }): void => {
      if (active) controller.setScope(state.phase === 'authenticated' ? state.scope ?? null : null)
    }
    const off = host?.subscribe(adopt)
    void host?.status().then(adopt).catch((_error: unknown) => { if (active) controller.setScope(null) })
    return () => { active = false; off?.(); controller.dispose() }
  }, 'support account lifetime')
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'help-feedback', order: 1000,
    label: () => t('nav'), locale: 'studybuddy.support', store,
    inject: (actions): SupportInjected => {
      controller.bindDraftReset(actions.reset)
      return { hooks: { support: controller }, preview: controller.preview, uploadLogs: controller.uploadLogs,
        submitIssue: controller.submitIssue, selectScreenshots: controller.selectScreenshots,
        copyReference: controller.copyReference, checkUpdates: controller.checkUpdates }
    },
  }, HelpFeedbackSection))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'about-studybuddy', order: 1100,
    label: () => t('aboutNav'), locale: 'studybuddy.support',
  }, AboutStudyBuddySection))
}
