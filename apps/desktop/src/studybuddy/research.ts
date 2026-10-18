/** Retained local guests and their native project actions belong to the original account. */
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Session, WebContents } from 'electron'
import type { StudyBuddyAuth } from './services.ts'
import { StudyBuddyEmbeddedGuests } from './embedded-guests.ts'
import { ResearchRuntime } from './research-runtime.ts'
import { ResearchBridge } from './research-bridge.ts'
import { RESEARCH_IPC } from './research-types.ts'
import { settleCleanup } from '../settle-cleanup.ts'
import { parseResearchPageAction } from './research-actions.ts'
import { ResearchIntentStore } from './research-intents.ts'
import { accountResearchDirectory } from './research-runtime.ts'
import type { OwnedScope } from '@studybuddy/contracts'
import {researchOfficialLink} from './research-links.ts'

interface Options {
  userDataRoot: string
  auth: Pick<StudyBuddyAuth, 'scope' | 'withSession'>
  runtime: ResearchRuntime
  bridge: ResearchBridge
  preload: string
  fromPartition(partition: string): Session
  openExternal?(url:string):Promise<void>
}
/** The public lease controls only guest lifetime and exact native project selection. */
export class StudyBuddyResearch {
  private readonly guests: StudyBuddyEmbeddedGuests
  private readonly revisions = new Map<number, number>()
  private store: { key: string; value: ResearchIntentStore } | undefined
  private intents(scope: OwnedScope): ResearchIntentStore {
    const key = JSON.stringify(scope)
    if (this.store?.key !== key) this.store = { key, value: new ResearchIntentStore(accountResearchDirectory(this.options.userDataRoot, scope.accountId), () => JSON.stringify(this.options.auth.scope()) === key) }
    return this.store.value
  }
  constructor(private readonly options: Options) {
    const allowed = (url: string) => {
      const scope = options.auth.scope()
      return !!scope && Object.keys(options.runtime.requestHeaders(scope, url)).length > 0
    }
    this.guests = new StudyBuddyEmbeddedGuests(options.auth, () => Promise.reject(Error('RESEARCH_PUBLIC_EXCHANGE_DENIED')),
      partition => options.fromPartition(partition), undefined, (owner, lease) => { if (!owner.isDestroyed()) owner.send(RESEARCH_IPC.invalid, lease) }, {
        target: 'research', preload: options.preload, navigationAllowed: allowed,
        validateEntry: value => { if (typeof value !== 'string' || !allowed(value)) throw Error('RESEARCH_ENTRY_INVALID'); return value },
        openExternal:async url=>{const exact=researchOfficialLink(url);if(!options.openExternal)throw Error('RESEARCH_EXTERNAL_LINK_UNAVAILABLE');await options.openExternal(exact)},
        issue: async ({ scope }) => {
          const { origin } = await options.runtime.ensure(scope)
          return { entryUrl: origin + '/', requestAllowed: value => {
            if (!URL.canParse(value)) return false
            const url = new URL(value)
            return ['about:', 'data:'].includes(url.protocol) || url.protocol === 'blob:' && url.origin === origin || allowed(value)
          }, requestHeaders: value => options.runtime.requestHeaders(scope, value) }
        },
      })
  }
  recognizes(owner: WebContents, src: string, partition?: string): boolean { return this.guests.recognizes(owner, src, partition) }
  bind(window: BrowserWindow, attach: (guest: WebContents, id: string) => () => void, reserved: (src: string, partition?: string) => boolean): void {
    this.guests.bind(window, attach, reserved)
  }
  async revoke(): Promise<void> {
    this.revisions.clear()
    this.store = undefined
    await settleCleanup([this.guests.revoke(true), this.options.runtime.revoke(), this.options.bridge.revoke()])
  }
  register(ipc: IpcMain, assertOwner: (event: IpcMainInvokeEvent) => void): void {
    const result = async (run: () => Promise<unknown>) => {
      try { return { ok: true, data: await run() } }
      catch (error) { return { ok: false, error: { code: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'RESEARCH_ACTION_FAILED' } } }
    }
    const owner = (event: IpcMainInvokeEvent, run: () => Promise<unknown>) => result(async () => { assertOwner(event); return run() })
    ipc.handle(RESEARCH_IPC.acquire, event => owner(event, () => this.guests.acquire(event.sender)))
    ipc.handle(RESEARCH_IPC.release, (event, lease: unknown) => owner(event, () => this.guests.release(event.sender, lease)))
    ipc.handle(RESEARCH_IPC.theme, (event, lease: unknown, theme: unknown) => owner(event, () => this.guests.setTheme(event.sender, lease, theme)))
    ipc.handle(RESEARCH_IPC.visible, (event, lease: unknown, visible: unknown) => owner(event, async () => {
      if (typeof lease !== 'string' || typeof visible !== 'boolean') throw Error('RESEARCH_ACTION_INVALID')
      await this.guests.setVisible(event.sender, lease, visible)
    }))
    ipc.handle(RESEARCH_IPC.acknowledgeIntent, (event, id: unknown) => owner(event, async () => {
      const scope = this.options.auth.scope()
      if (!scope || typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw Error('RESEARCH_ACTION_INVALID')
      await this.intents(scope).acknowledge(id)
    }))
    ipc.handle(RESEARCH_IPC.guestAction, (event, action: unknown) => result(async () => {
      const guest = this.guests.checkedGuest(event), scope = guest.lease.scope
      const record = parseResearchPageAction(action)
      if(record.kind==='open-service-site'){
        if(!this.options.openExternal)throw Error('RESEARCH_EXTERNAL_LINK_UNAVAILABLE')
        await this.options.openExternal(researchOfficialLink(record.url))
        return {opened:true}
      }
      const selecting = ['open-project', 'new-chat', 'select-chat', 'close-chat', 'show-projects'].includes(record.kind)
      const revision = selecting ? (this.revisions.get(event.sender.id) ?? 0) + 1 : this.revisions.get(event.sender.id) ?? 0
      if (selecting) this.revisions.set(event.sender.id, revision)
      let data: unknown = null
      try {
      if ('projectId' in record) {
        const chats = await this.options.bridge.chats(scope, record.projectId,
          record.kind === 'new-chat' ? 'create' : record.kind === 'select-chat' ? 'select' : record.kind === 'close-chat' ? 'close' : 'list',
          'sessionId' in record ? record.sessionId : undefined)
        if (record.kind === 'list-chats') return chats
        if (chats.selectedSessionId === null) {
          if (record.kind === 'reference' || record.kind === 'draft') throw Error('RESEARCH_CHAT_NOT_SELECTED')
          data = { projectId: record.projectId, sessionId: null, chats: chats.chats, intents: [] }
        } else {
        if (record.kind === 'reference') await this.options.bridge.reference(scope, record.projectId, record.path)
        if (record.kind === 'draft') for (const path of record.references) await this.options.bridge.reference(scope, record.projectId, path)
        const context = await this.options.bridge.bind(scope, record.projectId)
        const prepared = record.kind === 'draft' ? await this.intents(scope).append(context.projectId, context.sessionId, record.text, record.references) : undefined
        data = { projectId: context.projectId, workspaceId: context.workspaceId, sessionId: context.sessionId, chats: chats.chats,
          intents: await this.intents(scope).list(context.projectId, context.sessionId), ...(prepared ? { preparedIntentId: prepared.id } : {}) }
        }
      }
      } catch (error) {
        // Rejected admission never switches a retained composer to a different project.
        try {
          this.guests.checkedGuest(event)
          const host = event.sender.hostWebContents
          if (selecting && 'projectId' in record && this.revisions.get(event.sender.id) === revision && host && !host.isDestroyed()) {
            host.send(RESEARCH_IPC.action, { lease: guest.lease.lease, scope, revision, action: record, errorCode: 'RESEARCH_NATIVE_SESSION_UNAVAILABLE' })
          }
        } catch { /* Revocation cannot publish to a different account. */ }
        throw error
      }
      // Revalidate ownership after native admission before notifying the shell.
      this.guests.checkedGuest(event)
      // The guest manager's checked record does not expose its owner; route to its host contents.
      const host = event.sender.hostWebContents
      if (!host || host.isDestroyed()) throw Error('RESEARCH_OWNER_REVOKED')
      if (!selecting || this.revisions.get(event.sender.id) === revision) host.send(RESEARCH_IPC.action, { lease: guest.lease.lease, scope, revision, action: record, data })
      return data
    }))
  }
}
