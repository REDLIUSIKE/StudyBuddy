// @vitest-environment jsdom
/** The shipped web composition must actually load the settings-only support plugin. */
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import * as support from '../../../packages/client/ui-studybuddy-support/src/client/index.ts'
import { expect, it, vi } from 'vitest'
import { HARNESS_TOOL_METHODS, HARNESS_SUPPORT_METHODS, parseHarnessSupportRequest } from '@studybuddy/contracts'

it('loads Help and About once through the actual product composition without a sidebar entry', async () => {
  const rows = loadOverlayPatches('support-composition', resolve('packages/bundle/web-app/cordis.patch.yml'))
    .flatMap(patch => patch.insert ?? []).filter(row => row.id === 'ui-studybuddy-support')
  expect(rows).toHaveLength(1)
  expect(rows[0]?.name).toBe('@deepseek-ai/dsh-client-ui-studybuddy-support')
  const ctx = new Context(); vi.stubGlobal('studybuddy', undefined)
  try {
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx); ctx.provide('locale', locale); locale.setLocale('zh')
    ctx.slots.register({ name: 'root', inject:()=>({}), children: { 'settings.section': { kind: 'list', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' } } }, (_props:PropsRenderSlots<'settings.section' | 'sidebar.panellist'>) => null)
    ctx.baseUrl = 'file:///'; await ctx.plugin(Loader).await(); ctx.loader.builtins.support = support
    await ctx.loader.root.update([{ ...rows[0]!, name: 'cordis:support' }]); await ctx.loader.await()
    const sections = ctx.slots.entries('settings.section')
    expect(sections).toHaveLength(2)
    expect(sections.map(section=>resolveSlotLabel(section.options.label))).toEqual(['帮助与反馈','关于 StudyBuddy'])
    expect(ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
  } finally { await ctx.fiber.dispose(); vi.unstubAllGlobals() }
})
it('admits only the generated private support DTOs, never the generic tool dispatcher', () => {
  const requestId = '123e4567-e89b-42d3-a456-426614174002'
  expect(parseHarnessSupportRequest('uploadSupportLogs', [requestId, 'last_24_hours'])).toEqual([requestId, 'last_24_hours'])
  const toolMethods = new Set<string>(HARNESS_TOOL_METHODS)
  for (const method of HARNESS_SUPPORT_METHODS) expect(toolMethods.has(method)).toBe(false)
  expect(() => parseHarnessSupportRequest('uploadSupportLogs', [requestId, 'last_24_hours', 'forged-owner'])).toThrow()
})
