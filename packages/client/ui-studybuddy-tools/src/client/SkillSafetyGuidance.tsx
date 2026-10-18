import type {PropsRuntime,PropsLocale} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './SkillSafetyGuidance.module.css'
export type SkillSafetyGuidanceProps=PropsRuntime<'conversation.hero.guidance'> & PropsLocale<'studybuddy.tools'>
/** Read-only opening guidance; never change the composer or prepare resources. */
export function SkillSafetyGuidance({sessionId,useSessions,inputActions,t}:SkillSafetyGuidanceProps){
  const preset=useSessions(state=>sessionId===undefined?undefined:state.byId[sessionId]?.projectionValues?.agentPreset)
  if(preset!=='skill-safety'||!inputActions)return null
  return <section className={css.guide} aria-label={t('safetyHeading')}>
    <h2>{t('safetyHeading')}</h2><p>{t('safetyGuide')}</p>
  </section>
}
