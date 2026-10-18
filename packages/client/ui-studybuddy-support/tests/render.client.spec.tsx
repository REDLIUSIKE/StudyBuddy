// @vitest-environment jsdom
import { render,screen,cleanup } from '@testing-library/react'
import { afterEach,expect,it } from 'vitest'
import { HelpFeedbackSection } from '../src/client/HelpFeedbackSection.tsx'
import { SupportController, type SupportHost } from '../src/client/support-controller.ts'
import { createSupportViewStore } from '../src/client/view-store.ts'
import { zh } from '../src/client/locales.ts'
import type { ComponentProps } from 'react'
import { parseSupportRequestId, type HarnessSupportOperationView } from '@studybuddy/contracts'
afterEach(cleanup)
it('renders the real settings section and keeps unavailable environments explicit',()=>{
  const controller=new SupportController(undefined),store=createSupportViewStore().create()
  const props={ useSupport:(selector: (value:ReturnType<typeof controller.getSnapshot>)=>unknown)=>selector(controller.getSnapshot()),
    useStore:(selector:(value:ReturnType<typeof store.getSnapshot>)=>unknown)=>selector(store.getSnapshot()),actions:store.actions,
    preview:controller.preview,uploadLogs:controller.uploadLogs,submitIssue:controller.submitIssue,
    selectScreenshots:controller.selectScreenshots, copyReference:controller.copyReference,checkUpdates:controller.checkUpdates,
    t:(key:keyof typeof zh)=>zh[key] } as ComponentProps<typeof HelpFeedbackSection>
  render(<HelpFeedbackSection {...props}/>);expect(screen.getByRole('heading',{ name:'遇到问题，我们来帮你' })).toBeTruthy()
  expect(screen.getByText(zh.unavailable)).toBeTruthy();expect(screen.queryByText(zh.upload)).toBeNull();controller.dispose()
})
it.each(['idle','preview','running','available','unconfirmed','error'] as const)('renders the owner-local %s state with safe request correlation', (state) => {
  const requestId=parseSupportRequestId('123e4567-e89b-42d3-a456-426614174002')
  const log={ uploadId:'123e4567-e89b-42d3-a456-426614174003',publicCode:'LOG-8K2P7M4Q',status:'AVAILABLE' } as const
  const operation:HarnessSupportOperationView=state==='running'?{ state:'running',requestId,flow:'logs',phase:'uploading' }
    :state==='available'?{ state:'available',requestId,flow:'logs',log }
      :state==='unconfirmed'?{ state:'submission_unconfirmed',requestId,flow:'issue',log,error:{ code:'LOG_UPLOAD_TIMEOUT' } }
        :state==='error'?{ state:'failed',requestId,flow:'logs',phase:'uploading',error:{ code:'LOG_UPLOAD_REJECTED' } }:{ state:'idle' }
  const controller=new SupportController(undefined),store=createSupportViewStore().create()
  const snapshot: ReturnType<typeof controller.getSnapshot>={ ...controller.getSnapshot(),available:true,scope:{ accountId:'123e4567-e89b-42d3-a456-426614174001',generation:1 },
    operation,busy:state==='running',issueUnconfirmed:state==='unconfirmed',preview:state==='preview'?{
      range:'last_24_hours',fileCount:2,eventCount:3,compressedBytes:'1024',firstOccurredAt:'2026-10-12T00:00:00.000Z',lastOccurredAt:'2026-10-12T00:00:00.000Z',
      sources:[{ source:'desktop_main',state:'present' },{ source:'host',state:'unavailable' },{ source:'renderer',state:'unavailable' },
        { source:'tool_center',state:'unavailable' },{ source:'community',state:'unavailable' },{ source:'skills',state:'unavailable' },
        { source:'personal_ai',state:'unavailable' },{ source:'labs',state:'unavailable' },{ source:'aigc',state:'unavailable' }],
    }:null }
  const props={ useSupport:(selector:(value:ReturnType<typeof controller.getSnapshot>)=>unknown)=>selector(snapshot),
    useStore:(selector:(value:ReturnType<typeof store.getSnapshot>)=>unknown)=>selector(store.getSnapshot()),actions:store.actions,
    preview:controller.preview,uploadLogs:controller.uploadLogs,submitIssue:controller.submitIssue,
    selectScreenshots:controller.selectScreenshots,copyReference:controller.copyReference,checkUpdates:controller.checkUpdates,
    t:(key:keyof typeof zh)=>zh[key] } as ComponentProps<typeof HelpFeedbackSection>
  const rendered=render(<HelpFeedbackSection {...props}/>)
  if(operation.state!=='idle')expect(screen.getByText(requestId)).toBeTruthy()
  if(state==='unconfirmed'){expect(screen.getByText(zh.unconfirmed)).toBeTruthy();expect(screen.getByText(log.publicCode)).toBeTruthy()}
  if(state==='error')expect(screen.getByText('LOG_UPLOAD_REJECTED')).toBeTruthy()
  expect(rendered.container.innerHTML.replaceAll('><', '>\n<')).toMatchSnapshot();controller.dispose()
})
it('shows the complete-Key disclosure before an authenticated log upload',()=>{
  const host:SupportHost={ status:async()=>({ phase:'authenticated' }),subscribe:()=>()=>{},checkUpdates:async()=>({ phase:'idle',message:'' }),
    support:{ preview:async()=>{throw new Error('unused')},uploadLogs:async()=>({ state:'idle' }),selectScreenshots:async()=>[],submitIssue:async()=>({ state:'idle' }),getOperation:async()=>({ state:'idle' }),readPreviousExit:async()=>({ detected:false }),subscribe:()=>()=>{} } }
  const controller=new SupportController(host);controller.setScope({ accountId:'123e4567-e89b-42d3-a456-426614174001',generation:1 });const store=createSupportViewStore().create()
  const props={ useSupport:(selector:(value:ReturnType<typeof controller.getSnapshot>)=>unknown)=>selector(controller.getSnapshot()),
    useStore:(selector:(value:ReturnType<typeof store.getSnapshot>)=>unknown)=>selector(store.getSnapshot()),actions:store.actions,
    preview:controller.preview,uploadLogs:controller.uploadLogs,submitIssue:controller.submitIssue,
    selectScreenshots:controller.selectScreenshots, copyReference:controller.copyReference,checkUpdates:controller.checkUpdates,
    t:(key:keyof typeof zh)=>zh[key] } as ComponentProps<typeof HelpFeedbackSection>
  render(<HelpFeedbackSection {...props}/>);expect(screen.getByText(zh.keyNotice)).toBeTruthy();expect(screen.getByRole('button',{ name:zh.upload })).toBeTruthy();controller.dispose()
})
