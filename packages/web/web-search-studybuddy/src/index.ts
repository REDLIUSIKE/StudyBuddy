import type {Context} from '@deepseek-ai/cordis'
import {StudyBuddySearchProvider} from './provider.ts'
import type {StudyBuddySearchPort} from './provider.ts'
import type {} from '@deepseek-ai/dsh-web'
export * from './provider.ts'
export const name='web-search-studybuddy'
export const inject=['web','studybuddySearch']
declare module '@deepseek-ai/cordis' { interface Context { studybuddySearch:StudyBuddySearchPort } }
/** Register once through the product profile, with an effect-scoped disposer. */
export function apply(ctx:Context):void {ctx.web.registerSearchProvider(new StudyBuddySearchProvider(ctx.studybuddySearch))}

export * from './wire.ts'
