/** Desktop notice composition; Web profiles without the native bridge keep existing image behavior. */
import type { Context } from '@deepseek-ai/cordis'
import type { DesktopImageBridge } from '../../image-actions-protocol.ts'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ImageTab } from './ImageTab.tsx'
import { imageDefinition, IMAGE_TAB_ID } from './definition.ts'
import { runImageAction } from './actions.ts'
import { MEDIA_NS } from '../generated-images/locale.ts'

/** Register optional desktop actions and the established right-Sidebar tab extension. */
export function applyImageActions(ctx: Context): void {
  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'locale', 'sessions', 'conversation'], scope => {
    const t = scope.locale.bind(MEDIA_NS)
    scope.effect(() => scope.sidebarRightTabs.register(imageDefinition(() => t('image.alt'))), 'ui-tool: image tab')
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: IMAGE_TAB_ID, locale: MEDIA_NS }, ImageTab)), 'ui-tool: image tab body')
    const bridge = (window as Window & { dshDesktop?: { images?: DesktopImageBridge } }).dshDesktop?.images
    if (bridge === undefined) return
    let epoch = 0
    scope.on('connection/reset', () => { epoch++ })
    scope.effect(() => bridge.subscribe(action => {
      const id = scope.sessions.list.getSnapshot().ids.find(id => id === action.target.sessionId)
      const owner = id === undefined ? undefined : scope.sessions.scope(id)
      if (owner === undefined || id === undefined) return
      const conversation = owner.get('conversation')
      if (conversation === undefined) return
      const generation = epoch
      const current = () => {
        const sameScope = scope.sessions.scope(id) === owner
        const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-session]')).some(element => element.dataset.chatSession === id && element.getClientRects().length > 0)
        return generation === epoch && sameScope && visible
      }
      void runImageAction(action, { current, open: address => { scope.sidebarRight.openResource(address) },
        fetch: url => fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) }), add: file => conversation.addImageToDraft(file),
      }).then(result => {
        if (result === 'failed' && current()) conversation.input.for(owner).notify('error', t('image.actionFailed'))
      })
    }), 'ui-tool: desktop image actions')
    scope.effect(() => () => { epoch++ }, 'ui-tool: pending image actions')
  })
}
