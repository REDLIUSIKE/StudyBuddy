import { expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execute = promisify(execFile)
it('runs the compiled domain on plain Node with guest isolation and existing installed file tools', async () => {
  const domain = new URL('../../integrations/toonflow/build/server/domain.js', import.meta.url).href
  const resources = fileURLToPath(new URL('../../.dsh-build/studybuddy-aigc/', import.meta.url))
  const temporary = await mkdtemp(join(tmpdir(), 'aigc-domain-'))
  const script = `
    import {mkdtemp,mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
    import {tmpdir} from 'node:os'; import {join} from 'node:path'; import {createHash} from 'node:crypto';
    import {createRequire} from 'node:module'; import {fileURLToPath,pathToFileURL} from 'node:url';
    const root=${JSON.stringify(temporary)}, data=join(root,'data'), project=join(data,'workspaces/project'), assets=join(root,'resources');
    await mkdir(project,{recursive:true}); await mkdir(join(assets,'web'),{recursive:true}); await mkdir(join(assets,'tools'),{recursive:true});
    await writeFile(join(assets,'web/index.html'),'<html><body>canvas</body></html>');
    await cp(join(${JSON.stringify(resources)},'tools/workspace.tool.js'),join(assets,'tools/workspace.tool.js'));
    await cp(join(${JSON.stringify(resources)},'tools/canvas.tool.js'),join(assets,'tools/canvas.tool.js'));
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),newPlugin=await readFile(join(assets,'tools/workspace.tool.js')),oldPlugin=Buffer.concat([newPlugin,Buffer.from('\\n// reviewed old build\\n')]);
    const migrationFiles=[{path:'tools/workspace.tool.js',size:newPlugin.length,sha256:hash(newPlugin),acceptedSha256:[hash(oldPlugin)]}],candidate=hash(JSON.stringify(migrationFiles));
    await mkdir(join(assets,'build'),{recursive:true});await writeFile(join(assets,'build/bundledMigration.json'),JSON.stringify({schemaVersion:1,candidate,baselines:[],files:migrationFiles}));
    await mkdir(join(data,'tools'),{recursive:true});await writeFile(join(data,'tools/workspace.tool.js'),oldPlugin);
    const metadata={name:'contractProbe',displayName:'Contract probe',description:'Validate before mutation',author:'test',github:'',configRules:[]};
    await writeFile(join(assets,'tools/contractProbe.tool.js'),'/*! toonflowTool:'+JSON.stringify(metadata)+' */\\nexport default {validateConfig:c=>c,createTools:ctx=>[{name:"rawSchemaProbe",description:"Raw schema validation",parameters:{type:"object",properties:{value:{type:"string",pattern:"^OK$"}},required:["value"],additionalProperties:false},execute:async(_id,args)=>{await ctx.files.writeFile("probe.txt",args.value);return {content:[{type:"text",text:"saved"}]}}}]}');
    const authorization='a'.repeat(64);
    let domain;
    try {
      const artifact=join(root,'artifact'),entry=join(artifact,'server/domain.js');await mkdir(join(artifact,'server'),{recursive:true});
      for(const name of ['domain.js','toolZod.js','image-resize-worker.js','package.json'])await cp(fileURLToPath(new URL('./'+name,${JSON.stringify(domain)})),join(artifact,'server',name));
      await cp(fileURLToPath(new URL('../node_modules/',${JSON.stringify(domain)})),join(artifact,'node_modules'),{recursive:true,dereference:true});
      const {createEmbeddedAigcDomain}=await import(pathToFileURL(entry).href),sharp=createRequire(entry)('sharp');
      domain=await createEmbeddedAigcDomain({bootstrap:{dataDirectory:data,workspaceRoots:[join(data,'workspaces')],guestAuthorization:authorization},resourceDirectory:assets,staticDirectory:join(assets,'web'),native:async()=>{throw Error('No native model request is authorized by this test')}});
      const {origin}=await domain.start();
      const request=(path,extra={})=>fetch(origin+path,{headers:{'x-studybuddy-aigc-guest':authorization,...extra}});
      const page=await request('/');
      const unauthorized=await fetch(origin+'/'); const foreign=await request('/',{origin:'http://example.invalid'});
      const old=await request('/api/agent');
      const sessionId='session-00000000-0000-4000-8000-000000000001';
      const catalog=await domain.invoke({operation:'catalog',directory:project,sessionId},new AbortController().signal);
      const resources=await domain.invoke({operation:'resources',directory:project,sessionId:'00000000-0000-4000-8000-000000000005'},new AbortController().signal);
      const invoke=(request,signal)=>domain.invoke({...request,schemaSha256:catalog.tools.find(tool=>tool.name===request.name)?.schemaSha256},signal);
      let rawValidated=false;try{await invoke({operation:'execute',directory:project,sessionId,name:'rawSchemaProbe',callId:'test-raw-schema',arguments:{value:'NO'},canvasId:null,expectedRevision:0},new AbortController().signal)}catch(error){rawValidated=String(error).includes('AIGC_TOOL_ARGUMENTS_INVALID')}
      const result=await invoke({operation:'execute',directory:project,sessionId,name:'write',callId:'test-write',arguments:{path:'story.txt',content:'preserved'},canvasId:null,expectedRevision:0},new AbortController().signal);
      await sharp({create:{width:2400,height:2400,channels:3,background:'#147ba4'}}).png({compressionLevel:0}).toFile(join(project,'large.png'));
      const image=await invoke({operation:'execute',directory:project,sessionId,name:'read',callId:'test-image-read',arguments:{path:'large.png'},canvasId:null,expectedRevision:0},new AbortController().signal);
      await writeFile(join(project,'scene.json'),JSON.stringify({toonflowCanvas:true,nodes:[],edges:[]}));
      let protectedCanvas=false;try{await invoke({operation:'execute',directory:project,sessionId,name:'write',callId:'test-raw-canvas',arguments:{path:'scene.json',content:'overwritten'},canvasId:null,expectedRevision:0},new AbortController().signal)}catch(error){protectedCanvas=String(error).includes('CANVAS_WRITE_REQUIRES_CONTROL')}
      let protectedBinding=false;try{await invoke({operation:'execute',directory:project,sessionId,name:'write',callId:'test-binding',arguments:{path:'.studybuddy-native.json',content:'{}'},canvasId:null,expectedRevision:0},new AbortController().signal)}catch(error){protectedBinding=String(error).includes('AIGC_BINDING_WRITE_DENIED')}
      const connectionId='00000000-0000-4000-8000-000000000002', calls=[];
      const controlHeaders={'x-studybuddy-aigc-guest':authorization,'x-toonflow-workspace':'1',origin,'Content-Type':'application/json'};
      const events=await fetch(origin+'/api/mcp/control/events?connectionId='+connectionId,{headers:controlHeaders});
      const post=(name,value)=>fetch(origin+'/api/mcp/control/'+name,{method:'POST',headers:controlHeaders,body:JSON.stringify({connectionId,...value})});
      await writeFile(join(project,'inactive.md'),'original inactive');
      await post('state',{revision:1,state:{directory:project,canvasId:'scene.json',canvasRevision:7,panel:'canvas',tools:[],projectList:[],document:{selection:{filePath:'active.md'},openResources:[{filePath:'inactive.md'},{filePath:'active.md'}]}}});
      const ui=(async()=>{let buffer='';for await(const bytes of events.body){buffer+=new TextDecoder().decode(bytes);let split;while((split=buffer.indexOf('\\n\\n'))>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);if(!frame.startsWith('data: '))continue;const call=JSON.parse(frame.slice(6));if(call.type!=='call')continue;calls.push(call);await post('result',{callId:call.callId,result:call.name==='flushSave'?{saved:true}:{fitted:true}});}}})().catch(()=>{});
      const canvas=await invoke({operation:'execute',directory:project,sessionId,name:'fitCanvas',callId:'test-canvas',arguments:{},canvasId:'scene.json',expectedRevision:7},new AbortController().signal);
      let protectedInactive=false;try{await invoke({operation:'execute',directory:project,sessionId,name:'write',callId:'test-inactive',arguments:{path:'inactive.md',content:'overwritten'},canvasId:'scene.json',expectedRevision:7},new AbortController().signal)}catch(error){protectedInactive=String(error).includes('AIGC_OPEN_FILE_REQUIRES_EDITOR_CONTROL')}
      const editorNames=['getDocument','openDocument','writeDocument'],editorAvailable=editorNames.every(name=>catalog.tools.some(tool=>tool.name===name));
      if(editorAvailable){await invoke({operation:'execute',directory:project,sessionId,name:'writeDocument',callId:'test-editor',arguments:{text:'updated',expectedText:'original',expectedSelection:{filePath:'inactive.md'}},canvasId:'scene.json',expectedRevision:7},new AbortController().signal)}
      let stale=false;try{await invoke({operation:'execute',directory:project,sessionId,name:'fitCanvas',callId:'test-stale',arguments:{},canvasId:'scene.json',expectedRevision:6},new AbortController().signal)}catch(error){stale=String(error).includes('REVISION_CONFLICT')}
      await writeFile(join(data,'tools/brokenPlugin.tool.js'),'/*! toonflowTool:'+JSON.stringify({...metadata,name:'brokenPlugin'})+' */\\nexport default {validateConfig:c=>c,createTools:ctx=>[{name:"brokenContract",description:"Unsupported contract",parameters:{$schema:"https://unsupported.invalid/schema",type:"object"},execute:async()=>({content:[]})}]}');
      let pluginDiagnostic='';try{await domain.invoke({operation:'catalog',directory:project,sessionId},new AbortController().signal)}catch(error){pluginDiagnostic=error.message}
      await rm(join(data,'tools/brokenPlugin.tool.js'));
      const migrated=hash(await readFile(join(data,'tools/workspace.tool.js')))===hash(newPlugin),backup=await readFile(join(data,'.nativeMigration',candidate,'tools/workspace.tool.js')).catch(()=>Buffer.from('missing'));
      const html=await page.text();await domain.close();await writeFile(join(data,'tools/workspace.tool.js'),'local plugin edit');
      domain=await createEmbeddedAigcDomain({bootstrap:{dataDirectory:data,workspaceRoots:[join(data,'workspaces')],guestAuthorization:authorization},resourceDirectory:assets,staticDirectory:join(assets,'web'),native:async()=>{throw Error('No native model request is authorized by this test')}});
      let migrationConflict=false;try{await domain.start()}catch(error){migrationConflict=String(error).includes('AIGC_BUNDLED_MIGRATION_CONFLICT')}
      const localPluginPreserved=await readFile(join(data,'tools/workspace.tool.js'),'utf8')==='local plugin edit';
      console.log('RESULT '+JSON.stringify({pluginDiagnostic,protectedInactive,editorAvailable,migrationConflict,localPluginPreserved,migrated,backupPreserved:hash(backup)===hash(oldPlugin),status:page.status,html,unauthorized:unauthorized.status,foreign:foreign.status,old:old.status,names:catalog.tools.map(row=>row.name),content:await readFile(join(project,'story.txt'),'utf8'),result,canvas,stale,calls,protectedCanvas,rawValidated,protectedBinding,resources,imageResized:image.content.some(part=>part.type==='image'&&part.data.length<1000000)}));
    }finally{await domain?.close();}
  `
  const result = await execute(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], { windowsHide: true, timeout: 25000, maxBuffer: 1024 * 1024 }).catch(error => { throw Error(String(error.stderr).slice(-4000) + '\n' + String(error.stdout).slice(-1000)) })
    .finally(() => rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))
  const line = result.stdout.split('\n').find(value => value.startsWith('RESULT '))
  expect(line).toBeDefined()
  const value = JSON.parse(line!.slice(7))
  expect(value).toMatchObject({ status: 200, unauthorized: 401, foreign: 403, old: 403, content: 'preserved' })
  expect(value.html).toContain('canvas')
  expect(value.names).toEqual(expect.arrayContaining(['read', 'write', 'edit', 'ls', 'downloadImage', 'memory']))
  expect(value.resources).toHaveProperty('text')
  expect(value.resources.text).toMatch(/^你是 StudyBuddy 创作助手/)
  expect(value.protectedBinding).toBe(true)
  expect(value.protectedInactive).toBe(true)
  expect(value.editorAvailable).toBe(true)
  expect(value.pluginDiagnostic).toBe('AIGC_PLUGIN_INCOMPATIBLE_' + Buffer.from('brokenPlugin').toString('hex').toUpperCase())
  expect(value.imageResized).toBe(true)
  expect(value.migrated).toBe(true)
  expect(value.backupPreserved).toBe(true)
  expect(value.migrationConflict).toBe(true)
  expect(value.localPluginPreserved).toBe(true)
  expect(value.result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text' })]))
  expect(value.stale).toBe(true)
  expect(value.protectedCanvas).toBe(true)
  expect(value.rawValidated).toBe(true)
  expect(value.calls.map((call: { name: string }) => call.name)).toEqual(['flushSave', 'fitCanvas', 'flushSave', 'flushSave', 'writeDocument'])
  expect(value.calls.at(-1).args).toMatchObject({ text: 'updated', expectedText: 'original', expectedSelection: { filePath: 'inactive.md' } })
  expect(value.calls[1].expected).toMatchObject({ canvasId: 'scene.json', revision: 7, operationId: 'test-canvas' })
}, 30000)
