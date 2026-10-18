/** Conditional, account/project-owned presets; no model execution from Settings. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import type {FastifyInstance} from 'fastify'
import {parseNativeCompositionPresets} from '../../../web/src/lib/native-composition-presets.ts'
import {currentProjectId} from '../scope.ts';import {resolvePaths} from '../projects.ts';import {assertResearchPath} from '../runtime/project-storage.ts';import {atomicJson} from '../atomic-json.ts'
export function readNativeCompositionPresets(projectId:string){
 const file=path.join(resolvePaths(projectId).kadyDir,'native-composition-presets.json');assertResearchPath(file)
 let state:ReturnType<typeof parseNativeCompositionPresets>={schemaVersion:1,presets:[]}
 try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>524288)throw Error('RESEARCH_COMPOSITION_PRESETS_INVALID');state=parseNativeCompositionPresets(JSON.parse(fs.readFileSync(file,'utf8')))}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 return {file,state,etag:'"'+createHash('sha256').update(JSON.stringify(state)).digest('hex')+'"'}
}
export async function registerNativeCompositionRoutes(app:FastifyInstance,models:{refresh(projectId:string):Promise<unknown>;require(projectId:string,ref:string):Promise<unknown>},current:()=>boolean){
 const assert=()=>{if(!current())throw Error('RESEARCH_CONTEXT_REVOKED')}
 app.get('/research/compositions',async(_req,reply)=>{assert();const value=readNativeCompositionPresets(currentProjectId());reply.header('Cache-Control','no-store').header('ETag',value.etag);return {state:value.state}})
 app.put('/research/compositions',async(req,reply)=>{
  assert();let state:ReturnType<typeof parseNativeCompositionPresets>;try{state=parseNativeCompositionPresets(req.body)}catch{return reply.code(400).send({detail:'RESEARCH_COMPOSITION_PRESETS_INVALID'})}
  const projectId=currentProjectId(),previous=readNativeCompositionPresets(projectId);if(req.headers['if-match']!==previous.etag)return reply.code(412).send({detail:'RESEARCH_COMPOSITION_PRESETS_CHANGED'})
  const changed=state.presets.filter(preset=>{const old=previous.state.presets.find(row=>row.id===preset.id);return !old||JSON.stringify([old.models,old.judge])!==JSON.stringify([preset.models,preset.judge])})
  try{if(changed.length){await models.refresh(projectId);for(const ref of new Set(changed.flatMap(preset=>[...preset.models,preset.judge])))await models.require(projectId,ref)}}catch{return reply.code(409).send({detail:'RESEARCH_MODEL_UNAVAILABLE'})}
  assert();const latest=readNativeCompositionPresets(projectId);if(latest.etag!==previous.etag)return reply.code(412).send({detail:'RESEARCH_COMPOSITION_PRESETS_CHANGED'})
  assertResearchPath(previous.file);fs.mkdirSync(path.dirname(previous.file),{recursive:true});atomicJson(previous.file,state);const next=readNativeCompositionPresets(projectId);reply.header('Cache-Control','no-store').header('ETag',next.etag);return {state:next.state}
 })
}
