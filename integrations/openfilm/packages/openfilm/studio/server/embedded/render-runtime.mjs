import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath,stat } from 'node:fs/promises';
import { isAbsolute,relative,sep } from 'node:path';

async function digest(path) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function resolveVideoRenderRuntime({primaryRuntimeDirectory,candidateDirectory,expectedIdentities}) {
  const roots=await Promise.all([primaryRuntimeDirectory,candidateDirectory].map(path=>realpath(path)));
  const paths={};
  const identities={};
  for(const name of ['browser','ffmpeg','ffprobe']) {
    const expected=expectedIdentities?.[name];
    if(!expected || !isAbsolute(expected.path) || !/^[a-f0-9]{64}$/.test(expected.sha256) || !expected.version)
      throw new Error('Reviewed video runtime identity is required for '+name);
    const path=await realpath(expected.path);
    if(!roots.some(root=>{const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);}))
      throw new Error('Video runtime is outside its reviewed resource directories');
    if(!(await stat(path)).isFile() || await digest(path)!==expected.sha256)
      throw new Error('Video runtime identity changed: '+name);
    paths[name+'Executable']=path;
    identities[name]={sha256:expected.sha256,version:expected.version};
  }
  return {...paths,identities};
}
