import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect,it} from 'vitest'
import {boot,createRuntimeResolution} from '@deepseek-ai/dsh-app-boot'
import {installRuntimeInterception} from '../../../packages/boot/app-boot/src/profile-resolution/resolver.ts'
import {parseToolSearchRequestV1,parseToolSearchResultV1} from '@studybuddy/contracts'
import type {} from '@deepseek-ai/dsh-web-search-studybuddy'
import type {} from '@deepseek-ai/dsh-web'

it('loads the desktop search provider from the actual CLI installation into an account profile and removes it on unload',async()=>{
 const home=mkdtempSync(join(tmpdir(),'studybuddy-search-composition-'))
 const profile=join(home,'profiles','desktop'),config=join(profile,'cordis.yml')
 mkdirSync(profile,{recursive:true})
 writeFileSync(config,'- id: web\n  name: "@deepseek-ai/dsh-web"\n  config:\n    searchProvider: studybuddy-gateway\n- id: web-search-studybuddy\n  name: "@deepseek-ai/dsh-web-search-studybuddy"\n')
 const resolution=await createRuntimeResolution({installAnchor:fileURLToPath(new URL('../../cli/package.json',import.meta.url)),home})
 const interception=installRuntimeInterception(resolution)
 let ctx:Awaited<ReturnType<typeof boot>>|undefined
 try{
  ctx=await boot('studybuddy-search-composition',config,[],context=>{
   // Electron Main is the only external service replaced in this composition.
   context.provide('studybuddySearch',{
    available:()=>true,
    request:value=>parseToolSearchRequestV1({operationId:'11111111-1111-4111-8111-111111111111',textQuery:value.query,maxResults:value.maxResults??8}),
    execute:async request=>parseToolSearchResultV1({operationId:request.operationId,state:'completed',sources:[{url:'https://example.test/school-list',title:'Official school list',chunks:['A source excerpt']}],truncated:false,chargeCny:'0.015',resultExpiresAt:'2030-01-01T00:00:00Z'}),
   })
  })
  const result=await ctx.web.search({query:'school list',maxResults:2})
  expect(result.sources).toEqual([{url:'https://example.test/school-list',title:'Official school list'}])
  expect(result.content).toContain('A source excerpt')
  expect(result.content).toContain('Untrusted external source excerpts')
  const entry=[...ctx.loader.entries()].find(candidate=>candidate.options.name==='@deepseek-ai/dsh-web-search-studybuddy')
  expect(entry?.fiber).toBeDefined()
  await entry!.fiber!.dispose()
  await expect(ctx.web.search({query:'school list',maxResults:2})).rejects.toMatchObject({code:'WEB_PROVIDER_CONFIGURED_MISSING'})
 }finally{
  await ctx?.fiber.dispose()
  interception.dispose()
  if(!resolve(home).startsWith(resolve(tmpdir(),'studybuddy-search-composition-')))throw Error('TEST_TEMP_DIRECTORY_OUTSIDE_OWNED_PREFIX')
  rmSync(home,{recursive:true,force:true})
 }
},30000)
