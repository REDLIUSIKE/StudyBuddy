// @vitest-environment jsdom
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import * as tools from '../src/client/index.ts'
import * as account from '../../ui-studybuddy-account/src/client/index.ts'
import type { AccountFace } from '../../ui-studybuddy-account/src/client/face.ts'
it('official Loader registers the tool panel and navigates only the current account owner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studybuddy-tools-loader-')),
    ctx = new Context()
  const scope = { accountId: 'synthetic-loader', generation: 1 },
    navigation = new Set<(value: unknown) => void>()
  const selectPanel = vi.fn(),
    panelInfo = createSnapshotStore({ activePanelId: null })
  const settingsState=createSnapshotStore({open:true,activeId:'labs' as string|undefined}),closeSettings=vi.fn(()=>settingsState.set({open:false,activeId:undefined}))
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('studybuddy', {
    status: async () => ({ phase: 'authenticated', scope }),
    subscribe: () => () => {},
    subscribeNavigation: (listener: (value: unknown) => void) => {
      navigation.add(listener)
      return () => navigation.delete(listener)
    },
    business: {
      invoke: async (method: string) =>
        method === 'getAiAccountSummary'
          ? { balance: '0', frozenBalance: '0', availableBalance: '0', platformAccess: null }
          : [],
    },
  })
  let removeRoot: (() => void) | undefined
  try {
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('layout', { panelInfo, selectPanel } as never)
    ctx.provide('settingsNavigation',{state:settingsState,openSection:id=>settingsState.set({open:true,activeId:id}),close:closeSettings})
    ctx.provide('theme', { getTheme: () => ({ active: { colorScheme: 'light' } }) } as never)
    ctx.provide('uiWorkspace', { openSession: vi.fn() } as never)
    ctx.baseUrl = pathToFileURL(directory).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-client-ui-studybuddy-tools', tools],
      ['@deepseek-ai/dsh-client-ui-studybuddy-account', account],
    ])
    ctx.loader.internal = {
      version: 'v2',
      import: async (name: string) => {
        if (!modules.has(name)) throw Error('UNEXPECTED_LOADER_MODULE')
        return modules.get(name)
      },
      loadCache: new Map(),
      register: () => {
        throw Error('UNEXPECTED_HOOK')
      },
      getOrCreateModuleJob: () => {
        throw Error('UNEXPECTED_JOB')
      },
      resolveSync: () => {
        throw Error('UNEXPECTED_RESOLUTION')
      },
      load: () => {
        throw Error('UNEXPECTED_LOAD')
      },
    }
    for (const name of modules.keys()) {
      const path = join(directory, 'node_modules', ...name.split('/'))
      await mkdir(path, { recursive: true })
      await writeFile(
        join(path, 'package.json'),
        await readFile(
          join(
            'packages/client',
            name.endsWith('tools') ? 'ui-studybuddy-tools' : 'ui-studybuddy-account',
            'package.json',
          ),
        ),
      )
    }
    const path = join(directory, 'cordis.yml')
    await writeFile(
      path,
      [...modules.keys()]
        .map((name, index) => '- id: fixture-' + index + '\n  name: ' + JSON.stringify(name))
        .join('\n'),
    )
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
    await ctx.loader.await()
    removeRoot = ctx.slots.register(
      {
        name: 'root',
        children: {
          main: { kind: 'keyed', scope: 'root' },
          'shell.actions': { kind: 'list', scope: 'root' },
          'sidebar.panellist': { kind: 'list', scope: 'root' },
          'settings.section': { kind: 'list', scope: 'root' },
        },
      } as never,
      () => null,
    )
    expect(ctx.slots.entries('main').map(row => (row.options as { key: string }).key)).toEqual(
      expect.arrayContaining(['studybuddy.tools', 'studybuddy.my-ai']),
    )
    expect(ctx.slots.entries('main').some(row=>row.options.key==='studybuddy.labs')).toBe(false)
    expect(ctx.slots.entries('sidebar.panellist').some(row=>row.options.id==='studybuddy.labs')).toBe(false)
    expect(ctx.slots.entries('settings.section').some(row=>row.options.id==='labs')).toBe(true)
    const face = ctx.slots.entries('main').find(row => (row.options as { key: string }).key === 'studybuddy.my-ai')!
      .inject!() as unknown as AccountFace
    await vi.waitFor(() => expect(face.hooks.account.getSnapshot().scope).toEqual(scope))
    for (const listener of navigation) listener({ scope: { ...scope, generation: 2 }, target: 'sources' })
    expect(selectPanel).not.toHaveBeenCalled()
    for (const listener of navigation) listener({ scope, target: 'sources' })
    expect(selectPanel).toHaveBeenCalledWith('studybuddy.my-ai')
    selectPanel.mockClear()
    for (const listener of navigation) listener({ scope: { ...scope, generation: 2 }, target: 'tools' })
    expect(selectPanel).not.toHaveBeenCalled()
    expect(closeSettings).not.toHaveBeenCalled()
    for (const listener of navigation) listener({ scope, target: 'tools' })
    expect(selectPanel).toHaveBeenCalledWith('studybuddy.tools')
    expect(closeSettings).toHaveBeenCalledOnce()
    removeRoot()
    removeRoot = undefined
    await ctx.fiber.dispose()
    expect(navigation.size).toBe(0)
  } finally {
    removeRoot?.()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
    vi.unstubAllGlobals()
  }
})
