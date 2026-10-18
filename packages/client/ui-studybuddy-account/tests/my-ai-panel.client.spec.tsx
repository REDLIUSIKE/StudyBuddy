// @vitest-environment jsdom
import {useState} from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {MyAiPanel,type MyAiPanelProps} from '../src/client/MyAiPanel.tsx'
import {zh} from '../src/client/locales.ts'

afterEach(cleanup)
it('opens models and the existing leaderboard in sibling tabs without attaching another profile guest',()=>{
  const profile=vi.fn((container:HTMLElement)=>{container.textContent='个人资料正文';return()=>{}})
  const insights=vi.fn((container:HTMLElement)=>{container.textContent='模型信息正文';return()=>{}})
  const activate=vi.fn()
  function Panel(){
    const [tab,setTab]=useState('profile')
    const props={t:(key:keyof typeof zh)=>zh[key],
      useStore:(select:(value:unknown)=>unknown)=>select({tab,sourceEditorOpen:false}),
      useAccount:(select:(value:unknown)=>unknown)=>select({scope:{accountId:'fixture-owner',generation:1}}),
      useSource:(select:(value:unknown)=>unknown)=>select({sources:[],draft:null,checkResult:null,readiness:[],details:{}}),
      useProfile:(select:(value:unknown)=>unknown)=>select({busy:false,errorCode:null}),
      useModelInsights:(select:(value:unknown)=>unknown)=>select({busy:false,errorCode:null}),
      actions:{selectTab:setTab},source:{clearDraft:()=>{}},activate,
      attachProfile:profile,attachModelInsights:insights,retryProfile:async()=>{},retryModelInsights:async()=>{},
      renderSlot:()=> <section aria-label="排行榜">排行榜正文</section>,
    } as MyAiPanelProps
    return <MyAiPanel {...props}/>
  }
  render(<Panel/>)
  const tabs=screen.getByRole('tablist',{name:'我的 AI'})
  expect(within(tabs).getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['个人资料','自备模型','模型','排行榜'])
  expect(insights).not.toHaveBeenCalled()
  fireEvent.click(within(tabs).getByRole('tab',{name:'模型'}))
  expect(activate).toHaveBeenLastCalledWith('models')
  expect(screen.getByRole('tabpanel',{name:'模型'}).textContent).toBe('模型信息正文')
  expect(profile).toHaveBeenCalledTimes(1)
  fireEvent.click(within(tabs).getByRole('tab',{name:'排行榜'}))
  expect(activate).toHaveBeenLastCalledWith('leaderboard')
  expect(screen.getByRole('tabpanel',{name:'排行榜'}).textContent).toBe('排行榜正文')
  fireEvent.click(within(tabs).getByRole('tab',{name:'个人资料'}))
  expect(screen.getByRole('tabpanel',{name:'个人资料'}).textContent).toBe('个人资料正文')
})
