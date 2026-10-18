import {expect,it} from 'vitest'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname,resolve,basename} from 'node:path'
import {parseGrowthSaveUrl,downloadGrowthPng,persistGrowthPng} from '../src/studybuddy/growth-image.ts'
const version='55555555-5555-4555-8555-555555555555'
function png(){const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(1080,16);bytes.writeUInt32BE(1440,20);return bytes}
it('accepts only the original save-growth URI and downloads a bounded, fixed-size PNG',async()=>{
  expect(parseGrowthSaveUrl('studybuddy://personal-profile/save-growth?version='+version)).toBe(version)
  for(const uri of ['https://personal-profile/save-growth?version='+version,'studybuddy://personal-profile/save-growth?version='+version+'&path=C:/other','studybuddy://personal-profile/save-growth?version=bad'])expect(parseGrowthSaveUrl(uri)).toBeNull()
  let call:{url:string;init:RequestInit|undefined}|undefined
  const result=await downloadGrowthPng(version,'synthetic-access',async(url,init)=>{call={url,init};return new Response(png(),{headers:{'content-type':'image/png'}})})
  expect(call?.url).toBe('https://guijitongzhuo.com/api/v1/my-ai/activity/growth-image');expect(JSON.parse(String(call?.init?.body))).toEqual({snapshotVersion:version});expect(result).toEqual(png())
  await expect(downloadGrowthPng(version,'synthetic-access',async()=>new Response(png(),{headers:{'content-type':'text/html'}}))).rejects.toThrow('PROFILE_GROWTH_INVALID')
})
it('preserves existing files and never commits an export after the owner has changed',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'studybuddy-growth-')),target=join(directory,'growth.png')
  try{
    await writeFile(target,'old');await expect(persistGrowthPng(target,png(),()=>true)).rejects.toThrow();expect(await readFile(target,'utf8')).toBe('old')
    const fresh=join(directory,'fresh.png');await expect(persistGrowthPng(fresh,png(),()=>false)).rejects.toThrow('ACCOUNT_SCOPE_CHANGED');await expect(readFile(fresh)).rejects.toThrow()
    await persistGrowthPng(fresh,png(),()=>true);expect(await readFile(fresh)).toEqual(png())
  }finally{if(dirname(resolve(directory))!==resolve(tmpdir())||!basename(directory).startsWith('studybuddy-growth-'))throw new Error('TEST_PATH_INVALID');await rm(directory,{recursive:true,force:true})}
})
