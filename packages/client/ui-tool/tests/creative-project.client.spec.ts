import {expect,it} from 'vitest'
import {creativeProjectAction} from '../src/client/tool/models/creative-project-model.ts'
it('shows only an opaque Main-minted project action from a completed native result',()=>{
 const projectAction={id:'55555555-5555-4555-8555-555555555555'},target={moduleId:'aigc',projectRef:'project-one'}
 expect(creativeProjectAction({projectAction,target})).toEqual(projectAction)
 for(const meta of [null,{projectAction:{id:'../../private'},target},{projectAction},{projectAction,target:{moduleId:'aigc',projectRef:'../foreign'}},{projectAction:{...projectAction,path:'secret'},target}])expect(creativeProjectAction(meta)).toBeNull()
})
