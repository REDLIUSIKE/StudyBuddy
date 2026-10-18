import {expect,it} from 'vitest'
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {DiskMediaAudioStore} from '../src/studybuddy/media-audio-store.ts'
import type {MediaKeyRecord} from '../src/studybuddy/media-key-journal.ts'
const row:MediaKeyRecord={schemaVersion:1,requestId:'00000000-0000-4000-8000-000000000041',kind:'audio',modelId:'tts-fixture',inputHash:'a'.repeat(64),taskId:null,state:'completed'}
const wave=()=>{const bytes=Buffer.alloc(46);bytes.write('RIFF');bytes.write('WAVE',8);bytes[44]=1;bytes[45]=2;return bytes}
it('restores only the original owner, exact request, model, input and unmodified audio',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-audio-cache-')),owner='owner'
 try{
  const store=new DiskMediaAudioStore(root),content={bytes:wave(),mime:'audio/wav'};await store.save(owner,row,content)
  expect(await new DiskMediaAudioStore(root).get(owner,row)).toEqual(content);expect(await store.get('another owner',row)).toBeNull()
  await expect(store.get(owner,{...row,inputHash:'b'.repeat(64)})).rejects.toThrow('AIGC_AUDIO_STORE_INVALID');await expect(store.get(owner,{...row,modelId:'different-fixture'})).rejects.toThrow('AIGC_AUDIO_STORE_INVALID')
  const file=join(root,createHash('sha256').update(owner).digest('hex'),row.requestId+'.audio'),bytes=await readFile(file);bytes.writeUInt8(bytes.readUInt8(bytes.length-1)^1,bytes.length-1);await writeFile(file,bytes)
  await expect(store.get(owner,row)).rejects.toThrow('AIGC_AUDIO_STORE_INVALID')
 }finally{await rm(root,{recursive:true,force:true})}
})
it('adds exact display timing once without changing the audio or dropping it on a later audio-only observation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-audio-timing-'))
 try{
  const store=new DiskMediaAudioStore(root),content={bytes:wave(),mime:'audio/wav'},timing={durationMs:2000,words:[{token:'你好',startMs:100.25,endMs:1700}]}
  await store.save('owner',row,content);await store.save('owner',row,{...content,timing});await new DiskMediaAudioStore(root).save('owner',row,content)
  expect(await store.get('owner',row)).toEqual({...content,timing})
  const changed=wave();changed[45]=9;await expect(store.save('owner',row,{...content,bytes:changed})).rejects.toThrow('AIGC_AUDIO_STORE_INVALID')
  await expect(store.save('owner',row,{...content,timing:{...timing,words:[{token:'你好',startMs:400,endMs:1700}]}})).rejects.toThrow('AIGC_AUDIO_STORE_INVALID')
 }finally{await rm(root,{recursive:true,force:true})}
})
it('rejects an account-cache junction without writing outside the configured store',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-audio-junction-')),store=join(root,'store'),outside=join(root,'outside');await Promise.all([mkdir(store),mkdir(outside)])
 try{
  await symlink(outside,join(store,createHash('sha256').update('owner').digest('hex')),process.platform==='win32'?'junction':'dir')
  await expect(new DiskMediaAudioStore(store).save('owner',row,{bytes:wave(),mime:'audio/wav'})).rejects.toThrow('AIGC_AUDIO_STORE_INVALID')
  await expect(readFile(join(outside,row.requestId+'.audio'))).rejects.toThrow()
 }finally{await rm(root,{recursive:true,force:true})}
})
