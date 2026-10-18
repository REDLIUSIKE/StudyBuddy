// @vitest-environment jsdom
import {render,screen,cleanup} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import {SkillSafetyGuidance,type SkillSafetyGuidanceProps} from '../src/client/SkillSafetyGuidance.tsx'
import {zh} from '../src/client/locales.ts'
afterEach(cleanup)
function fixture(preset='skill-safety') {
  const captureInsertion=vi.fn(()=>({start:3,end:3,draftRev:2})),insertText=vi.fn(()=>true),submit=vi.fn(),setDraft=vi.fn()
  const props={sessionId:'session-fixture',useSessions: (select:any)=>select({byId:{'session-fixture':{projectionValues:{agentPreset:preset}}}}),inputActions:{captureInsertion,insertText,submit,setDraft},t:(key:keyof typeof zh)=>zh[key]} as unknown as SkillSafetyGuidanceProps
  return {props,captureInsertion,insertText,submit,setDraft}
}
it('shows only opening guidance without fixed choices or composer actions',()=>{
  const f=fixture();render(<SkillSafetyGuidance {...f.props}/>);
  expect(screen.getByRole('heading',{name:'你想检查哪个技能？'})).toBeTruthy()
  expect(screen.getByText(zh.safetyGuide)).toBeTruthy()
  expect(screen.queryAllByRole('button')).toEqual([])
  expect(f.captureInsertion).not.toHaveBeenCalled();expect(f.insertText).not.toHaveBeenCalled()
  expect(f.submit).not.toHaveBeenCalled();expect(f.setDraft).not.toHaveBeenCalled()
  expect(screen.queryByText(/下载扫描器/)).toBeNull()
})
it('does not guide an ordinary chat or an absent scoped composer',()=>{
  const f=fixture('standard'),view=render(<SkillSafetyGuidance {...f.props}/>);expect(view.container.textContent).toBe('')
  view.rerender(<SkillSafetyGuidance {...fixture().props} inputActions={undefined}/>);expect(view.container.textContent).toBe('')
})
