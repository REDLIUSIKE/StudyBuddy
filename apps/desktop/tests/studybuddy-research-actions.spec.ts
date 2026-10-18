import { expect, it } from 'vitest'
import { parseResearchPageAction } from '../src/studybuddy/research-actions.ts'
it('accepts only closed project, native tab and draft actions', () => {
  expect(parseResearchPageAction({ kind: 'new-chat', projectId: 'study' })).toEqual({ kind: 'new-chat', projectId: 'study' })
  expect(parseResearchPageAction({ kind: 'select-chat', projectId: 'study', sessionId: 'session-11111111-1111-4111-8111-111111111111' }).kind).toBe('select-chat')
  for (const value of [{ kind: 'open-project', projectId: 'study', model: 'forged' }, { kind: 'show-models', token: 'secret' }, { kind: 'draft', projectId: 'study', text: 'x', references: ['../secret'] }, { kind: 'select-chat', projectId: 'study', sessionId: '../secret' }]) expect(() => parseResearchPageAction(value)).toThrow('RESEARCH_ACTION_INVALID')
})
it('accepts only exact service-link actions without project, model or credential fields',()=>{
 expect(parseResearchPageAction({kind:'open-service-site',url:'https://metaso.cn/'})).toEqual({kind:'open-service-site',url:'https://metaso.cn/'});
 for(const value of [{kind:'open-service-site',url:'https://evil.test/'},{kind:'open-service-site',url:'https://exa.ai/?key=secret'},{kind:'open-service-site',url:'https://modal.com/',token:'forged'}])expect(()=>parseResearchPageAction(value)).toThrow();
});
