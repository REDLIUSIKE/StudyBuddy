import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {SKILL_DIAGNOSTIC_CODES} from "./skill-diagnostic-codes.js";
import {parseSkillWebDiagnostic,projectSkillDiagnosticFields} from "./skill-diagnostics.js";
const record={operationId:"123e4567-e89b-42d3-a456-426614174000",action:"publish",phase:"web_request",outcome:"failed",errorCode:"SKILL_ENTRY_CHANGED",requestId:null,durationMs:1};
it("keeps startup HTTP evidence while rejecting credentials and invalid status values",()=>{
 const startup={...record,action:"startup",phase:"session_exchange",errorCode:"AUTH_IDENTITY_CONFLICT",httpStatus:401};
 expect(parseSkillWebDiagnostic(startup)).toEqual(startup);
 expect(projectSkillDiagnosticFields("skill_center",{action:"startup",phase:"session_exchange",status_code:401,cookie:"PRIVATE_COOKIE"})).toEqual({action:"startup",phase:"session_exchange",httpStatus:401});
 for(const bad of [99,600,401.5,"401"])expect(()=>parseSkillWebDiagnostic({...startup,httpStatus:bad})).toThrow();
 expect(()=>parseSkillWebDiagnostic({...startup,cookie:"PRIVATE_COOKIE"})).toThrow();
});
it("uses identical closed error authorities in the native and web log producers",()=>{expect(JSON.parse(readFileSync(new URL("./skill-diagnostic-codes.json",import.meta.url),"utf8"))).toEqual(SKILL_DIAGNOSTIC_CODES);expect(new Set(SKILL_DIAGNOSTIC_CODES).size).toBe(SKILL_DIAGNOSTIC_CODES.length);});
it("refuses free text, paths and unsupported operations while dropping unknown error text",()=>{
 expect(parseSkillWebDiagnostic(record)).toEqual(record);
 expect(parseSkillWebDiagnostic({...record,errorCode:"PRIVATE_BODY_SENTINEL"}).errorCode).toBe("COMMAND_FAILED");
 for(const bad of [{...record,path:"C:/private"},{...record,action:"execute"},{...record,phase:"C:/private"},{...record,requestId:"private"},{...record,durationMs:600001}])expect(()=>parseSkillWebDiagnostic(bad)).toThrow();
 expect(projectSkillDiagnosticFields("skill_center",{action:"copy",phase:"publish",tool_id:"workbuddy",destination_id:"a".repeat(64),path:"private",tool_args:"private"})).toEqual({action:"copy",phase:"publish",toolId:"workbuddy",destinationId:"a".repeat(64)});
 expect(projectSkillDiagnosticFields("other",{phase:"publish"})).toBeUndefined();
});
it("projects library and AI evidence as closed actions and hashes without names or credentials",()=>{
 expect(projectSkillDiagnosticFields("skill_center",{action:"ai_execute",phase:"source",target_status:"linked",source_id:"b".repeat(64),content_sha256:"c".repeat(64),source_name:"PRIVATE_SOURCE",credential:"PRIVATE_KEY"})).toEqual({action:"ai_execute",phase:"source",targetStatus:"linked",sourceId:"b".repeat(64),contentSha256:"c".repeat(64)});
 expect(projectSkillDiagnosticFields("skill_center",{action:"shell",source_id:"C:/private",content_sha256:"PRIVATE_KEY"})).toBeUndefined();
 expect(()=>parseSkillWebDiagnostic({...record,action:"ai_execute"})).toThrow();
});
