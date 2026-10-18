import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {currentStudioContext} from './context.mjs';
import {createProject} from '../projects.mjs';

const EXAMPLES=[
 {id:'title-card',title:'StudyBuddy · 标题画面',description:'三秒标题，可直接修改文字和样式',eyebrow:'YOUR NEXT STORY',heading:'StudyBuddy',subtitle:'从一个想法，剪出你的故事。',background:'#f1f8f4',ink:'#143e2b'},
 {id:'vertical-intro',title:'StudyBuddy · 竖屏开场',description:'三秒竖屏开场，适合短视频',eyebrow:'MAKE SOMETHING YOURS',heading:'开始创作',subtitle:'StudyBuddy · 剪视频',background:'#f4f6fa',ink:'#263744'},
];
/** Bundled examples use no remote index, stock service or provider request. */
export function listNativeExamples(){return EXAMPLES.map(({id,title,description})=>({id,title,description,poster:null,duration:3,url:`studybuddy-example:${id}`,builtin:true}));}
/** An example is a new ordinary project; the person's existing files are never overwritten. */
export async function openNativeExample(id){
 const example=EXAMPLES.find(value=>value.id===id);
 if(!example)throw Error('VIDEO_EXAMPLE_INVALID');
 const context=currentStudioContext();if(!context||context.signal.aborted)throw Error('VIDEO_SCOPE_REVOKED');
 const project=await createProject(example.title),vertical=id==='vertical-intro',w=vertical?1080:1920,h=vertical?1920:1080;
 context.signal.throwIfAborted();await mkdir(join(project.path,'shots'),{recursive:true});
 const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=${w}, height=${h}"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center;background:${example.background};color:${example.ink};font-family:'Microsoft YaHei','Segoe UI',sans-serif}main{text-align:center;padding:100px}small{display:block;font-size:24px;letter-spacing:8px;color:#008b43}h1{font-size:${vertical?108:156}px;line-height:1.2;letter-spacing:-5px;margin:38px 0}p{font-size:32px;color:#62746c}.line{width:96px;height:6px;border-radius:8px;background:#008b43;margin:46px auto}</style><main id="card"><small>${example.eyebrow}</small><h1>${example.heading}</h1><div class="line"></div><p>${example.subtitle}</p></main><script>window.film={width:${w},height:${h},duration:3,frame(t){const progress=Math.min(1,Math.max(0,t/.55));const card=document.getElementById('card');card.style.opacity=String(progress);card.style.transform='translateY('+((1-progress)*24)+'px)';}};<\/script></html>`;
 await writeFile(join(project.path,'shots/intro.html'),page,{flag:'wx'});context.signal.throwIfAborted();
 await writeFile(join(project.path,'film.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=${w}, height=${h}"><title>${example.title}</title></head><body><section title="开场"><iframe id="intro" src="shots/intro.html#t=0,3"></iframe></section></body></html>`);
 return project;
}
