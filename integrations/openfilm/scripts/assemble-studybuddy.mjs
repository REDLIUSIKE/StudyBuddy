import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp,mkdir,readFile,readdir,realpath,stat,writeFile } from 'node:fs/promises';
import { dirname,isAbsolute,join,relative,resolve,sep } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { windowsProgramClosure } from './studybuddy-pe-closure.mjs';
const source=resolve(fileURLToPath(new URL('..',import.meta.url))),pkg=join(source,'packages/openfilm');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const slash=value=>value.split(sep).join('/');
const inside=(root,value)=>{const rel=relative(root,value);return!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
async function files(root,prefix=''){
 const result=[];
 for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
  const name=prefix+entry.name;
  if(entry.isSymbolicLink())throw Error('Resource symlink is forbidden: '+name);
  if(entry.isDirectory())result.push(...await files(root,name+'/'));else if(entry.isFile())result.push(name);else throw Error('Unsupported resource: '+name);
 }
 return result.sort();
}
async function row(root,name){const bytes=await readFile(join(root,name));return{path:slash(name),size:bytes.length,sha256:digest(bytes)};}
async function copyRuntimeTree(from,to,include=()=>true){
 for(const name of await files(from)){if(!include(name))continue;const target=join(to,name);await mkdir(dirname(target),{recursive:true});await cp(join(from,name),target);}
}
async function sourceIdentity(){
 const names=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean).sort();
 const rows=[];for(const name of names)rows.push(await row(source,name));return{digest:digest(JSON.stringify(rows)),files:rows};
}
/** Assemble a new immutable candidate. Existing candidates are never replaced or deleted. */
export async function assembleVideo(config){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('This renderer candidate is Windows x64 only');
 for(const key of['outDirectory','harnessDirectory','browserDirectory','gitDirectory','primaryDirectory','dshDirectory','aigcDirectory'])if(typeof config[key]!=='string'||!isAbsolute(config[key]))throw Error('Explicit build input required: '+key);
 const upstream=execFileSync('git',['rev-parse','v0.1.7^{commit}'],{cwd:source,encoding:'utf8'}).trim();
 if(upstream!=='6ad25014526e3e4abe8b671aa8009c1ce16ab7cf')throw Error('OpenFilm source pin differs');
 const identity=await sourceIdentity(),out=config.outDirectory;
 await mkdir(dirname(out),{recursive:true});await mkdir(out);
 const require=createRequire(await realpath(join(pkg,'node_modules/vite/package.json'))),esbuild=require('esbuild');
 const aliases=new Map([
  [join(pkg,'studio/server/get.mjs'),join(pkg,'studio/server/embedded/native-get.mjs')],
  [join(pkg,'studio/server/providers/index.mjs'),join(pkg,'studio/server/embedded/native-providers.mjs')],
  [join(pkg,'studio/client.mjs'),join(pkg,'studio/server/embedded/native-client.mjs')],
 ]);
 const raw=new Set();
 const build=await esbuild.build({entryPoints:{domain:join(pkg,'studio/server/embedded/domain.mjs'),'render-worker':join(pkg,'studio/server/render-worker.mjs')},outdir:join(out,'compiled'),outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',target:'node24',minify:true,sourcemap:false,splitting:false,metafile:true,external:['playwright-core'],logLevel:'silent',plugins:[{
  name:'sealed-studybuddy-domain',setup(build){
   build.onResolve({filter:/\.mjs$/},args=>{const path=resolve(args.resolveDir,args.path),alias=aliases.get(path);return alias?{path:alias}:undefined;});
   build.onLoad({filter:/\.[cm]?js$/},async args=>{
    if(!inside(pkg,args.path))throw Error('Unexpected source dependency: '+args.path);
    let contents=await readFile(args.path,'utf8');
    contents=contents.replace(/new URL\((['"])([.][^'"]*)\1,\s*import\.meta\.url\)/g,(_all,_quote,value)=>{
     const target=resolve(dirname(args.path),value),name=slash(relative(pkg,target));
     if(!inside(pkg,target))throw Error('Raw resource is outside the owning package');
     if(name==='studio/server/render-worker.mjs')return"new URL('./render-worker.mjs',import.meta.url)";
     if(name==='studio/ui/src')return"new URL('../unavailable-src',import.meta.url)";
     if(name==='studio/ui/dist')return"new URL('../web/',import.meta.url)";
     raw.add(name);return`new URL(${JSON.stringify('../runtime/'+name)},import.meta.url)`;
    });
    return{contents,loader:'js',resolveDir:dirname(args.path)};
   });
  },
 }]});
 const inputs=Object.keys(build.metafile.inputs);
 if(inputs.some(name=>/(?:^|[/\\])(?:keys|custom-services|main)\.mjs$|[/\\]providers[/\\](?!index)/.test(name))||inputs.some(name=>name.includes('apps/desktop/')))throw Error('Standalone provider or agent entered the domain');
 for(const name of raw){
  if(!['src/timeline.mjs','src/film-doc.mjs','src/overrides.mjs','studio/server/film-subtitle.mjs','studio/server/bridge.js','studio/server/stage.js','package.json','product.json','STUDYBUDDY-VIDEO-GUIDE.md','SPEC.md'].includes(name))throw Error('Unreviewed raw runtime resource: '+name);
  const target=join(out,'runtime',name);await mkdir(dirname(target),{recursive:true});
  const bytes=await readFile(join(pkg,name));
  await writeFile(target,/\.[cm]?js$/.test(name)?(await esbuild.transform(bytes.toString('utf8'),{loader:'js',format:'esm',target:'es2022',minify:true})).code:bytes);
 }
 const ui=join(pkg,'studio/ui/dist');if(!await stat(join(ui,'index.html')).then(v=>v.isFile(),()=>false))throw Error('Build the original embedded Studio UI first');
 await copyRuntimeTree(ui,join(out,'web'),name=>!name.endsWith('.map'));
 const playwright=await realpath(createRequire(join(pkg,'package.json')).resolve('playwright-core/package.json'));
 const playwrightRoot=dirname(playwright),version=JSON.parse(await readFile(playwright,'utf8')).version;
 if(version!=='1.61.1')throw Error('Unreviewed Playwright version');
 await copyRuntimeTree(playwrightRoot,join(out,'node_modules/playwright-core'),name=>!name.endsWith('.map')&&!name.endsWith('.d.ts')&&!name.endsWith('.d.mts')&&!name.endsWith('.md')||/LICENSE|NOTICE/.test(name));
 const browser=join(out,'renderer','chromium-1228');
 await copyRuntimeTree(config.browserDirectory,browser,name=>!name.endsWith('debug.log'));
 const browserRow=await row(browser,'chrome-headless-shell.exe');
 if(browserRow.sha256!=='28016df6864d302434c9231e1f9f1a8a7ecc512cb2fe3faabb2a36130b96bcf1')throw Error('Unreviewed browser executable');
 const git=join(out,'native/git');await mkdir(git,{recursive:true});
 const closure=await windowsProgramClosure(join(config.gitDirectory,'mingw64/bin/git.exe'),join(process.env.SystemRoot,'System32'));
 for(const item of closure)await writeFile(join(git,item.path.split(/[\\/]/).pop()),item.bytes);
 await cp(join(config.gitDirectory,'LICENSE.txt'),join(git,'LICENSE.txt'));
 const gitVersion=execFileSync(join(git,'git.exe'),['--version'],{encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,PATH:git}}).trim();
 if(gitVersion!=='git version 2.53.0.windows.1')throw Error('Unreviewed Git runtime');
 const licenses=join(out,'notices');await mkdir(licenses);
 for(const[name,path]of[['OpenFilm-LICENSE',join(source,'LICENSE')],['OpenFilm-TRADEMARK.md',join(pkg,'TRADEMARK.md')],['OpenFilm-THIRD_PARTY_NOTICES.md',join(pkg,'THIRD_PARTY_NOTICES.md')]])await cp(path,join(licenses,name));
 const reference=async(root,name,version)=>({root,...await row({primary:config.primaryDirectory,dsh:config.dshDirectory,aigc:config.aigcDirectory,video:out}[root],name),version});
 const manifest={schemaVersion:1,kind:'studybuddy-video-plugin',profile:'studybuddy-video',platform:process.platform,arch:process.arch,upstream:{repository:'https://github.com/openfilm/openfilm.git',tag:'v0.1.7',commit:upstream},sourceDigest:identity.digest,lockDigest:digest(await readFile(join(source,'pnpm-lock.yaml'))),entry:'compiled/domain.mjs',staticEntry:'web/index.html',shared:{
  node:await reference('primary','dependencies/node/bin/node.exe',config.nodeVersion),entry:await reference('dsh','node_modules/@deepseek-ai/dsh/lib/bin.js',config.dshVersion),plugin:await reference('dsh','node_modules/@deepseek-ai/dsh-desktop-host/lib/video-editing-plugin.js',config.dshVersion),
  browser:await reference('video','renderer/chromium-1228/chrome-headless-shell.exe','149.0.7827.55 / playwright-1228'),
  ffmpeg:await reference('aigc','bin/ffmpeg.exe','6.1.1-essentials_build-www.gyan.dev'),ffprobe:await reference('aigc','bin/ffprobe.exe','6.1.1-essentials_build-www.gyan.dev'),git:await reference('video','native/git/git.exe',gitVersion),
 },files:await Promise.all((await files(out)).map(name=>row(out,name)))};
 if(manifest.shared.ffmpeg.sha256!=='04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00'||manifest.shared.ffprobe.sha256!=='3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4')throw Error('The reviewed shared FFmpeg bytes changed');
 if(execFileSync(join(config.primaryDirectory,'dependencies/node/bin/node.exe'),['-p','process.versions.node'],{encoding:'utf8'}).trim()!==config.nodeVersion)throw Error('Shared Node version differs');
 const text=JSON.stringify(manifest,null,2)+'\n';await writeFile(join(out,'manifest.json'),text);
 const pin={manifestSha256:digest(text),sourceDigest:manifest.sourceDigest,lockDigest:manifest.lockDigest};
 const proof={checkedDate:'2026-10-17',pin,upstream,source:identity.files,buildInputs:inputs,assemblerSha256:digest(await readFile(fileURLToPath(import.meta.url))),gitFiles:closure.map(item=>({name:item.path.split(/[\\/]/).pop(),size:item.bytes.length,sha256:digest(item.bytes)})),uncompressedBytes:manifest.files.reduce((sum,row)=>sum+row.size,Buffer.byteLength(text)),fullParityProven:false};
 await writeFile(out+'.build-proof.json',JSON.stringify(proof,null,2)+'\n');return{pin,manifest,proof};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const config=JSON.parse(await readFile(process.argv[2],'utf8')),result=await assembleVideo(config);
 console.log(JSON.stringify({directory:config.outDirectory,pin:result.pin,files:result.manifest.files.length,uncompressedBytes:result.proof.uncompressedBytes,gitFiles:result.proof.gitFiles}));
}
