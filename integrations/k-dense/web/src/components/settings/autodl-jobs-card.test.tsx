import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import * as projects from '@/lib/projects';import * as projectState from '@/lib/use-projects';
import {AutoDLJobsCard} from './autodl-jobs-card';
const json=(value:unknown)=>Promise.resolve(Response.json(value));
afterEach(()=>vi.restoreAllMocks());
it('pins job reads to their project and ignores a late record from the previous project',async()=>{
 let projectId='alpha',finish!: (value:Response)=>void;
 vi.spyOn(projectState,'useProjects').mockImplementation(()=>({activeProjectId:projectId}) as ReturnType<typeof projectState.useProjects>);
 const api=vi.spyOn(projects,'apiFetch').mockImplementation((_path,_init,id)=>id==='beta'?json({jobs:[{id:'b',instanceId:'beta-instance',state:'succeeded',cleanup:'shutdown-requested'}]}):new Promise(resolve=>{finish=resolve}));
 const view=render(<AutoDLJobsCard/>);await waitFor(()=>expect(api).toHaveBeenCalled());
 projectId='beta';view.rerender(<AutoDLJobsCard/>);await screen.findByText('实例：beta-instance');
 await act(async()=>finish(Response.json({jobs:[{id:'a',instanceId:'alpha-instance',state:'succeeded',cleanup:'shutdown-requested'}]})));
 await waitFor(()=>expect(screen.queryByText('实例：alpha-instance')).not.toBeInTheDocument());
 expect(api).toHaveBeenCalledWith('/autodl/jobs',expect.any(Object),'alpha');expect(api).toHaveBeenCalledWith('/autodl/jobs',expect.any(Object),'beta');
});
it('withdraws old logs on a project switch and does not display a delayed foreign log',async()=>{
 let projectId='alpha',finish!: (value:Response)=>void;
 vi.spyOn(projectState,'useProjects').mockImplementation(()=>({activeProjectId:projectId}) as ReturnType<typeof projectState.useProjects>);
 const api=vi.spyOn(projects,'apiFetch').mockImplementation((url)=>url.endsWith('/logs')?new Promise(resolve=>{finish=resolve}):json({jobs:[{id:'job-'+projectId,instanceId:projectId,state:'succeeded',cleanup:'shutdown-requested'}]}));
 const view=render(<AutoDLJobsCard/>);await screen.findByText('实例：alpha');await userEvent.setup().click(screen.getByRole('button',{name:'查看日志'}));
 projectId='beta';view.rerender(<AutoDLJobsCard/>);await screen.findByText('实例：beta');await act(async()=>finish(Response.json({text:'alpha-private-log'})));
 await waitFor(()=>expect(screen.queryByText('alpha-private-log')).not.toBeInTheDocument());expect(api).toHaveBeenCalledWith('/autodl/jobs/job-alpha/logs',expect.any(Object),'alpha');
});
