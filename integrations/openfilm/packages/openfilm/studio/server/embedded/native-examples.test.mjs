import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withStudioContext} from './context.mjs';
import {listNativeExamples,openNativeExample} from './native-examples.mjs';
import {readProjectFilm} from '../film.mjs';

test('StudyBuddy examples create editable original-format projects offline within the account library',async t=>{
 const root=await mkdtemp(join(tmpdir(),'studybuddy-video-examples-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const context={workspaceRoot:join(root,'projects'),stateRoot:join(root,'state'),signal:new AbortController().signal};
 await mkdir(context.workspaceRoot,{recursive:true});
 const examples=listNativeExamples();assert.equal(examples.length,2);
 assert.doesNotMatch(JSON.stringify(examples),/openfilm|https?:/i);
 await withStudioContext(context,async()=>{
  for(const example of examples){
   const project=await openNativeExample(example.id);
   assert.ok(project.path.startsWith(context.workspaceRoot));
   const film=await readProjectFilm(project.path);assert.deepEqual(film.problems,[]);
   assert.match(film.text,/shots\/intro.html#t=0,3/);
   const page=await readFile(join(project.path,'shots/intro.html'),'utf8');
   assert.match(page,/StudyBuddy/);assert.doesNotMatch(page,/openfilm|https?:/i);assert.match(page,/window\.film/);
  }
  await assert.rejects(openNativeExample('../foreign'),/VIDEO_EXAMPLE_INVALID/);
 });
 await assert.rejects(openNativeExample('title-card'),/VIDEO_SCOPE_REVOKED/);
});
