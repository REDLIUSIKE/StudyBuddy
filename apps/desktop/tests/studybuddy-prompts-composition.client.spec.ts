// @vitest-environment jsdom
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { GlobalRightPanel } from '../../../packages/client/ui-sidebar-right/src/client/global-panel.ts'
import * as prompts from '../../../packages/client/ui-studybuddy-prompts/src/client/index.ts'
import { expect, it, vi } from 'vitest'

it('loads the actual prompt composition only into header and global right slots and disposes both', async () => {
  const rows = loadOverlayPatches('prompts-composition', resolve('packages/bundle/web-app/cordis.patch.yml'))
    .flatMap(patch => patch.insert ?? []).filter(row => row.id === 'ui-studybuddy-prompts')
  expect(rows).toHaveLength(1)
  const ctx = new Context(); vi.stubGlobal('studybuddy', undefined)
  try {
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx); ctx.provide('locale', locale); locale.setLocale('zh')
    ctx.provide('sidebarRightGlobal', new GlobalRightPanel({ openRightbar: () => {}, closeRightbar: () => {} }))
    ctx.slots.register({ name: 'root', inject: () => ({}), children: {
      'sidebar.header.action': { kind: 'list', scope: 'root' }, 'shell.leading.action': { kind: 'list', scope: 'root' },
      'rightbar.global': { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' },
    } }, (_props: PropsRenderSlots<'sidebar.header.action' | 'shell.leading.action' | 'rightbar.global' | 'sidebar.panellist'>) => null)
    ctx.baseUrl = 'file:///'
    await ctx.plugin(Loader).await(); ctx.loader.builtins.prompts = prompts
    await ctx.loader.root.update([{ ...rows[0]!, name: 'cordis:prompts' }]); await ctx.loader.await()
    expect(ctx.slots.entries('sidebar.header.action')).toHaveLength(1)
    expect(ctx.slots.entries('shell.leading.action')).toHaveLength(1)
    expect(ctx.slots.entries('rightbar.global')[0]?.options.key).toBe('studybuddy.prompts')
    expect(ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    await ctx.loader.root.update([]); await ctx.loader.await()
    expect(ctx.slots.entries('rightbar.global')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar.header.action')).toHaveLength(0)
  } finally { await ctx.fiber.dispose(); vi.unstubAllGlobals() }
})
