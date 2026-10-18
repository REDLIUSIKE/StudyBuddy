/** Launch the Desktop profile through the Web application and report its URL to Electron. */

import { delimiter, join } from 'node:path'
import {desktopSearchProfilePatch} from './search-profile.ts'
import {StudyBuddySearchHostControl} from './studybuddy-search.ts'
import type {} from '@deepseek-ai/dsh-web-search-studybuddy'
import { inspect } from 'node:util'
import { loadLayeredEnv, loadProfileDirectory, reportSkippedBundles } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import * as desktopOffice from './office.ts'

import { installDesktopUpdateTaskControl } from './update-tasks.ts'
import { installDesktopQuitInspection } from './quit-inspection.ts'
import { installPlatformSessionPublisher } from './platform-session.ts'
import { installOfficeEngineResolution } from './office-engine.ts'
import { builtinControlError, installBuiltinHostControl } from './studybuddy-builtin-models.ts'
import type { BuiltinHostControl } from './studybuddy-builtin-models.ts'
import { installResearchHostControl, type ResearchHostControl } from './research-control.ts'
import { installAigcHostControl, type AigcHostControl } from './aigc-control.ts'
import { installVideoHostControl,type VideoHostControl } from './video-control.ts'
import {installResearchScheduleSafetyGuard} from './research-schedules.ts'
import { installSkillSafetyHostControl, type NativeSkillSafetyHostControl } from './studybuddy-skill-safety.ts'
import {installCapabilityHostControl} from './capabilities/control.ts'
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant'

