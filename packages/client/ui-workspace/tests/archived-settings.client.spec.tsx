// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {bindSnapshotSelector,makeTranslate} from '@deepseek-ai/dsh-client-test-runtime'
import {createSnapshotStore} from '@deepseek-ai/dsh-client-store'
import type {SessionListState} from '@deepseek-ai/dsh-api-session-controller/client'
import type {WorkspaceSnapshot} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {zh as commonZh} from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import {ArchivedSessionsSettings} from '../src/client/ArchivedSessionsSettings.tsx'
import {zh} from '../src/client/locales.ts'

afterEach(cleanup)
const sid=(value:string)=>value as SessionId
function fixture(){
  const sessions=createSnapshotStore<SessionListState>({ids:[sid('saved'),sid('active')],byId:{
    [sid('saved')]:{id:sid('saved'),displayTitle:'学习记录',running:false,blank:false,updatedAt:2,retainedBy:{}},
    [sid('active')]:{id:sid('active'),displayTitle:'普通对话',running:false,blank:false,updatedAt:3,retainedBy:{}},
  },phase:'ready',projectionsBySession:{}})
  const workspaces=createSnapshotStore<WorkspaceSnapshot>({items:[],archivedSessionIds:[sid('saved'),sid('cold')],pinnedSessionIds:[],state:'idle',phase:'ready',error:null})
  const unarchiveSession=vi.fn(async(_id:SessionId)=>{})
  const props={useSessions:bindSnapshotSelector(sessions),useWorkspaces:bindSnapshotSelector(workspaces),unarchiveSession,t:makeTranslate(zh,commonZh)}
  return{sessions,workspaces,unarchiveSession,props}
}
it('lists archived records independently of the sidebar filter and keeps unknown cold metadata recoverable',()=>{
  const f=fixture();render(<ArchivedSessionsSettings {...f.props}/> )
  expect(screen.getByRole('heading',{name:'已归档会话'})).toBeTruthy()
  expect(screen.getByText('学习记录')).toBeTruthy()
  expect(screen.getByText('cold')).toBeTruthy()
  expect(screen.queryByText('普通对话')).toBeNull()
  expect(f.unarchiveSession).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox',{name:'搜索已归档会话'}),{target:{value:'学习'}})
  expect(screen.getByText('学习记录')).toBeTruthy()
  expect(screen.queryByText('cold')).toBeNull()
})
it('updates a retained archived row when its cold title arrives without opening the Session',()=>{
  const f=fixture();render(<ArchivedSessionsSettings {...f.props}/> )
  act(()=>{const old=f.sessions.getSnapshot();f.sessions.set({...old,ids:[...old.ids,sid('cold')],byId:{...old.byId,[sid('cold')]:{id:sid('cold'),displayTitle:'旧资料',blank:false,running:false,retainedBy:{},updatedAt:1}}})})
  expect(screen.getByText('旧资料')).toBeTruthy()
  expect(screen.queryByText('cold')).toBeNull()
  expect(f.unarchiveSession).not.toHaveBeenCalled()
})
it('awaits one exact restore, keeps its pending row, and reflects the authoritative archive update',async()=>{
  const f=fixture(),pending=Promise.withResolvers<void>()
  f.unarchiveSession.mockImplementation(()=>pending.promise)
  render(<ArchivedSessionsSettings {...f.props}/> )
  const button=screen.getByRole('button',{name:'取消归档 学习记录'})
  fireEvent.click(button);fireEvent.click(button)
  expect(f.unarchiveSession).toHaveBeenCalledExactlyOnceWith(sid('saved'))
  expect(button.hasAttribute('disabled')).toBe(true)
  expect(screen.getByText('学习记录')).toBeTruthy()
  await act(async()=>{f.workspaces.set({...f.workspaces.getSnapshot(),archivedSessionIds:[sid('cold')]});pending.resolve();await pending.promise})
  await waitFor(()=>expect(screen.queryByText('学习记录')).toBeNull())
  expect(f.sessions.getSnapshot().byId[sid('saved')]?.displayTitle).toBe('学习记录')
  expect(screen.getByText('已取消归档')).toBeTruthy()
})
it('keeps the record on a failed restore and offers the same operation again',async()=>{
  const f=fixture();f.unarchiveSession.mockRejectedValueOnce(Error('fixture unavailable'))
  render(<ArchivedSessionsSettings {...f.props}/> )
  fireEvent.click(screen.getByRole('button',{name:'取消归档 学习记录'}))
  expect((await screen.findByRole('alert')).textContent).toBe('取消归档失败，请重试')
  expect(screen.getByText('学习记录')).toBeTruthy()
  expect(screen.getByRole('button',{name:'取消归档 学习记录'}).hasAttribute('disabled')).toBe(false)
})
it('distinguishes loading, a loaded empty archive, and a search with no matches',()=>{
  const f=fixture();f.sessions.set({...f.sessions.getSnapshot(),phase:'pending'});f.workspaces.set({...f.workspaces.getSnapshot(),archivedSessionIds:[]})
  render(<ArchivedSessionsSettings {...f.props}/> )
  expect(screen.queryByText('暂无已归档会话')).toBeNull()
  act(()=>f.sessions.set({...f.sessions.getSnapshot(),phase:'ready'}))
  expect(screen.getByText('暂无已归档会话')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox',{name:'搜索已归档会话'}),{target:{value:'不存在'}})
  expect(screen.getByText('无匹配结果')).toBeTruthy()
})
