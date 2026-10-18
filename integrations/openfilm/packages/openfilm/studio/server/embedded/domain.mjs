import { createHash,randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { dirname, join, relative,resolve,isAbsolute } from 'node:path';
import { startStudio } from '../server.mjs';
import { readProjectFilm, editProjectFilm, revOf } from '../film.mjs';
import { writeAtomic } from '../atomic.mjs';
import { assertStudioPath, withStudioContext, withStudioProject, withStudioEdit, waitForStudioEdits,cancelStudioProjectWork,waitForStudioProjectWork } from './context.mjs';
import { validateVideoScope, validateVideoEdit } from './contract.mjs';
import { projectById,createProject,listProjects } from '../projects.mjs';
import { importFile,cleanName } from '../files.mjs';
import { currentStudioCaller,withStudioCaller } from './context.mjs';
import { createCapabilityExportSnapshot } from './capability-export.mjs';
import {transcribeNativeSpeech,waitForNativeSpeech} from './native-speech.mjs';
import {VideoPathAdmissions} from './path-admissions.mjs';
import {nativeSubtitleTranslator,waitForNativeTranslations} from './native-translation.mjs';
import {translateFilmSubtitles} from '../captions.mjs';
import {runGet} from './native-get.mjs';
export { validateVideoScope, validateVideoEdit, VIDEO_DOMAIN_VERSION } from './contract.mjs';

export async function createEmbeddedVideoDomain(options) {
  if (!options?.workspaceRoot || !options.stateRoot || !options.staticDirectory || !options.guestAuthorization)
    throw new Error('Embedded video roots and private authorization are required');
  const controller = new AbortController();
  const pathAdmissions=new VideoPathAdmissions(options.workspaceRoot);
  const context = { workspaceRoot:options.workspaceRoot, stateRoot:options.stateRoot,
    guestAuthorization:options.guestAuthorization, signal:controller.signal,
    capabilities:{request:(request,signal)=>options.capabilities.request({...request,...(currentStudioCaller()?{caller:currentStudioCaller()}:{})},signal)}, renderRuntime:options.renderRuntime,scopeForRoot:options.scopeForRoot,projectSignalForRoot:options.projectSignalForRoot,projectRelocated:options.projectRelocated,pathAdmissions };
  let starting, studio, closing;
  function check(scope) {
    if (controller.signal.aborted) throw new Error('Video domain is closed or revoked');
    validateVideoScope(scope);
    if (scope.accountGeneration !== options.accountGeneration || !options.isCurrentScope(scope))
      throw new Error('Video scope has been revoked');
  }
  async function rootFor(scope) {
    check(scope);
    const root = pathAdmissions.projectPath(await options.resolveProject(scope));
    if(options.projectSignalForRoot){const signal=options.projectSignalForRoot(root);if(!signal||signal.aborted)throw new Error('VIDEO_SCOPE_REVOKED');}
    check(scope);
    return root;
  }
  const run = callback => withStudioContext(context,callback);
  const domain = {
    async capabilityProjects(input){
      if(controller.signal.aborted)throw Error('VIDEO_SCOPE_REVOKED');
      if(input.action==='list')return run(async()=>({projects:(await listProjects()).filter(project=>!project.missing).map(project=>({id:project.id,name:project.name}))}));
      if(input.action!=='create'||typeof input.title!=='string'||!input.title.trim()||input.title.length>160)throw Error('VIDEO_PROJECT_INVALID');
      const project=await run(()=>createProject(input.title));return{id:project.id,path:pathAdmissions.projectPath(project.path),name:project.name};
    },
    async capability(scope,caller,operation,input,signal){
      check(scope);signal?.throwIfAborted();
      return withStudioCaller(caller,async()=>{
        if(operation==='importAsset'){
          const root=await rootFor(scope);
          if(!input||Object.keys(input).some(key=>!['name','mime','base64','relativeSource','bytes','sha256'].includes(key))||typeof input.name!=='string'||!cleanName(input.name)||typeof input.mime!=='string')throw Error('VIDEO_IMPORT_INVALID');
          let bytes;
          if(input.relativeSource!==undefined){
            if(typeof input.relativeSource!=='string'||!/^\.film\/capability-import\/[a-f0-9-]{36}\.tmp$/.test(input.relativeSource)||input.base64!==undefined)throw Error('VIDEO_IMPORT_INVALID');
            bytes=await readFile(assertStudioPath(join(root,input.relativeSource),root));if(bytes.length!==input.bytes)throw Error('VIDEO_IMPORT_INVALID');
          }else{if(typeof input.base64!=='string'||input.base64.length>140*1024*1024)throw Error('VIDEO_IMPORT_INVALID');bytes=Buffer.from(input.base64,'base64');}
          if(!bytes.length||bytes.length>100*1024*1024||createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw Error('VIDEO_IMPORT_INVALID');
          return run(()=>withStudioEdit(root,async()=>{check(scope);signal?.throwIfAborted();const result=await importFile(root,'assets/'+cleanName(input.name),Readable.from([bytes]));check(scope);return{relativePath:result.path,sha256:input.sha256,mime:input.mime,reused:result.reused};}));
        }
        if(operation==='createExport'){
          const root=await rootFor(scope);if(input?.parts?.length)throw Error('VIDEO_EXPORT_SNAPSHOT_UNSUPPORTED');
          return run(()=>withStudioEdit(root,async()=>{
            const snapshot=await createCapabilityExportSnapshot(root);
            try{await domain.start();check(scope);const {folder,...ask}=input;
              if(folder!==undefined)pathAdmissions.assertExport(root,folder);
              const job=studio.exports.start({id:scope.projectId,path:root,name:scope.projectId},ask,{...(folder?{folder}:{}),snapshot});return{jobId:job.id,producingRevision:snapshot.revision};
            }catch(error){await snapshot.remove();throw error;}
          }));
        }
        if(operation==='openProject'){if(!input||Object.keys(input).length)throw Error('VIDEO_ARGUMENTS_INVALID');await rootFor(scope);await domain.start();await studio.openProject(scope.projectId,signal??controller.signal);return{opened:true};}
        if(operation==='readProject')return domain.readProject(scope);
        if(operation==='readGuide')return domain.readGuide(scope,input.guide);
        if(operation==='readFile')return domain.readFile(scope,input.relativePath);
        if(operation==='applyEdit')return domain.applyEdit(scope,input.expectedRevision,input.edit);
        if(operation==='look')return domain.look(scope,input);
        if(operation==='mediaRequest')return domain.mediaRequest(scope,input,signal);
        if(operation==='transcribe')return domain.transcribe(scope,input.src,signal);
        if(operation==='translate')return domain.translate(scope,input.language,signal);
        if(operation==='readExports')return domain.readExports(scope,input.jobId);
        if(operation==='cancelExport'){await domain.cancelExport(scope,input.jobId);return{cancellationRequested:true};}
        throw Error('VIDEO_CAPABILITY_UNAVAILABLE');
      });
    },
    async admitPaths(admission) {
      if(controller.signal.aborted||!admission||admission.accountGeneration!==options.accountGeneration)throw new Error('VIDEO_SCOPE_REVOKED');
      const root=admission.kind==='project'?undefined:await rootFor(admission.scope);
      await pathAdmissions.admit(admission.kind,admission.paths,root);
      if(controller.signal.aborted)throw new Error('VIDEO_SCOPE_REVOKED');
      return{admitted:true};
    },
    async quiesceProject(scope) {
      // This is a private work-registry key, not filesystem admission: the folder may have moved or disappeared.
      check(scope);const root=resolve(await options.resolveProject(scope));
      cancelStudioProjectWork(context,root);
      await Promise.all([waitForNativeSpeech(context,root),waitForNativeTranslations(context,root),waitForStudioProjectWork(context,root),studio?.exports.waitForProject(scope.projectId)]);check(scope);
    },
    async projectInfo(projectId) {
      if(controller.signal.aborted)throw new Error('Video domain is closed');
      if(typeof projectId!=='string'||!projectId||projectId.length>512)throw new Error('Invalid project identity');
      const project=await run(()=>projectById(projectId));
      const path=pathAdmissions.projectPath(project.path);
      if(controller.signal.aborted)throw new Error('Video domain is closed');
      return {id:project.id,path,name:project.name};
    },
    async start() {
      if (controller.signal.aborted) throw new Error('Video domain is closed');
      starting ??= run(async () => {
        await mkdir(options.stateRoot,{recursive:true});
        const started = await startStudio({port:0,key:options.guestAuthorization,advertise:false,
          stays:true,editorDir:options.staticDirectory,prepareProjectMutation:async project=>{
            const scope=options.scopeForRoot?.(project.path);if(!scope)return;
            const result=await options.capabilities.request({scope,requestId:randomUUID(),operation:'project-release',input:{}},controller.signal);
            controller.signal.throwIfAborted();if(result?.data?.released!==true)throw new Error('VIDEO_PROJECT_RELEASE_FAILED');
          }});
        studio = started;
        if (controller.signal.aborted) { await started.close(); throw new Error('Video domain closed during startup'); }
        return { editorOrigin:started.origin,filmOrigin:started.filmOrigin };
      });
      return starting;
    },
    async readProject(scope) {
      const root = await rootFor(scope);
      const film = await run(() => readProjectFilm(root));
      check(scope);
      return { revision:film.rev,document:film.text,assets:film.value?.tracks ?? [],problems:film.problems };
    },
    async readGuide(scope,guide) {
      check(scope);
      if(!['manual','spec'].includes(guide))throw new Error('Invalid video documentation guide');
      const file=guide==='manual'?new URL('../../../STUDYBUDDY-VIDEO-GUIDE.md',import.meta.url):new URL('../../../SPEC.md',import.meta.url);
      const text=(await readFile(file,'utf8')).replaceAll('OpenFilm','StudyBuddy');check(scope);return{guide,text,revision:revOf(text)};
    },
    async readFile(scope,relativePath) {
      const root = await rootFor(scope);
      validateVideoEdit({kind:'replace-file',relativePath,text:''});
      const path = assertStudioPath(join(root,relativePath),root);
      const text = await readFile(path,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
      check(scope);
      return {text,revision:revOf(text)};
    },
    async applyEdit(scope,expectedRevision,rawEdit) {
      const edit = validateVideoEdit(rawEdit);
      const root = await rootFor(scope);
      const path = assertStudioPath(join(root,edit.kind==='film-ops'?'film.html':edit.relativePath),root);
      return run(() => withStudioEdit(root,async () => {
        check(scope);
        const before = await readFile(path,'utf8').catch(error => {
          if (error.code === 'ENOENT') return '';
          throw error;
        });
        const revision = revOf(before);
        if (revision !== expectedRevision) return {conflict:true,revision};
        check(scope);
        assertStudioPath(path,root);
        let result;
        if (edit.kind === 'film-ops') result = await editProjectFilm(root,revision,edit.ops);
        else {
          await mkdir(dirname(path),{recursive:true});
          assertStudioPath(path,root);
          await writeAtomic(path,edit.text);
          result = {rev:revOf(edit.text)};
        }
        check(scope);
        return {revision:result.rev};
      }));
    },
    async look(scope,input) {
      const root = await rootFor(scope);
      const args=input.args??[];
      if(!Array.isArray(args)||args.length>16||args.some(value=>typeof value!=='string'||!value||value.length>4096||value.includes('\0')))throw new Error('Invalid video preview arguments');
      const options=input.options??{};
      if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['count','offline'].includes(key))||options.count!==undefined&&(!Number.isInteger(options.count)||options.count<1||options.count>120)||options.offline!==undefined&&typeof options.offline!=='boolean')throw new Error('Invalid video preview options');
      const paths=args.filter(value=>!/^\d+(\.\d+)?(?:-\d+(\.\d+)?)?$/.test(value));
      if(paths.length>1)throw new Error('Only one video preview target is allowed');
      const target=assertStudioPath(resolve(root,paths[0]??'film.html'),root);
      const times=args.filter(value=>value!==paths[0]);
      const { look } = await import('../../../src/look.mjs');
      const result = await run(() => withStudioProject(root,()=>look([target,...times],{...options,root,outputRoot:root})));
      check(scope);
      const artifacts=await Promise.all(result.files.map(async file => {
        const path = assertStudioPath(file,root);
        return {relativePath:relative(root,path),sha256:createHash('sha256').update(await readFile(path)).digest('hex'),mime:'image/png'};
      }));
      check(scope);
      return{ok:result.ok,lines:result.lines,artifacts};
    },
    async mediaRequest(scope,input,signal) {
      const root=await rootFor(scope);
      if(!input||!['voice','tts','sfx','image','video'].includes(input.operation))throw Error('VIDEO_CAPABILITY_UNAVAILABLE');
      const {operation,...given}=input,result=JSON.parse(await run(()=>runGet(root,operation,given,{signal})));check(scope);return result;
    },
    async transcribe(scope,src,signal) {
      const root=await rootFor(scope);
      const result=await run(()=>transcribeNativeSpeech(root,src,signal));check(scope);return result;
    },
    async translate(scope,language,signal) {
      const root=await rootFor(scope);
      const result=await run(async()=>translateFilmSubtitles(root,language,{translate:await nativeSubtitleTranslator(root),signal:signal?AbortSignal.any([controller.signal,signal]):controller.signal}));check(scope);return result;
    },
    async createExport(scope,input) {
      const root = await rootFor(scope);
      const {folder,...ask}=input;
      if(folder!==undefined){if(typeof folder!=='string'||!isAbsolute(folder))throw new Error('VIDEO_EXPORT_PATH_NOT_ADMITTED');pathAdmissions.assertExport(root,folder);}
      await domain.start();
      check(scope);
      const job = run(() => studio.exports.start({id:scope.projectId,path:root,name:scope.projectId},ask,folder===undefined?{}:{folder}));
      return {jobId:job.id};
    },
    async cancelExport(scope,jobId) {
      check(scope);
      const job=studio?.exports.list(scope.projectId).find(job=>job.id===jobId);
      if (!job||job.project!==scope.projectId) throw new Error('Export belongs to another video scope');
      run(() => studio.exports.cancel(jobId));
    },
    async readExports(scope,jobId) {
      check(scope);await domain.start();check(scope);
      const all=studio.exports.list(scope.projectId),jobs=jobId?all.filter(job=>job.id===jobId):all;
      if(jobId&&!jobs.length)throw new Error('Export belongs to another video scope');
      return{jobs};
    },
    close() {
      if (closing) return closing;
      controller.abort();
      closing = (async () => {
        if (starting) { try { await starting; } catch { /* Startup abort already closes its server. */ } }
        if (studio) await run(() => studio.close());
        await waitForNativeSpeech(context);
        await waitForNativeTranslations(context);
        await waitForStudioEdits(context);
        await waitForStudioProjectWork(context);
      })();
      return closing;
    },
  };
  if (options.signal) {
    if (options.signal.aborted) await domain.close();
    else options.signal.addEventListener('abort',()=>{void domain.close();},{once:true});
  }
  return domain;
}
