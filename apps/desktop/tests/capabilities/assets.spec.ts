import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, mkdir, rename, symlink, rm,realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve,relative } from 'node:path'
import { expect, it, vi } from 'vitest'
import { CapabilityAssetTransfer, readCapabilityFile, createCapabilityFileArtifact } from '../../src/studybuddy/capabilities/assets.ts'
import { caller, target } from './fixture.ts'
const bytes = Buffer.from([137,80,78,71,13,10,26,10,1]), sha256 = createHash('sha256').update(bytes).digest('hex')
const artifact = { artifactRef: 'asset-a', moduleId: 'aigc', schemaRef: 'media-v1', originSessionId: caller.callerSessionId, mime: 'image/png', bytes: bytes.length, sha256 }
it('accepts a canonical exported file beneath its original Windows application-data alias',async()=>{
 const base=process.platform==='win32'&&process.env.APPDATA?process.env.APPDATA:tmpdir(),root=await mkdtemp(join(base,'sb-cap-alias-'))
 try{
  const file=join(root,'汽车.png');await writeFile(file,bytes)
  const canonical=await realpath(file)
  expect(await createCapabilityFileArtifact(caller,target,canonical,'image/png',[root])).toMatchObject({sha256,originSessionId:caller.callerSessionId})
 }finally{expect(relative(resolve(base),resolve(root))).toMatch(/^sb-cap-alias-/);await rm(root,{recursive:true,force:true})}
})
it('crossSessionNeedsSourceGrant', async () => {
  const read = vi.fn(async () => bytes), put = vi.fn(async (_c, _t, source) => ({ ...source, moduleId: 'video', artifactRef: 'import-a' }))
  const transfer = new CapabilityAssetTransfer({ assert: () => {}, put })
  transfer.register(caller, artifact, read)
  await expect(transfer.import({ ...caller, callerSessionId: 'foreign' }, artifact.artifactRef, target)).rejects.toThrow('CAPABILITY_SOURCE_NOT_AUTHORIZED')
  expect(read).not.toHaveBeenCalled()
  expect(await transfer.import(caller, artifact.artifactRef, target)).toMatchObject({ moduleId: 'video', sha256 })
  await transfer.import(caller, artifact.artifactRef, target)
  expect(put).toHaveBeenCalledTimes(1)
})
it('accepts valid captions and empty ZIP archives while rejecting malformed format envelopes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capability-formats-'))
 try{for(const [mime,content]of [['text/vtt',Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\n字幕\n')],['application/zip',Buffer.from('504b0506000000000000000000000000000000000000','hex')]] as const){const file=join(root,mime==='text/vtt'?'字幕.vtt':'project.zip');await writeFile(file,content);expect(await createCapabilityFileArtifact(caller,target,file,mime,[root])).toMatchObject({mime,bytes:content.length});await writeFile(file,mime==='text/vtt'?'not WEBVTT':'PK bad zip');await expect(createCapabilityFileArtifact(caller,target,file,mime,[root])).rejects.toThrow('CAPABILITY_CONTENT_INVALID')}}finally{await rm(root,{recursive:true,force:true})}
})
it('unicodeCollisionPreservesBothFiles', async () => {
  const names: string[] = [], contents: Buffer[] = []
  const transfer = new CapabilityAssetTransfer({ assert: () => {}, put: async (_c, _t, source, content) => {
    // The domain import coordinator owns collision naming; Main supplies both distinct sources.
    names.push(source.artifactRef); contents.push(content); return { ...source, moduleId: 'video' }
  } })
  transfer.register(caller, artifact, async () => bytes)
  transfer.register(caller, { ...artifact, artifactRef: 'asset-b' }, async () => bytes)
  await transfer.import(caller, 'asset-a', target); await transfer.import(caller, 'asset-b', target)
  expect(names).toEqual(['asset-a', 'asset-b']); expect(contents).toEqual([bytes, bytes])
})
it('rejectsJunctionSwap', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sb-capability-')), folder = join(directory, '素材'), outside = join(directory, '外部')
  try {
    await mkdir(folder); await mkdir(outside); await writeFile(join(folder, '汽车 图.png'), bytes); await writeFile(join(outside, '汽车 图.png'), bytes)
    const file = join(folder, '汽车 图.png'); expect(await readCapabilityFile(file, artifact)).toEqual(bytes)
    await rename(folder, join(directory, 'original')); await symlink(outside, folder, 'junction')
    await expect(readCapabilityFile(file, artifact)).rejects.toThrow('VIDEO_PATH_DENIED')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
it('fileCardRequiresVerifiedFile in an admitted resource root',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sb-cap-file-')),project=join(directory,'project'),outside=join(directory,'foreign.png');await mkdir(project)
 try{
  const path=join(project,'汽车.png');await writeFile(path,bytes);await writeFile(outside,bytes)
  const result=await createCapabilityFileArtifact(caller,target,path,'image/png',[project]);expect(result).toMatchObject({originSessionId:caller.callerSessionId,sha256})
  await expect(createCapabilityFileArtifact(caller,target,outside,'image/png',[project])).rejects.toThrow('CAPABILITY_FILE_NOT_ADMITTED')
  await writeFile(path,'changed');await expect(readCapabilityFile(path,result)).rejects.toThrow('CAPABILITY_CONTENT_INVALID')
 }finally{await rm(directory,{recursive:true,force:true})}
})
