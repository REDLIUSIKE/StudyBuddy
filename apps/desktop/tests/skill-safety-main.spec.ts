import { it, expect } from 'vitest'
import { resolveSkillSafetyChoice } from '../src/studybuddy/skill-safety-main.ts'
import type { AigcTextChoice } from '../src/studybuddy/aigc-types.ts'
const authority = { exactModelId: 'fixture-exact', providerId: 'deepseek', displayName: 'Fixture', protocol: 'openai_chat_completions' }
const platform = { kind: 'platform', handle: 'platform-handle', sourceLabel: '平台额度', catalogDigest: 'a'.repeat(64), catalogVersion: 'catalog', selection: { exactModelId: 'fixture-exact', providerId: 'deepseek', protocol: 'openai_chat_completions', fundingSource: 'platform' }, authority } as AigcTextChoice
const personal = { handle: 'personal-handle', sourceLabel: '自备账户', catalogDigest: 'b'.repeat(64), catalogVersion: 'catalog', selection: { exactModelId: 'fixture-exact', providerId: 'deepseek', protocol: 'openai_chat_completions', fundingSource: 'user_api', routeId: 'personal-route' }, authority } as AigcTextChoice
it('same exact model in different funding sources never switches to platform', () => {
  expect(resolveSkillSafetyChoice({ provider: 'personal-route', model: 'fixture-exact' }, [platform, personal])).toBe(personal)
  expect(resolveSkillSafetyChoice({ provider: 'studybuddy-platform', model: 'fixture-exact' }, [platform, personal])).toBe(platform)
})
it('unknown, duplicated and different exact models fail closed', () => {
  expect(resolveSkillSafetyChoice({ provider: 'personal-route', model: 'unknown' }, [platform, personal])).toBeUndefined()
  expect(resolveSkillSafetyChoice({ provider: 'unknown-route', model: 'fixture-exact' }, [platform, personal])).toBeUndefined()
  expect(resolveSkillSafetyChoice({ provider: 'personal-route', model: 'fixture-exact' }, [personal, { ...personal }])).toBeUndefined()
})
