import {expect,it} from "vitest";
import * as contracts from "./index.js";
const id="11111111-1111-4111-8111-111111111111";
const metadata={sourceKind:"local_folder",sourceToolId:null,declaredVersion:"1.2",tags:["课程","写作"]};
const instance={instanceId:"instance_local",scopeId:"scope_hub",displayName:"notes",contentSha256:"a".repeat(64),toolId:"chatgpt_desktop",scope:"hub",description:null,managed:true,listingId:null,package:null,compatibility:{state:"compatible",reasonCode:null},recognition:"pending",runtime:"unverified"};
const request={operationId:id,instanceId:"instance_local",scanRevision:"scan_1",targets:[{toolId:"codex_cli",scopeId:"project_1"},{toolId:"claude_code",scopeId:"user_1"}],mode:"link",conflictPolicy:"keep"};
const preview={operationId:id,source:{instanceId:"instance_local",contentSha256:"a".repeat(64)},results:[{target:request.targets[0],status:"ready",reasonCode:null},{target:request.targets[1],status:"blocked",reasonCode:"SKILL_LINK_UNVERIFIED"}]};
it("accepts additive library metadata while old instances retain no invented origin",()=>{
 expect(contracts.parseSkillInstance(instance)).not.toHaveProperty("library");
 expect(contracts.parseSkillInstance({...instance,library:metadata})).toHaveProperty("library",metadata);
 expect(()=>contracts.parseSkillInstance({...instance,library:{...metadata,sourcePath:"C:/private"}})).toThrow();
});
it("rejects tags that cannot be stored exactly or exceed the bounded basic list",()=>{
 const parse=contracts.parseSkillLibraryMetadata;
 expect(parse(metadata)).toEqual(metadata);
 for(const tags of [["课程","课程"],[" 课程"],["a\nb"],["a\u0085b"],["\uFEFFnotes"],Array.from({length:17},(_,i)=>String(i)),["a".repeat(49)]])expect(()=>parse({...metadata,tags})).toThrow();
 expect(()=>parse({...metadata,sourceToolId:"codex_cli"})).toThrow();
 expect(()=>parse({...metadata,sourceKind:"tool"})).toThrow();
});
it("keeps folder/archive pickers and ZIP export free of raw path inputs",()=>{
 const parseImport=contracts.parseSkillLocalImportRequest,parseExport=contracts.parseSkillExportRequest;
 expect(parseImport({operationId:id,kind:"archive"})).toEqual({operationId:id,kind:"archive"});
 expect(()=>parseImport({operationId:id,kind:"folder",path:"C:/private"})).toThrow();
 expect(parseExport({operationId:id,scanRevision:"scan_1",instanceIds:["instance_local"]})).toHaveProperty("instanceIds",["instance_local"]);
 expect(()=>parseExport({operationId:id,scanRevision:"scan_1",instanceIds:["instance_local","instance_local"]})).toThrow();
 expect(contracts.parseSkillLocalImportResult({selected:true,results:[{name:"notes",status:"imported",reasonCode:null,instanceId:"instance_local"},{name:"other",status:"failed",reasonCode:"SKILL_OPERATION_FAILED",instanceId:null}]})).toHaveProperty("results",expect.arrayContaining([expect.objectContaining({status:"failed"})]));
});
it("preserves blocked partial preflight targets and binds AI approval to the exact request",()=>{
 expect(contracts.parseSkillCopyPreflight(preview)).toEqual(preview);
 const plan={id:"plan_1",sourceName:"notes",request,preview,state:"pending",expiresAt:1791568800000};
 expect(contracts.parseSkillAiSessionView({enabled:true,sessionId:id,plans:[plan]})).toHaveProperty("plans",[plan]);
 expect(()=>contracts.parseSkillAiSessionView({enabled:true,sessionId:id,plans:[{...plan,preview:{...preview,source:{...preview.source,instanceId:"other"}}}]})).toThrow();
 expect(()=>contracts.parseSkillAiSessionView({enabled:true,sessionId:id,plans:[{...plan,request:{...request,command:"copy"}}]})).toThrow();
 expect(()=>contracts.parseSkillAiSessionView({enabled:false,sessionId:id,plans:[plan]})).toThrow();
});
it("accepts only path-free watch notices",()=>{
 expect(contracts.parseSkillWatchNotice({generation:"watch_123",reason:"changed"})).toEqual({generation:"watch_123",reason:"changed"});
 expect(()=>contracts.parseSkillWatchNotice({generation:"watch_123",reason:"changed",path:"C:/private"})).toThrow();
});