async function main(): Promise<void> {
  const runtimeDir = process.argv[2] as string
  const projectDir = process.argv[3] as string
  installOfficeEngineResolution(runtimeDir)
  const installAnchor = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const profile = loadProfileDirectory('dsh', projectDir, installAnchor)
  reportSkippedBundles('dsh', profile)
  const control: {
    updateTasks?: ReturnType<typeof installDesktopUpdateTaskControl>
    quitInspection?: ReturnType<typeof installDesktopQuitInspection>
    builtin?: BuiltinHostControl
    research?: ResearchHostControl
    aigc?: AigcHostControl
    video?: VideoHostControl
    skillSafety?: NativeSkillSafetyHostControl
    search?: StudyBuddySearchHostControl
    capabilities?:Awaited<ReturnType<typeof installCapabilityHostControl>>
  } = {}
  const application = runProfile({
    environment: loadLayeredEnv('dsh'),
    profile: 'desktop',
    resolvedProfile: { profile, installAnchor },
    patchFiles: [desktopSearchProfilePatch(import.meta.url)],
    args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
    prepareContext:ctx=>{const dispose=installResearchScheduleSafetyGuard(ctx);ctx.effect(()=>dispose);ctx.provide('studybuddySearch',{available:()=>control.search?.available()??false,request:request=>{if(!control.search)throw Error('STUDYBUDDY_SEARCH_UNAVAILABLE');return control.search.request(request)},execute:(request,signal)=>control.search?control.search.execute(request,signal):Promise.reject(Error('STUDYBUDDY_SEARCH_UNAVAILABLE'))})},
    ...(process.argv[5] === undefined ? {} : {
      packageManager: {
        command: process.execPath,
        args: ['--expose-internals', process.argv[5]],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
          PATH: `${process.argv[6] ?? ''}${delimiter}${process.env.PATH ?? ''}`,
        },
      },
    }),
  })
  let stopping: Promise<void> | undefined
  const send = (message: object): Promise<void> => new Promise((resolve, reject) => {
    if (!process.connected || process.send === undefined) { resolve(); return }
    process.send(message, (error) => { if (error === null) resolve(); else reject(error) })
  })
  const stop = (): Promise<void> => stopping ??= (async () => {
    // Startup failure is reported by main; shutdown only owns a tree that booted.
    const running = await application.catch(() => undefined)
    await running?.shutdown.shutdown(0)
    await send({ type: 'shutdown-complete' })
    if (process.connected) process.disconnect()
  })()
  process.on('message', (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return
    if (message.type === 'shutdown') { void stop(); return }
    if (message.type === 'builtin-admit-result') { control.builtin?.admissionResult(message); return }
    if (message.type === 'platform-admit-result') {control.builtin?.platformAdmissionResult(message);return}
    if(message.type==='search-result'){control.search?.result(message);return}
    if (message.type === 'media-result') {control.builtin?.mediaResult(message);return}
    if (message.type === 'research-tool-result') { control.research?.toolResult(message); return }
    if (message.type === 'video-tool-result') { control.video?.toolResult(message); return }
    if(message.type==='capability-result'){control.capabilities?.result(message);return}
    if(message.type==='capability-control'){
      if(!('requestId'in message)||!Number.isSafeInteger(message.requestId)||!('action'in message)||typeof message.action!=='string'||!('data'in message))return
      const {requestId,action,data}=message
      void(async()=>{try{if(stopping||!control.capabilities)throw Error('CAPABILITY_HOST_UNAVAILABLE');await send({type:'capability-control',requestId,data:await control.capabilities.command(action,data)})}
      catch(error){await send({type:'capability-control',requestId,data:null,error:error instanceof Error&&/^[A-Z0-9_]{1,128}$/.test(error.message)?error.message:'CAPABILITY_OPERATION_FAILED'})}})().catch(()=>{console.error('Capability private channel unavailable')});return
    }
    if (message.type === 'video-control') {
      if(!('requestId'in message)||!Number.isSafeInteger(message.requestId)||!('action'in message)||typeof message.action!=='string'||!('data'in message))return
      const {requestId,action,data}=message
      void(async()=>{
        try{if(stopping||!control.video)throw Error('VIDEO_HOST_UNAVAILABLE');await send({type:'video-control',requestId,data:await control.video.command(action,data)})}
        catch(error){await send({type:'video-control',requestId,data:null,error:error instanceof Error&&/^VIDEO_[A-Z_]+$/.test(error.message)?error.message:'VIDEO_ACTION_FAILED'})}
      })().catch(()=>{console.error('Video private channel is unavailable')})
      return
    }
    if (message.type === 'aigc-tool-result') { control.aigc?.toolResult(message); return }
    if (message.type === 'aigc-control') {
      if (!('requestId' in message) || !Number.isSafeInteger(message.requestId) || !('action' in message) || typeof message.action !== 'string' || !('data' in message)) return
      const { requestId, action, data } = message
      void (async () => {
        try {
          if (stopping || !control.aigc) throw Error('AIGC_HOST_UNAVAILABLE')
          await send({ type: 'aigc-control', requestId, data: await control.aigc.command(action, data) })
        } catch (error) { await send({ type: 'aigc-control', requestId, data: null,
          error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'AIGC_ACTION_FAILED' }) }
      })().catch(() => { console.error('AIGC private channel is unavailable') })
      return
    }
    if (message.type === 'skill-safety-result') { control.skillSafety?.result(message); return }
    if (message.type === 'skill-safety-control') {
      if (!('requestId' in message) || !Number.isSafeInteger(message.requestId) || !('action' in message) || typeof message.action !== 'string' || !('data' in message)) return
      const action = message.action, data = message.data, requestId = message.requestId
      void (async () => {
        try {
          if (stopping !== undefined || !control.skillSafety) throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE')
          await send({ type: 'skill-safety-control', requestId, data: await control.skillSafety.command(action, data) })
        } catch (error) { await send({ type: 'skill-safety-control', requestId, data: null, error: error instanceof SkillSafetyError ? error.code : 'SKILL_SAFETY_UNAVAILABLE' }) }
      })().catch(() => { console.error('Skill Safety private channel is unavailable') })
      return
    }
    if (message.type === 'research-control') {
      if (!('requestId' in message) || !Number.isSafeInteger(message.requestId) || !('action' in message) || typeof message.action !== 'string' || !('data' in message)) return
      const action = message.action, input = message.data, requestId = message.requestId
      void (async () => {
        try {
          if (stopping !== undefined || !control.research) throw Error('HARNESS_RESEARCH_HOST_UNAVAILABLE')
          const data = await control.research.command(action, input)
          await send({ type: 'research-control', requestId, data })
        } catch (error) {
          await send({ type: 'research-control', requestId, data: null,
            error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'HARNESS_RESEARCH_ACTION_FAILED' })
        }
      })().catch(() => { console.error('Research private channel is unavailable') })
      return
    }
    if (message.type === 'builtin-control') {
      if (!('requestId' in message) || !Number.isSafeInteger(message.requestId) || !('action' in message) || !('data' in message)) return
      void (async () => {
        try {
          if (stopping !== undefined || control.builtin === undefined) throw new Error('BUILTIN_HOST_UNAVAILABLE')
          if(message.action==='media-scope')control.search?.setScope(message.data)
          const data = await control.builtin.command(message.action, message.data)
          await send({ type: 'builtin-control', requestId: message.requestId, data })
        } catch (error) {
          await send({
            type: 'builtin-control', requestId: message.requestId, data: null, error:
              builtinControlError(error),
          })
        }
      })().catch(() => { console.error('Built-in private channel is unavailable') })
      return
    }
    if (message.type === 'quit-inspection') {
      if (!('requestId' in message) || !Number.isSafeInteger(message.requestId)) return
      const requestId = message.requestId
      void (async () => {
        try {
          if (stopping !== undefined || control.quitInspection === undefined) throw new Error('desktop quit: Host is unavailable')
          const inspection = await control.quitInspection()
          await send({ type: 'quit-inspection', requestId, ...inspection })
        } catch (error) {
          // The shell treats an unknown state as interruptible work and asks before quitting.
          await send({
            type: 'quit-inspection', requestId, activeTasks: true, scheduledTasks: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })().catch((error: unknown) => { console.error(error) })
      return
    }
    if (message.type !== 'update-tasks' || !('requestId' in message) || !Number.isSafeInteger(message.requestId)
      || !('action' in message) || !['inspect', 'lock', 'unlock'].includes(String(message.action))) return
    void (async () => {
      try {
        if (stopping !== undefined || control.updateTasks === undefined) throw new Error('desktop update: Host is unavailable')
        const active = await control.updateTasks(message.action as 'inspect' | 'lock' | 'unlock')
        await send({ type: 'update-tasks', requestId: message.requestId, active })
      } catch (error) {
        await send({
          type: 'update-tasks', requestId: message.requestId, active: true,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })().catch((error: unknown) => { console.error(error) })
  })
  process.once('disconnect', () => { void stop() })
  const { ctx } = await application
  control.updateTasks = installDesktopUpdateTaskControl(ctx)
  control.quitInspection = installDesktopQuitInspection(ctx)
  control.builtin = installBuiltinHostControl(ctx, send)
  control.capabilities=await installCapabilityHostControl(ctx,control.builtin.hostGeneration,send)
  control.search=new StudyBuddySearchHostControl(ctx,control.builtin.hostGeneration,send)
  control.research = installResearchHostControl(ctx, control.builtin.hostGeneration, send)
  control.aigc = installAigcHostControl(ctx, control.builtin.hostGeneration, send)
  control.video = installVideoHostControl(ctx,control.builtin.hostGeneration,send)
  control.skillSafety = installSkillSafetyHostControl(ctx, send, control.builtin.hostGeneration)
  await ctx.plugin(desktopOffice, {
    runtimeDir,
    source: process.argv[4] ?? join(runtimeDir, '..', 'runtime', 'primary-runtime'),
    root: join(resolveDshHome(), 'dsh-runtimes', 'dsh-primary-runtime'),
  })
  installPlatformSessionPublisher(ctx, (session) => {
    if (process.connected) process.send?.({ type: 'platform-session', session })
  })
  const url = ctx.connection.authenticatedUrl(`${ctx.webServer.protocol}//127.0.0.1:${String(ctx.webServer.port)}`)
  if (process.connected) process.send?.({
    type: 'ready', url, hostGeneration: control.builtin.hostGeneration,
    injections: ctx.webServer.collectIndexInjections(),
  }, (error) => { if (error !== null) console.error(error) })
}

/** Upper bound of the startup diagnostic carried over IPC; the head holds the message and stack. */
const MAX_FATAL_DIAGNOSTIC_CHARS = 64 * 1024

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    // The shell receives the complete inspected error here, not through stderr:
    // stderr bytes and this IPC message race, and the shell reports the first
    // failure it sees.
    const diagnostic = inspect(error, { depth: 4, maxArrayLength: 50 }).slice(0, MAX_FATAL_DIAGNOSTIC_CHARS)
    if (process.connected) process.send?.({ type: 'fatal', message, diagnostic }, (error) => { if (error !== null) console.error(error) })
    console.error(error)
    process.exitCode = 1
    if (process.connected) process.disconnect()
  })
}
