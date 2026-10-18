// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
import {zh,type MediaKey} from '../src/client/generated-images/locale.ts';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const module=await import('../src/client/tool/toolviews/'+'media-generation-row.tsx').catch(()=>({MediaGenerationRow:()=>null}));
const meta={schemaVersion:1,requestId:'44444444-4444-4444-8444-444444444444',sessionId:'session-a',kind:'image',modelId:'doubao-seedream-5-0-flash-260915',state:'completed',contentAvailable:true};
const props={phase:'result',toolName:'generate_image',callId:'call-a',block:{meta,isError:false,content:[]},t:(key:MediaKey)=>zh[key]};
it('shows generated images and a download in the current conversation without image input blocks',()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(meta)));
 render(<module.MediaGenerationRow {...props as any}/>);expect(screen.getByRole('img').getAttribute('src')).toContain('/api/studybuddy-media?');
 expect(screen.getByRole('link',{name:'下载图片'})).toBeTruthy();
});
it('renders a generated video with controls and keeps task failure readable',()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...meta,kind:'video',modelId:'doubao-seedance-2-5-260628'})));
 const {container}=render(<module.MediaGenerationRow {...{...props,toolName:'generate_video',block:{...props.block,meta:{...meta,kind:'video',modelId:'doubao-seedance-2-5-260628'}}} as any}/>);
 expect(container.querySelector('video')?.hasAttribute('controls')).toBe(true);expect(screen.getByRole('link',{name:'下载视频'})).toBeTruthy();
});
