/** Product welcome flow; website authorization is owned by the desktop main process. */
import { useEffect, useRef, useState } from 'react'
import type { StudyBuddyApi, StudyBuddyAuthState } from '../studybuddy/types.ts'
import './studybuddy-welcome.css'
export function StudyBuddyWelcome({ api }: { api: StudyBuddyApi }) {
  const [state, setState] = useState<StudyBuddyAuthState>({ phase: 'signed-out' })
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState<'start' | 'cancel' | 'logout' | null>(null)
  const epoch = useRef(0)
  const command = useRef(0)
  const current = useRef<'start' | 'cancel' | 'logout' | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const initial = epoch.current
    const off = api.subscribe((value) => { if (mounted.current) { ++epoch.current; setState(value); setFailed(false) } })
    void api.status().then((value) => {
      if (mounted.current && epoch.current === initial) setState(value)
    }).catch(() => { if (mounted.current && epoch.current === initial) setFailed(true) })
    return () => { mounted.current = false; ++command.current; off() }
  }, [api])
  const run = (kind: 'start' | 'cancel' | 'logout'): void => {
    if (current.current === kind || kind !== 'cancel' && current.current !== null) return
    const id = ++command.current
    const revision = epoch.current
    current.current = kind; setPending(kind); setFailed(false)
    void api[kind]().then((value) => {
      if (mounted.current && command.current === id && epoch.current === revision) setState(value)
    }).catch(() => { if (mounted.current && command.current === id) setFailed(true) }).finally(() => {
      if (mounted.current && command.current === id) { current.current = null; setPending(null) }
    })
  }
  const waiting = state.phase === 'waiting'
  const checkingRecovery = state.startupRecoveryFailed === true
  const exiting = state.logoutPending === true
  const starting = state.phase === 'starting' || pending === 'start' && !waiting || pending === 'logout'
  const done = state.phase === 'authenticated'
  const busy = starting || waiting
  const title = done ? '登录成功' : checkingRecovery ? starting ? '正在检查登录状态…' : '登录状态检查失败'
    : exiting ? starting ? '正在退出登录…' : '退出尚未完成' : waiting ? '请完成登录' : starting ? state.message ?? '正在连接登录服务…'
    : state.phase === 'error' || failed ? '暂时无法登录' : '你的AI学习搭子'
  const description = done ? '正在进入 StudyBuddy…'
    : checkingRecovery ? '账号数据已保留，重新检查后将恢复原登录。'
      : exiting ? '确认设备撤销和本机清理后，即可重新登录。' : waiting ? '在授权窗口中登录。成功后窗口会自动关闭，并返回客户端。'
      : starting ? '请稍候，正在准备你的账号。' : '登录 StudyBuddy，继续你的学习与创作。'
  return <>
    <div className="titlebar" aria-hidden="true" />
    <main className="studybuddy-login" aria-labelledby="studybuddy-login-heading">
      <img className="studybuddy-login-brand" src="assets/studybuddy-wordmark-v4-1x.png"
        srcSet="assets/studybuddy-wordmark-v4-1x.png 1x, assets/studybuddy-wordmark-v4-2x.png 2x" alt="StudyBuddy 硅基同桌" />
      <section className="studybuddy-login-content" aria-live="polite">
        <h1 id="studybuddy-login-heading">{title}</h1>
        <p>{description}</p>
        <p className="studybuddy-login-status" role="status">
          {failed ? checkingRecovery ? '状态检查暂时不可用，请重新检查。' : exiting ? '退出服务暂时不可用，请重试退出。' : '登录服务暂时不可用，请重试。' : state.phase === 'error' || waiting || state.logoutOutcome?.persistentCleanupRequired ? state.message ?? '' : ''}
        </p>
      </section>
      <div className="studybuddy-login-actions">
        <button className="primary" type="button" disabled={starting || done || pending === 'cancel'} onClick={() => { run(exiting&&!checkingRecovery?'logout':'start') }}>
          {done ? '正在打开…' : checkingRecovery ? starting ? '正在检查…' : '重新检查' : exiting ? starting ? '正在退出…' : '重试退出登录' : starting ? '请稍候…' : waiting ? '返回登录窗口' : state.phase === 'error' || failed ? '重新登录' : '登录 StudyBuddy'}
        </button>
        {busy && !exiting && <button className="secondary" type="button" disabled={pending === 'cancel'} onClick={() => { run('cancel') }}>
          {pending === 'cancel' ? '正在取消…' : '取消登录'}
        </button>}
        {!busy && !done && !exiting && <p className="studybuddy-login-footnote">授权完成后自动返回客户端</p>}
      </div>
    </main>
  </>
}
