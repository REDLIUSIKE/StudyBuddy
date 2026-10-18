import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {DiskMediaKeyJournal} from '../src/studybuddy/media-key-journal.ts'
import type {MediaKeyRecord} from '../src/studybuddy/media-key-journal.ts'
const roots:string[]=[]
const renameFault=vi.hoisted(()=>({remaining:0,attempts:0,code:'EPERM',observe:undefined as (()=>Promise<void>)|undefined}))
vi.mock('node:fs/promises',async(importOriginal)=>{
 const original=await importOriginal<typeof import('node:fs/promises')>()
 return {...original,rename:async(...args:Parameters<typeof original.rename>)=>{
  renameFault.attempts++
  if(renameFault.remaining-->0){await renameFault.observe?.();throw Object.assign(Error('sharing violation'),{code:renameFault.code})}
  return original.rename(...args)
 }}
})
const row:MediaKeyRecord={schemaVersion:1,requestId:'44444444-4444-4444-8444-444444444444',
 kind:'image',modelId:'doubao-seedream-5-0-flash-260915',inputHash:'a'.repeat(64),taskId:null,state:'unknown'}
async function directory(){const root=await mkdtemp(join(tmpdir(),'studybuddy-key-metadata-'));roots.push(root);return root}
afterEach(async()=>{renameFault.remaining=0;renameFault.attempts=0;renameFault.observe=undefined;for(const root of roots.splice(0)){
 if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!root.includes('studybuddy-key-metadata-'))throw Error('TEST_CLEANUP_BOUNDARY')
 await rm(root,{recursive:true,force:true})
}})
it('claims once across journal instances and persists only outcome metadata through restart',async()=>{
 const root=await directory(),first=new DiskMediaKeyJournal(root),second=new DiskMediaKeyJournal(root)
 const claims=await Promise.all([first.claim('owner',row),second.claim('owner',row)])
 expect(claims.filter(c=>c.created)).toHaveLength(1)
 await first.save('owner',{...row,state:'completed',taskId:'task_fixture'})
 await second.save('owner',{...row,state:'unknown'})
 expect(await new DiskMediaKeyJournal(root).get('owner',row.requestId)).toMatchObject({state:'completed',taskId:'task_fixture'})
 const owners=await readdir(root),files=await readdir(join(root,owners[0]!))
 expect(files).toEqual([row.requestId+'.json'])
 const value=JSON.parse(await readFile(join(root,owners[0]!,files[0]!),'utf8'))
 expect(Object.keys(value).sort()).toEqual(['inputHash','kind','modelId','requestId','schemaVersion','state','taskId'])
})
it('retries transient Windows sharing violations without removing the existing record',async()=>{
 const root=await directory(),journal=new DiskMediaKeyJournal(root);await journal.claim('owner',row)
 renameFault.remaining=2;renameFault.observe=async()=>{expect(await journal.get('owner',row.requestId)).toEqual(row)}
 await journal.save('owner',{...row,state:'completed',taskId:'task_fixture'})
 expect(renameFault.attempts).toBeGreaterThanOrEqual(3);expect(renameFault.attempts).toBeLessThanOrEqual(9)
 expect(await journal.get('owner',row.requestId)).toMatchObject({state:'completed',taskId:'task_fixture'})
 const [owner]=await readdir(root);expect(await readdir(join(root,owner!))).toEqual([row.requestId+'.json'])
})
it('reports persistent sharing failure, preserves the old record and removes only its pending file',async()=>{
 const root=await directory(),journal=new DiskMediaKeyJournal(root);await journal.claim('owner',row)
 renameFault.remaining=100
 await expect(journal.save('owner',{...row,state:'completed'})).rejects.toMatchObject({code:'EPERM'})
 expect(renameFault.attempts).toBeGreaterThan(1);expect(renameFault.attempts).toBeLessThanOrEqual(9)
 expect(await journal.get('owner',row.requestId)).toEqual(row)
 const [owner]=await readdir(root);expect(await readdir(join(root,owner!))).toEqual([row.requestId+'.json'])
})
it.runIf(process.platform==='win32')('completes atomic replacement after a real Windows reader denies deletion for 750ms',async()=>{
 const root=await directory(),journal=new DiskMediaKeyJournal(root);await journal.claim('owner',row)
 const path=join(root,createHash('sha256').update('owner').digest('hex'),row.requestId+'.json')
 const code="$heldRecord=[IO.File]::Open($env:STUDYBUDDY_TEST_JOURNAL_FILE,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite);try{[Console]::WriteLine('LOCKED');[Console]::In.ReadLine()|Out-Null}finally{$heldRecord.Dispose()}"
 const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-Command',code],{windowsHide:true,env:{...process.env,STUDYBUDDY_TEST_JOURNAL_FILE:path},stdio:['pipe','pipe','pipe']})
 const releaseReader=()=>{if(!child.stdin.writableEnded&&!child.stdin.destroyed)child.stdin.end('release\n')}
 try{
  await new Promise<void>((resolve,reject)=>{let output='';child.stdout.on('data',data=>{output+=data;if(output.includes('LOCKED'))resolve()});child.once('error',reject);child.once('exit',()=>reject(Error('WINDOWS_READER_EXITED_EARLY')))})
  const release=setTimeout(releaseReader,750)
  try{await journal.save('owner',{...row,state:'completed'})}finally{clearTimeout(release);releaseReader()}
  expect(await journal.get('owner',row.requestId)).toMatchObject({state:'completed'})
 }finally{releaseReader();if(child.exitCode===null)await new Promise<void>(resolve=>child.once('exit',()=>resolve()))}
},10000)
it('rejects media payloads and credential fields before any journal file is written',async()=>{
 const root=await directory(),journal=new DiskMediaKeyJournal(root)
 for(const extra of [{base64:'image-fixture'},{content:{base64:'image-fixture'}},{apiKey:'fixture-key'}])
  await expect(journal.claim('owner',{...row,...extra})).rejects.toThrow('AIGC_JOURNAL_INVALID')
 expect(await readdir(root)).toEqual([])
})
