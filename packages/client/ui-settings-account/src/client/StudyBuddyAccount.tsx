/** StudyBuddy product identity occupies the existing account seats. */
import { useRef, useState } from 'react'
import { Button, IconEllipsisOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium, Menu, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AccountMenu.module.css'

export interface StudyBuddyIdentity {
  readonly phase: string
  readonly account?: { readonly id: string; readonly label: string }
  readonly message?: string
}
export interface StudyBuddyBridge {
  status(): Promise<StudyBuddyIdentity>
  logout(): Promise<StudyBuddyIdentity>
  checkUpdates(): Promise<{ readonly message: string }>
  subscribe(listener: (state: StudyBuddyIdentity) => void): () => void
}
export interface StudyBuddyAccountInjected {
  hooks: { studybuddy: HostObservable<StudyBuddyIdentity> }
  logout(): Promise<StudyBuddyIdentity>
  checkUpdates(): Promise<{ readonly message: string }>
}
type AccountProps = InjectFace<StudyBuddyAccountInjected>
type LauncherProps = AccountProps & PropsRuntime<'settings.launcher'>

export function StudyBuddyAccountMenu({ useStudybuddy, logout, checkUpdates, openSettings, wide, settingsShortcut }: LauncherProps) {
  const account = useStudybuddy(value => value)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  return <div className={css.root}>
    <Menu open={open} side="top" portal autoFocus className={css.anchor}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} aria-label="StudyBuddy 账号" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        <IconUserOutlineMedium size={24} />
        {wide && <><span className={css.label}>{account.account?.label ?? 'StudyBuddy'}</span><IconEllipsisOutlineMedium size={18} /></>}
      </button>}
      items={[
        { id: 'settings', label: '设置', icon: <IconSettingsOutlineMedium size={16} />, ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        { id: 'updates', label: '检查 StudyBuddy 更新', disabled: busy },
        { id: 'logout', label: '退出 StudyBuddy 登录', disabled: busy },
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        setOpen(false)
        if (id === 'settings') { trigger.current?.focus(); openSettings(); return }
        setBusy(true)
        const operation = id === 'updates' ? checkUpdates() : logout()
        void operation.then((value) => { setMessage(value.message ?? '') }).catch(() => { setMessage('操作暂时无法完成，请重试。') }).finally(() => { setBusy(false) })
      }} />
    {message && <Toast text={message} onDone={() => { setMessage('') }} />}
  </div>
}
export function StudyBuddyAccountSection({ useStudybuddy, logout, checkUpdates }: AccountProps) {
  const account = useStudybuddy(value => value)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const action = (operation: () => Promise<{ readonly message?: string }>): void => {
    setBusy(true)
    void operation().then((value) => { setMessage(value.message ?? '') }).catch(() => { setMessage('操作暂时无法完成，请重试。') }).finally(() => { setBusy(false) })
  }
  return <section>
    <h2>StudyBuddy 账号</h2>
    <p>{account.account?.label ?? '登录状态正在恢复'}</p>
    <Button disabled={busy} onClick={() => { action(checkUpdates) }}>检查更新</Button>
    <Button disabled={busy} onClick={() => { action(logout) }}>退出登录</Button>
    <p role="status">{message || account.message}</p>
  </section>
}
