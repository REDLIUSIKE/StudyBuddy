import { Context,Service } from '@deepseek-ai/cordis'
import type { EmbeddedVideoDomain,VideoScope,VideoEdit,VideoRevision } from './video-domain-types.ts'

declare module '@deepseek-ai/cordis' { interface Context { videoEditing: VideoEditingService } }
/** The video domain's lifecycle and editing capability, independent of its transport. */
export abstract class VideoEditingService extends Service implements EmbeddedVideoDomain {
  abstract capabilityProjects(input:Parameters<EmbeddedVideoDomain['capabilityProjects']>[0]):Promise<unknown>
  abstract capability(...args:Parameters<EmbeddedVideoDomain['capability']>):Promise<unknown>
  abstract admitPaths(admission:Parameters<EmbeddedVideoDomain['admitPaths']>[0]):ReturnType<EmbeddedVideoDomain['admitPaths']>
  abstract projectInfo(projectId:string):ReturnType<EmbeddedVideoDomain['projectInfo']>
  abstract start(): ReturnType<EmbeddedVideoDomain['start']>
  abstract quiesceProject(scope:VideoScope):Promise<void>
  abstract readProject(scope:VideoScope): ReturnType<EmbeddedVideoDomain['readProject']>
  abstract readGuide(scope:VideoScope,guide:'manual'|'spec'):ReturnType<EmbeddedVideoDomain['readGuide']>
  abstract readFile(scope:VideoScope,path:string): ReturnType<EmbeddedVideoDomain['readFile']>
  abstract applyEdit(scope:VideoScope,revision:VideoRevision,edit:VideoEdit): ReturnType<EmbeddedVideoDomain['applyEdit']>
  abstract look(scope:VideoScope,input:Parameters<EmbeddedVideoDomain['look']>[1]): ReturnType<EmbeddedVideoDomain['look']>
  abstract transcribe(scope:VideoScope,src:string,signal?:AbortSignal):ReturnType<EmbeddedVideoDomain['transcribe']>
  abstract mediaRequest(scope:VideoScope,input:Parameters<EmbeddedVideoDomain['mediaRequest']>[1],signal?:AbortSignal):ReturnType<EmbeddedVideoDomain['mediaRequest']>
  abstract translate(scope:VideoScope,language:string,signal?:AbortSignal):ReturnType<EmbeddedVideoDomain['translate']>
  abstract createExport(scope:VideoScope,input:Parameters<EmbeddedVideoDomain['createExport']>[1]): ReturnType<EmbeddedVideoDomain['createExport']>
  abstract cancelExport(scope:VideoScope,id:string): Promise<void>
  abstract readExports(scope:VideoScope,id?:string):ReturnType<EmbeddedVideoDomain['readExports']>
  abstract close(): Promise<void>
}
/** Provider for one verified compiled domain; owns idempotent start and close. */
export class CompiledVideoEditingService extends VideoEditingService {
  private starting?:ReturnType<EmbeddedVideoDomain['start']>
  private closing?:Promise<void>
  constructor(ctx:Context,private readonly domain:EmbeddedVideoDomain){super(ctx,'videoEditing')}
  private admitted():void { if(this.closing)throw Error('VIDEO_DOMAIN_CLOSED') }
  capabilityProjects(input:Parameters<EmbeddedVideoDomain['capabilityProjects']>[0]):Promise<unknown>{this.admitted();if(!this.domain.capabilityProjects)throw Error('VIDEO_CAPABILITY_UNAVAILABLE');return this.domain.capabilityProjects(input)}
  capability(...args:Parameters<EmbeddedVideoDomain['capability']>):Promise<unknown>{this.admitted();if(!this.domain.capability)throw Error('VIDEO_CAPABILITY_UNAVAILABLE');return this.domain.capability(...args)}
  admitPaths(admission:Parameters<EmbeddedVideoDomain['admitPaths']>[0]):ReturnType<EmbeddedVideoDomain['admitPaths']>{this.admitted();return this.domain.admitPaths(admission)}
  projectInfo(projectId:string):ReturnType<EmbeddedVideoDomain['projectInfo']>{this.admitted();return this.domain.projectInfo(projectId)}
  start():ReturnType<EmbeddedVideoDomain['start']>{this.admitted();return this.starting??=this.domain.start()}
  quiesceProject(scope:VideoScope):Promise<void>{this.admitted();return this.domain.quiesceProject(scope)}
  readProject(scope:VideoScope):ReturnType<EmbeddedVideoDomain['readProject']>{this.admitted();return this.domain.readProject(scope)}
  readGuide(scope:VideoScope,guide:'manual'|'spec'):ReturnType<EmbeddedVideoDomain['readGuide']>{this.admitted();return this.domain.readGuide(scope,guide)}
  readFile(scope:VideoScope,path:string):ReturnType<EmbeddedVideoDomain['readFile']>{this.admitted();return this.domain.readFile(scope,path)}
  applyEdit(scope:VideoScope,revision:VideoRevision,edit:VideoEdit):ReturnType<EmbeddedVideoDomain['applyEdit']>{this.admitted();return this.domain.applyEdit(scope,revision,edit)}
  look(scope:VideoScope,input:Parameters<EmbeddedVideoDomain['look']>[1]):ReturnType<EmbeddedVideoDomain['look']>{this.admitted();return this.domain.look(scope,input)}
  transcribe(scope:VideoScope,src:string,signal?:AbortSignal):ReturnType<EmbeddedVideoDomain['transcribe']>{this.admitted();return this.domain.transcribe(scope,src,signal)}
  mediaRequest(scope:VideoScope,input:Parameters<EmbeddedVideoDomain['mediaRequest']>[1],signal?:AbortSignal):ReturnType<EmbeddedVideoDomain['mediaRequest']>{this.admitted();return this.domain.mediaRequest(scope,input,signal)}
  translate(scope:VideoScope,language:string,signal?:AbortSignal):ReturnType<EmbeddedVideoDomain['translate']>{this.admitted();return this.domain.translate(scope,language,signal)}
  createExport(scope:VideoScope,input:Parameters<EmbeddedVideoDomain['createExport']>[1]):ReturnType<EmbeddedVideoDomain['createExport']>{this.admitted();return this.domain.createExport(scope,input)}
  cancelExport(scope:VideoScope,id:string):Promise<void>{this.admitted();return this.domain.cancelExport(scope,id)}
  readExports(scope:VideoScope,id?:string):ReturnType<EmbeddedVideoDomain['readExports']>{this.admitted();return this.domain.readExports(scope,id)}
  close():Promise<void>{return this.closing??=this.domain.close()}
}
