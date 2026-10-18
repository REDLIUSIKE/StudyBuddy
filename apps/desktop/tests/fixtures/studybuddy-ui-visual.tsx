/** Browser-only visual regression of the original components, with no account or network writes. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { LeaderboardPage } from '../../../../../StudyBuddy-UAT-Builds/harness-skill-web-fix-20261011/apps/web/src/features/leaderboards/LeaderboardPage'
import { SkillCard } from '@studybuddy/skill-center-ui'
import { parseSkillEntry } from '@studybuddy/contracts'
import type { LeaderboardQuery } from '@studybuddy/contracts'
import { githubEntry } from '../../../../../StudyBuddy-UAT-Builds/harness-skill-web-fix-20261011/packages/contracts/src/skill-center.fixtures'
import { HarnessBusinessFrame } from '../../../../../StudyBuddy-UAT-Builds/harness-skill-web-fix-20261011/apps/web/src/components/HarnessBusinessFrame'
import { ZhilianPanelIcon, SkillsPanelIcon } from '../../../../packages/client/ui-studybuddy-pages/src/client/PagePanel'
import { ToolsPanelIcon } from '../../../../packages/client/ui-studybuddy-tools/src/client/ToolCenterPanel'
import '../../../../../StudyBuddy-UAT-Builds/harness-skill-web-fix-20261011/packages/skill-center-ui/src/skill-card.css'
import '../../../../../StudyBuddy-UAT-Builds/harness-skill-web-fix-20261011/apps/web/src/components/harness-business-frame.css'

const identity = {
  status: 'confirmed' as const, realName: '测试', revision: 1, grade: '2020级',
  school: { id: '00000000-0000-4000-8000-000000000010', name: '示例理工大学', status: 'verified' as const },
  college: { id: '00000000-0000-4000-8000-000000000011', name: '资源与环境工程学院', status: 'verified' as const },
  program: { id: '00000000-0000-4000-8000-000000000012', name: '安全工程', status: 'verified' as const },
}
const api = {
  exchangeEmbeddedSession: async () => {}, getAcademicProfile: async () => identity,
  searchAcademicDirectory: async () => ({ items: [] }), lockAcademicProfile: async () => { throw Error('VISUAL_FIXTURE_WRITE_FORBIDDEN') },
  listLeaderboards: async (query: LeaderboardQuery) => ({
    ...query, items: [], currentUserRank: null, nextCursor: null, computedAt: '2026-10-12T00:00:00.000Z', stale: true,
  }),
}
const entry = parseSkillEntry(githubEntry)
createRoot(document.getElementById('root')!).render(<HarnessBusinessFrame><div className="visual-icons" aria-label="Navigation glyph regression"><ToolsPanelIcon size={16}/><ZhilianPanelIcon size={16}/><SkillsPanelIcon size={16}/></div>{window.location.pathname === '/skills' ? <section className="skill-marketplace visual-cards"><SkillCard entry={entry} readOnly={false} onOpen={() => document.getElementById('result')!.textContent='Opened'} onAction={() => document.getElementById('result')!.textContent='Favorite'} /><p id="result" role="status"/></section> : <LeaderboardPage api={api}/>}</HarnessBusinessFrame>)
