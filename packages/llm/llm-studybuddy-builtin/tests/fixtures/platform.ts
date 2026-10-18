import {NATIVE_TOOLS} from '@studybuddy/contracts'
/** Synthetic leased platform authority, independent of private Key catalogs. */
export function fixture(){
 const row={logicalModelId:'dsh.deepseek.deepseek-flash.chat',providerId:'deepseek',exactModelId:'deepseek-flash',displayName:'DeepSeek Flash',toolId:'dsh',protocol:'openai_chat_completions',contextWindow:1048576,maxOutputTokens:393216,capabilityFlags:['thinking','tool_use'],evidenceSha256:'a'.repeat(64),membershipRevision:'harness-platform-fixture-r1',availability:'available'}
 return {scope:{accountId:'11111111-1111-4111-8111-111111111111',generation:3},hostGeneration:'22222222-2222-4222-8222-222222222222',catalog:{schemaVersion:2,catalogRevision:'harness-platform-fixture-r1',tools:NATIVE_TOOLS,models:[row]},checkedAt:'2026-10-11T00:00:00.000Z',expiresAt:'2099-10-12T00:00:00.000Z'}
}
