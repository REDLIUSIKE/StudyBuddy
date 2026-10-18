/**
 * Plugin manager, browser half: the **Plugins** section of Settings.
 * The page installs, enables,
 * disables, and removes the bundles of the Host's profile through the
 * `pluginManager` Remote and switches their rows in the profile's user layer.
 * A plugin that carries its own configuration renders it on this page through
 * the slots the page declares (`slot-contract.ts`).
 */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the settings section and shell-owned navigation contracts.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the forwarded events' own declaration (`$on`'s key face resolves
// through the owning package's client-safe types subpath).
import type {} from '@deepseek-ai/dsh-plugin-manager/types'
import { PluginManagerPage } from './PluginManagerPage.tsx'
import { PluginRefreshToast, type PluginRefreshToastFace } from './PluginRefreshToast.tsx'
import { configLedgerSource } from './config-ledger.ts'
import { PluginManagerController } from './manager-store.ts'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'
import { createNavigationStore } from './navigation-store.ts'
import { preloadPages } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from './slot-contract.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Cross-plugin navigation to the Plugins settings section. */
    pluginNavigation: {
      /**
       * Open a bundle's details without changing the current Session.
       * An absent bundle displays the plugin list after loading.
       * @param packageName - npm package name of the bundle.
       */
      openBundle(packageName: string): void
    }
  }
}

export type { PluginManagerPageProps } from './PluginManagerPage.tsx'
export type { ConfigLedger, OfficialItem } from './config-ledger.ts'
export type { PluginManagerFace } from './manager-store.ts'
export type { PluginManagerLocaleKey } from './locales.ts'
export type {
  ConfigPageForm, PluginActivationOwnerProps, PluginAddActionsProps,
  PluginConfigViewProps, PluginDetailProps, PluginPackageRef, PluginRowRef, PluginsSubject,
} from './slot-contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin manager tab copy. */
    'pluginManager': PluginManagerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'pluginManager'

/** Settings section identity used by plugin configuration links. */
const SECTION_ID = 'plugin-manager'

/** Settings navigation and Remote methods; inventory says whether the Host manages a profile. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe', 'configForms', 'settingsNavigation']

/**
 * Contribute the Plugins settings section and keep it current on Host changes.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = new PluginManagerController(ctx)
  ctx.effect(() => () => { controller.dispose() }, 'ui-plugin-manager: controller')
  ctx.effect(() => preloadPages([{ id: 'plugins', priority: 70, prepare: () => controller.load() }]), 'ui-plugin-manager: background inventory')
  // The Host says when what is installed, enabled, or composed changed — from
  // this page, the CLI, or another browser — and streams install output.
  ctx.effect(() => {
    // A page never rendered holds no snapshot to refresh.
    const refresh = (): void => {
      if (controller.getSnapshot().status !== 'idle') void controller.load()
    }
    const disposers = [
      ctx.remote.$on('plugin-manager/changed', refresh),
      ctx.remote.$on('plugin-manager/install-log', (chunk) => { controller.appendLog(chunk) }),
      ctx.remote.$on('plugin-manager/install-state', (progress) => { controller.installProgress(progress) }),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-plugin-manager: host invalidations')

  // The settings section belongs to the profile, not to a Session.
  // What is installed and switched on is
  // the page's own; a plugin's configuration arrives through the slots the
  // page declares here, so the page never names a configurable plugin.
  const configLedger = configLedgerSource(ctx)
  const face = controller.inject(configLedger, text => ctx.locale.resolveText(text))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'plugin-manager.refresh-toast', locale: NS,
    inject: (): PluginRefreshToastFace => ({
      hooks: { pluginManager: face.hooks.pluginManager },
      dismissNotice: face.dismissNotice,
    }),
  }, PluginRefreshToast))
  ctx.slots.inject('settings.section', function* () {
    const handle = createNavigationStore(), instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    yield ctx.slots.register({
      name: 'settings.section',
      id: SECTION_ID,
      order: 17,
      label: () => t('panel'),
      locale: NS,
      store,
      inject: () => face,
      children: {
        'plugins.add.actions': { kind: 'list', scope: 'root' },
        'plugins.item': { kind: 'list', scope: 'root' },
        'plugins.bundle.activation': { kind: 'keyed', scope: 'root' },
        'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
        'plugins.row.config': { kind: 'keyed', scope: 'root' },
        'plugins.detail.actions': { kind: 'list', scope: 'root' },
        'plugins.detail.badge': { kind: 'list', scope: 'root' },
        'plugins.detail.section': { kind: 'list', scope: 'root' },
      },
    }, PluginManagerPage)
    yield ctx.settingsNavigation.state.subscribe(() => {
      const state = ctx.settingsNavigation.state.getSnapshot()
      if (!state.open || state.activeId !== SECTION_ID) instance.actions.setView({ kind: 'list' })
    })
    const disposeNavigation = ctx.reflect.provide('pluginNavigation', {
      openBundle: (packageName: string) => {
        ctx.settingsNavigation.openSection(SECTION_ID)
        instance.actions.setView({ kind: 'package', name: packageName })
      },
    })
    yield () => { void disposeNavigation() }
  })
}
