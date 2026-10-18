import { expect, it } from 'vitest'
import { communityEntry, communityNavigationAllowed, communityProfileAction, communityCampusEntry } from '../src/studybuddy/community-routes.ts'

it('admits only each original fragment ticket entry and adds the scoped Harness presentation preference', () => {
  for (const [target, path] of [['zhilian', '/leaderboards'], ['skills', '/skills']] as const) {
    const entry = `https://guijitongzhuo.com${path}?embed=desktop#ticket=${'a'.repeat(43)}`
    expect(communityEntry(target, entry)).toBe(entry.replace('#', '&host_ui=harness#'))
    expect(communityEntry(target, entry.replace('#', '&host_ui=harness#'))).toBe(entry.replace('#', '&host_ui=harness#'))
    for (const invalid of [entry.replace(path, '/api/v1/auth'), entry.replace('guijitongzhuo.com', 'evil.test'), entry.replace('?embed=desktop', '?embed=desktop&next=evil'), entry.split('#')[0]]) {
      expect(() => communityEntry(target, invalid)).toThrow('COMMUNITY_ENTRY_INVALID')
    }
  }
})

it('campus setup consumes a fresh original profile ticket bound to return=zhilian', () => {
  const entry = 'https://guijitongzhuo.com/my-ai/profile?embed=desktop&return=zhilian#ticket=' + 'b'.repeat(43)
  expect(communityCampusEntry(entry)).toBe(entry.replace('#', '&host_ui=harness#'))
  for (const invalid of [entry.replace('return=zhilian', 'return=leaderboard'), entry.replace('/my-ai/profile', '/skills'), entry.replace('guijitongzhuo.com', 'evil.test')]) expect(() => communityCampusEntry(invalid)).toThrow('COMMUNITY_ENTRY_INVALID')
})

it('keeps each page in its business routes and restricts profile intent to the original exact deep links', () => {
  expect(communityNavigationAllowed('zhilian', 'https://guijitongzhuo.com/leaderboards?embed=desktop&host_ui=harness')).toBe(true)
  expect(communityNavigationAllowed('zhilian', 'https://guijitongzhuo.com/my-ai/profile?embed=desktop&return=zhilian')).toBe(true)
  expect(communityNavigationAllowed('skills', 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness')).toBe(true)
  for (const target of ['zhilian', 'skills'] as const) {
    for (const url of ['https://guijitongzhuo.com/api/v1/auth', 'https://guijitongzhuo.com/skills-extra', 'http://127.0.0.1', 'https://user@guijitongzhuo.com/skills']) {
      expect(communityNavigationAllowed(target, url)).toBe(false)
    }
  }
  expect(communityProfileAction('studybuddy://personal-profile/open?return=zhilian')).toBe('open')
  expect(communityProfileAction('studybuddy://personal-profile/return?target=zhilian')).toBe('return')
  for (const url of ['studybuddy://personal-profile/open?return=zhilian&extra=1', 'studybuddy://personal-profile/open?return=https://evil.test', 'studybuddy://personal-profile/return?target=leaderboard']) expect(communityProfileAction(url)).toBe(null)
})
