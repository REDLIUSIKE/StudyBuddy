/** Resume the reviewed tool-configuration repair after the core-version gate. */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { desktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment, validateDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createPackagingRun, recordPackagingEvent } from './packaging-run.mjs'
import { withWindowsSigningStage } from './windows-signing-stage.mjs'
import { inspectWindowsRuntimeSignature } from './windows-runtime-signature.mjs'
import { STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT } from './studybuddy-evsign.mjs'
import { resolveDesktopAutoUpdateConfig, desktopBuildRecordFilename } from './desktop-auto-update-environment.mjs'
import { verifyStudyBuddyPackageResources, verifyPackagedStudyBuddyPreloads } from './studybuddy-package-resources.mjs'
import { verifyWindowsAsarUnpack } from './windows-asar-unpack.mjs'
import { windowsRuntimeCode } from './windows-runtime-signature.mjs'

const buildId='e26f6b65b6a648e28f7d85d1ac88327a',version='1.0.1'
const appRoot=resolve(import.meta.dirname,'..'),repositoryRoot=resolve(appRoot,'../..')
const paths=desktopTargetBuildPaths('win-x64')
const previous=join(appRoot,'.desktop-build/packaging-runs/2026-10-14T13-23-04.396Z-vFLg9h')
const prepared=join(appRoot,'.desktop-build/packaging-runs/2026-10-14T13-42-05.704Z-gkzMoJ')
const packaged=join(appRoot,'.desktop-build/packaging-runs/2026-10-14T13-52-38.422Z-rYcghV')
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex')
export function requireCheckpoint(run,result) {
  if(run.target!=='win-x64'||run.version!==version||run.unsigned!==false||result.success!==false)throw Error('REPAIR_CHECKPOINT_MISMATCH')
  for(const stage of ['run build:official','exec tsx scripts/pack-private-runtime.ts','run prepare:runtime --defer-primary-runtime-smoke','run sign:primary-runtime','run prepare:packages']){
    if(!result.stages.some(row=>row.stage===stage&&row.code===0))throw Error('REPAIR_PREVIOUS_STAGE_UNVERIFIED')
  }
  if(!result.stages.some(row=>row.stage==='run prepare:dsh --defer-runtime-smoke'&&row.code===1))throw Error('REPAIR_FAILED_STAGE_MISMATCH')
}
export function requirePreparedCheckpoint(run,result) {
  if(run.target!=='win-x64'||run.version!==version||run.buildId!==buildId||result.success!==false)throw Error('REPAIR_PREPARED_IDENTITY_MISMATCH')
  for(const stage of ['repair:core-package-set','repair:dsh-runtime']){
    if(!result.stages.some(row=>row.stage===stage&&row.code===0))throw Error('REPAIR_PREPARED_STAGE_UNVERIFIED')
  }
  if(!result.stages.some(row=>row.stage==='repair:runtime-signatures'&&row.code===1))throw Error('REPAIR_PREPARED_FAILURE_MISMATCH')
}
export async function executeSigningPhases(execute,artifactLock) {
  // The runtime-signing child takes its own account-wide lock.
  await execute('repair:runtime-signatures',['run','sign:primary-runtime','--dsh'])
  await artifactLock(()=>execute('repair:windows-artifacts',['exec','electron-builder','--config','electron-builder.config.mjs','--win','--x64','--publish','never']))
}
export function requirePackagedCheckpoint(run,result) {
  if(run.target!=='win-x64'||run.version!==version||run.buildId!==buildId||result.success!==false)throw Error('REPAIR_PACKAGED_IDENTITY_MISMATCH')
  if(!result.stages.some(row=>row.stage==='repair:runtime-signatures'&&row.code===0)||!result.stages.some(row=>row.stage==='repair:windows-artifacts'&&row.code===1))throw Error('REPAIR_PACKAGED_STAGE_UNVERIFIED')
}
export async function resume() {
  if(process.platform!=='win32'||process.arch!=='x64'||process.env.STUDYBUDDY_RELEASE_BUILD_ID!==buildId)throw Error('REPAIR_IDENTITY_MISMATCH')
  const original=JSON.parse(await readFile(join(previous,'run.json'),'utf8'))
  requireCheckpoint(original,JSON.parse(await readFile(join(previous,'result.json'),'utf8')))
  requirePreparedCheckpoint(JSON.parse(await readFile(join(prepared,'run.json'),'utf8')),JSON.parse(await readFile(join(prepared,'result.json'),'utf8')))
  requirePackagedCheckpoint(JSON.parse(await readFile(join(packaged,'run.json'),'utf8')),JSON.parse(await readFile(join(packaged,'result.json'),'utf8')))
  for(const [name,expected]of Object.entries({'deepseek-ai-dsh-1.0.1.tgz':'2dae0e180bf3a9cba3ece854e2cbc5da5fde27eb7b3ad40532d9ae49ff380744','deepseek-ai-dsh-desktop-host-1.0.1.tgz':'4e24e7b42e9e9ee34d6a7013e1de09e3d6ac646731f05bad1301a56d1476ecd7'})){
    if(await hash(join(paths.packedDsh,name))!==expected)throw Error('REPAIR_CORE_BYTES_CHANGED')
  }
  if(await hash(join(repositoryRoot,'.dsh-build/studybuddy-business/manifest.json'))!=='09714644bb795d5fc1e876505b54921db9edcb6bfea3cafc1bf615b068559015')throw Error('REPAIR_NATIVE_BYTES_CHANGED')
  if(await hash(join(paths.dsh,'desktop-runtime.json'))!=='9229023a9585fb9a34fa2e245c39209f4d5ec324a54b1aaa139d97134f341039')throw Error('REPAIR_PREPARED_RUNTIME_CHANGED')
  const env={...loadDesktopPackageEnvironment('win32'),DSH_DESKTOP_TARGET_PLATFORM:'win32',DSH_DESKTOP_TARGET_ARCH:'x64',DSH_DESKTOP_UNSIGNED:'0',DSH_DESKTOP_BUILD_VERSION:version,ELECTRON_BUILDER_7Z_FILTER:'BCJ',ELECTRON_BUILDER_COMPRESSION_LEVEL:'1'}
  validateDesktopPackageEnvironment(env,{platform:'win32',arch:'x64'})
  const run=createPackagingRun(join(appRoot,'.desktop-build/packaging-runs'),{target:'win-x64',version,buildId,resume:true,originalRun:previous},{secrets:[env.STUDYBUDDY_EVSIGN_LICENSE]})
  env.DSH_DESKTOP_PACKAGING_RUN_DIR=run.directory
  console.log(`DESKTOP_PACKAGING_RECORD ${run.directory}`)
  let success=false
  try {
    const pnpm=process.env.npm_execpath;if(!pnpm)throw Error('REPAIR_PNPM_ENTRY_MISSING')
    const execute=(name,args)=>run.run(name,process.execPath,[pnpm,...args],{cwd:appRoot,env})
    recordPackagingEvent(run.directory,{type:'verified-stage-reuse',stage:'build-and-unmodified-packed-dependencies',originalRun:previous})
    recordPackagingEvent(run.directory,{type:'verified-stage-reuse',stage:'prepared-dsh-runtime',originalRun:prepared,descriptorSha256:'9229023a9585fb9a34fa2e245c39209f4d5ec324a54b1aaa139d97134f341039'})
    const application=join(paths.artifacts,'win-unpacked'),resources=join(application,'resources'),main=join(application,'StudyBuddy.exe')
    const mainSha256=await hash(main),signature=await inspectWindowsRuntimeSignature(main)
    if(mainSha256!=='f21a1309cad1e7eaf1002ce0cd743d3f0c5e77a89709e96b55ce03445cb5c2f7'||signature.status!=='Valid'||!signature.timestamped||signature.thumbprint!==STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT)throw Error('REPAIR_SIGNED_APPLICATION_CHANGED')
    await verifyStudyBuddyPackageResources(resources)
    await verifyPackagedStudyBuddyPreloads(appRoot,resources)
    const peFiles=(await windowsRuntimeCode(paths.dsh)).map(path=>path.slice(paths.dsh.length+1))
    await verifyWindowsAsarUnpack(paths.dsh,resources,peFiles)
    recordPackagingEvent(run.directory,{type:'verified-stage-reuse',stage:'signed-prepackaged-application',originalRun:packaged,mainSha256})
    await withWindowsSigningStage({stage:'artifacts-resume',record:event=>recordPackagingEvent(run.directory,event)},()=>execute('repair:windows-installer',['exec','electron-builder','--config','electron-builder.config.mjs','--win','nsis','--x64','--publish','never','--prepackaged',application]))
    if(await hash(main)!==mainSha256)throw Error('REPAIR_SIGNED_APPLICATION_CHANGED')
    await execute('repair:packaged-smoke',['exec','tsx','scripts/smoke-packaged-runtime.ts'])
    for(const name of [join('win-unpacked','StudyBuddy.exe'),`StudyBuddy-Windows-x64-${version}.exe`]){
      const signature=await inspectWindowsRuntimeSignature(join(paths.artifacts,name))
      if(signature.status!=='Valid'||!signature.timestamped||signature.thumbprint!==STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT)throw Error('REPAIR_PRODUCT_SIGNATURE_UNVERIFIED')
    }
    const update=resolveDesktopAutoUpdateConfig(env,'win32','x64')
    await writeFile(join(paths.artifacts,desktopBuildRecordFilename('win-x64')),JSON.stringify({schemaVersion:1,target:'win-x64',version,environment:update.environment,publicUrl:update.publicUrl,commit:original.commit,dirty:original.dirty},null,2)+'\n')
    success=true
  }catch(error){console.error(String(error).replaceAll(env.STUDYBUDDY_EVSIGN_LICENSE,'[REDACTED]'));process.exitCode=1}
  finally{run.finish(success)}
}
