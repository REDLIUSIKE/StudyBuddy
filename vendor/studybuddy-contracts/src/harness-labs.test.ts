import {expect,it} from 'vitest';
import {parseCodexChineseView} from './harness-labs.js';
const status=()=>({ui:{status:'not_configured'},package:{status:'unavailable',errorCode:'CODEX_UI_TOOL_CENTER_DETECTION_REQUIRED'},canRestore:false,diagnostic:{phase:'installation_binding',operationId:'fixture-operation'}});
it('preserves original laboratory status and rejects extra configuration or credential fields',()=>{
  expect(parseCodexChineseView(status())).toEqual(status());
  for(const value of [{...status(),config:'secret'},{...status(),ui:{status:'configured',key:'secret'}},{...status(),runtime:{status:'running',processCount:-1}},{...status(),diagnostic:{phase:'free-text',operationId:'fixture'}},{...status(),completion:'success'}])expect(()=>parseCodexChineseView(value)).toThrow('CODEX_CHINESE_VIEW_INVALID');
});
