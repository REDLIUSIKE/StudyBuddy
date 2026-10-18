import {Context} from '@deepseek-ai/cordis'
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {StudyBuddySearchHostControl,searchOperationUUID} from '../src/studybuddy-search.ts'
import {desktopSearchProfilePatch} from '../src/search-profile.ts'
import {parseToolSearchRequestV1} from '@studybuddy/contracts'
const hostGeneration='33333333-3333-4333-8333-333333333333'
const context={scope:{accountId:'11111111-1111-4111-8111-111111111111',generation:1},hostGeneration}
it('holds stable identities for original call/query slots across a Host restart',()=>{
 const first=searchOperationUUID(context.scope.accountId,'session','call',0)
 expect(searchOperationUUID(context.scope.accountId,'session','call',0)).toBe(first)
 expect(searchOperationUUID(context.scope.accountId,'session','call',1)).not.toBe(first)
 expect(searchOperationUUID(context.scope.accountId,'session','next-call',0)).not.toBe(first)
 expect(searchOperationUUID('22222222-2222-4222-8222-222222222222','session','call',0)).not.toBe(first)
 expect(parseToolSearchRequestV1({operationId:first,textQuery:'q',maxResults:5}).operationId).toBe(first)
})
it('revokes visible late results on account change without sending a Key or refund',async()=>{
 const ctx=new Context(),sent:object[]=[]
 const control=new StudyBuddySearchHostControl(ctx,hostGeneration,async(message)=>{sent.push(message)})
 control.setScope(context)
 const pending=control.execute(parseToolSearchRequestV1({operationId:searchOperationUUID(context.scope.accountId,'s','c',0),textQuery:'q',maxResults:5}))
 const rejected=expect(pending).rejects.toMatchObject({code:'STUDYBUDDY_SEARCH_SCOPE_REVOKED'})
 control.setScope(null);await rejected
 expect(JSON.stringify(sent)).not.toMatch(/apiKey|Authorization|Bearer|refund/)
 await ctx.fiber.dispose()
})
it('resolves source and shipped overlay paths; generic base remains separately configured',()=>{
 const sourceURL=new URL('../src/index.ts',import.meta.url).href
 const patch=desktopSearchProfilePatch(sourceURL)
 expect(readFileSync(patch,'utf8')).toContain('searchProvider: studybuddy-gateway')
 expect(desktopSearchProfilePatch(new URL('../lib/index.js',import.meta.url).href)).toMatch(/[\\/]lib[\\/]studybuddy-search.patch.yml$/)
 expect(readFileSync(new URL('../../../packages/bundle/base/cordis.patch.yml',import.meta.url),'utf8')).toContain('searchProvider: deepseek-official')
})
