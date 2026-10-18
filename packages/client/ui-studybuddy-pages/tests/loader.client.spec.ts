// @vitest-environment jsdom
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as renderer from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRenderSlots, StandardSourceBinding } from '@deepseek-ai/dsh-client-ui-slots'
import * as account from '../../ui-studybuddy-account/src/client/index.ts'
import * as pages from '../src/client/index.ts'
import { PageController } from '../src/client/page-controller.ts'
it('official Loader preloads all available pages, reuses their guests, and disposes account leases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studybuddy-pages-loader-')), ctx = new Context()
  const scope = { accountId: 'synthetic-community', generation: 4 }
  const accountListeners = new Set<(state: { phase: string; scope?: typeof scope | null }) => void>()
  const navigation = new Set<(notice: { scope: typeof scope; target: 'tools' | 'skills' | 'zhilian' }) => void>()
  const invalidated = new Set<(lease: string) => void>()
  const release = vi.fn(async () => {}), panelInfo = createSnapshotStore<PanelInfo>({ activePanelId: null })
  const selectPanel = vi.fn((activePanelId: PanelInfo['activePanelId']) => panelInfo.set({ activePanelId }))
  const acquire = vi.fn(async (target: string) => ({ lease: target, partition: target, entryUrl: 'https://guijitongzhuo.com/' + target, scope }))
  const acquireAigc = vi.fn(async () => ({ lease: 'aigc', partition: 'aigc', entryUrl: 'http://127.0.0.1:49152/', scope }))
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const guestObserver = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement) || node.tagName !== 'WEBVIEW') continue
      Object.defineProperty(node, 'loadURL', { value: async () => {} })
      Object.defineProperty(node, 'insertCSS', { value: async () => 'owned-appearance' })
      node.dispatchEvent(new Event('dom-ready'))
    }
  })
  guestObserver.observe(document.body, { childList: true })
  vi.stubGlobal('studybuddy', {
    status: async () => ({ phase: 'authenticated', scope }),
    subscribe: (listener: (state: { phase: string; scope?: typeof scope | null }) => void) => {
      accountListeners.add(listener); return () => accountListeners.delete(listener)
    },
    community: {
      acquire,
      release, setTheme: async () => {}, setVisible: async () => {},
      subscribeInvalid: (listener: (lease: string) => void) => { invalidated.add(listener); return () => invalidated.delete(listener) },
      subscribeNavigation: (listener: (notice: { scope: typeof scope; target: 'tools' | 'skills' | 'zhilian' }) => void) => { navigation.add(listener); return () => navigation.delete(listener) },
    },
    business: { invoke: async (method: string) => {
      if (method === 'getAiAccountSummary') return { balance: '10', availableBalance: '10', frozenBalance: '0', platformAccess: null }
      throw Error('UNUSED_FIXTURE_OPERATION')
    } },
    aigc: { acquire: acquireAigc, release, setTheme: async () => {}, setVisible: async () => {} },
  })
  let removeRoot: (() => void) | undefined
  try {
    await ctx.plugin(renderer).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.locale.setLocale('zh')
    ctx.slots.installLocale(ctx.locale)
    const noSession = createSnapshotStore<StandardSourceBinding>({ key: undefined, hooks: {}, keyedHooks: {}, props: {} })
    ctx.slots.installScope('session', { current: noSession, bindingSource: () => noSession })
    ctx.provide('layout', { panelInfo, selectPanel } as never)
    ctx.provide('theme', { getTheme: () => ({ active: { colorScheme: 'light' } }) } as never)
    ctx.provide('sessions', { retain: () => { throw Error('NO_NATIVE_PROJECT_HAS_BEEN_SELECTED') } } as never)
    ctx.provide('conversation', {} as never)
    // The native Conversation factory already owns the global composer chain.
    ctx.slots.registerFactory({ name: 'conversation.content', scope: 'session-maybe', children: {
      'conversation.composer': { kind: 'chain', scope: 'session' },
    } } as never, () => null)
    ctx.baseUrl = pathToFileURL(directory).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = {
      version: 'v2', import: async (name) => {
        if (name === '@deepseek-ai/dsh-client-ui-studybuddy-account') return account
        if (name === '@deepseek-ai/dsh-client-ui-studybuddy-pages') return pages
        throw Error('UNEXPECTED_MODULE')
      },
      loadCache: new Map(), register: () => { throw Error('UNEXPECTED_HOOK') }, getOrCreateModuleJob: () => { throw Error('UNEXPECTED_JOB') }, resolveSync: () => { throw Error('UNEXPECTED_RESOLUTION') }, load: () => { throw Error('UNEXPECTED_LOAD') },
    }
    const moduleDirectory = join(directory, 'node_modules/@deepseek-ai/dsh-client-ui-studybuddy-pages')
    await mkdir(moduleDirectory, { recursive: true })
    await writeFile(join(moduleDirectory, 'package.json'), await readFile('packages/client/ui-studybuddy-pages/package.json'))
    const accountDirectory = join(directory, 'node_modules/@deepseek-ai/dsh-client-ui-studybuddy-account')
    await mkdir(accountDirectory, { recursive: true })
    await writeFile(join(accountDirectory, 'package.json'), await readFile('packages/client/ui-studybuddy-account/package.json'))
    const config = join(directory, 'cordis.yml')
    await writeFile(config, '- id: account\n  name: "@deepseek-ai/dsh-client-ui-studybuddy-account"\n- id: pages\n  name: "@deepseek-ai/dsh-client-ui-studybuddy-pages"\n')
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await ctx.loader.await()
    removeRoot = ctx.slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' }, 'shell.overlay': { kind: 'list', scope: 'root' }, 'shell.actions': { kind: 'list', scope: 'root' }, 'settings.section': { kind: 'list', scope: 'root' } } } as never, ({ renderSlot }: PropsRenderSlots<'main'>) => renderSlot('main', {}, { entryKey: 'studybuddy.my-ai' as NonNullable<PanelInfo['activePanelId']> }))
    const entries = ctx.slots.entries('main')
    expect(entries.map(row => (row.options as { key: string }).key)).toEqual(['studybuddy.my-ai', 'studybuddy.skills', 'studybuddy.aigc'])
    expect(ctx.slots.entries('sidebar.panellist').map(row => row.options.id)).not.toContain('studybuddy.zhilian')
    expect(ctx.slots.entries('studybuddy.my-ai.leaderboard')).toHaveLength(1)
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(1)
    expect(ctx.slots.entries('studybuddy.aigc.conversation')).toHaveLength(1)
    const icons = ctx.slots.entries('sidebar.panellist').map((row) => {
      const Icon = row.component as ComponentType<{ size: number }>
      return renderToStaticMarkup(createElement(Icon, { size: 16 }))
    })
    expect(new Set(icons).size).toBe(3)
    for (const icon of icons) expect(icon).toContain('aria-hidden="true"')
    const injected = entries[1]!.inject!(), hooks = injected['hooks']
    if (!hooks || typeof hooks !== 'object' || !('page' in hooks) || !(hooks.page instanceof PageController)) throw new Error('Page controller was not injected')
    const page = hooks.page
    await vi.waitFor(() => { expect(page.getSnapshot().scope).toEqual(scope) })
    await vi.waitFor(() => { expect(acquire).toHaveBeenCalledTimes(2) }, { timeout: 4000 })
    expect(acquire.mock.calls.map(([target])=>target)).toEqual(['skills','zhilian'])
    await vi.waitFor(() => { expect(acquireAigc).toHaveBeenCalledTimes(1) }, { timeout: 2000 })
    expect(document.querySelectorAll('webview')).toHaveLength(3)
    expect([...document.querySelectorAll<HTMLElement>('webview')].every(guest=>guest.style.display==='none')).toBe(true)
    const preparedGuests = [...document.querySelectorAll('webview')]
    for (const listener of invalidated) listener('skills')
    await vi.waitFor(() => { expect(acquire).toHaveBeenCalledTimes(3) }, { timeout: 2000 })
    await vi.waitFor(() => { expect(document.querySelectorAll('webview')).toHaveLength(3) })
    expect(preparedGuests[0]!.isConnected).toBe(false)
    expect(preparedGuests[1]!.isConnected).toBe(true)
    expect(preparedGuests[2]!.isConnected).toBe(true)
    await page.acquire()
    expect(acquire).toHaveBeenCalledTimes(3)
    const local = entries[2]!.inject!().hooks as { page: PageController }
    await local.page.acquire()
    expect(acquireAigc).toHaveBeenCalledWith()
    await local.page.acquire()
    expect(acquireAigc).toHaveBeenCalledTimes(1)
    for (const listener of navigation) listener({ scope: { ...scope, generation: 5 }, target: 'tools' })
    expect(selectPanel).not.toHaveBeenCalled()
    for (const listener of navigation) listener({ scope, target: 'tools' })
    expect(selectPanel).toHaveBeenCalledWith('studybuddy.tools')
    selectPanel.mockClear()
    for (const listener of navigation) listener({ scope: { ...scope, generation: 5 }, target: 'zhilian' })
    expect(selectPanel).not.toHaveBeenCalled()
    for (const listener of navigation) listener({ scope, target: 'zhilian' })
    expect(selectPanel).toHaveBeenLastCalledWith('studybuddy.my-ai')
    expect(selectPanel).not.toHaveBeenCalledWith('studybuddy.zhilian')
    render(ctx.slots.renderSlot('root', {}))
    expect(screen.getByRole('tabpanel', { name: '排行榜' }).contains(screen.getByRole('region', { name: '排行榜' }))).toBe(true)
    const rankingGuest = document.querySelector('webview[aria-label="排行榜"]')
    const tabs = screen.getByRole('tablist', { name: '我的 AI' })
    fireEvent.click(within(tabs).getByRole('tab', { name: '个人资料' }))
    expect(screen.queryByRole('region', { name: '排行榜' })).toBeNull()
    fireEvent.click(within(tabs).getByRole('tab', { name: '排行榜' }))
    expect(document.querySelector('webview[aria-label="排行榜"]')).toBe(rankingGuest)
    expect(acquire.mock.calls.filter(([target]) => target === 'zhilian')).toHaveLength(1)
    for (const listener of invalidated) listener('skills')
    for (const listener of accountListeners) listener({ phase: 'signed-out' })
    expect(page.getSnapshot().lease).toBeNull()
    expect(document.querySelectorAll('webview')).toHaveLength(0)
    expect(release).toHaveBeenCalledWith('zhilian')
    expect(release).toHaveBeenCalledWith('aigc')
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(acquire).toHaveBeenCalledTimes(3)
    cleanup(); removeRoot(); removeRoot = undefined
    await ctx.fiber.dispose()
    expect(accountListeners.size).toBe(0)
    expect(navigation.size).toBe(0)
    expect(invalidated.size).toBe(0)
  } finally { cleanup(); guestObserver.disconnect(); removeRoot?.(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); vi.unstubAllGlobals() }
})
