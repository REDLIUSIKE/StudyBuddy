/** Native model tools use a separate private caller role from the public workbench. */
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Check } from "typebox/value";
import { NotebookParams, executeNotebookRecord, makeNotebookTool } from "../agent/notebook.ts";
import { executeMemoryRecall } from "../agent/notebook-memory.ts";
import { notebookSearchTool } from "../../pi-packages/kady-notebook/memory-tool.ts";
import { makePdfAnnotationTools, addPdfAnnotation, listPdfAnnotations, removePdfAnnotation, AddPdfAnnotationParams, ListPdfAnnotationsParams, RemovePdfAnnotationParams } from "../agent/pdf-annotation-tool.ts";
import { currentProjectId } from "../scope.ts";
import { resolvePaths } from "../projects.ts";
import { assertResearchPath } from "../runtime/project-storage.ts";
import { classifyBashCommand, classifyFilePath } from "../agent/bash-classifier.ts";
import { readGuardPolicy } from "../agent/guard-policy.ts";
import type { RuntimeContext } from "../runtime/contracts.ts";
import { nativeMcpCatalog } from '../runtime/native-mcp-catalog.ts';
import {independentServiceTools,type NativeIndependentServices} from '../runtime/independent-services.ts';
import {NativeSpecialistSchema,NativeFusionSchema,type NativeAdvancedWorkflows} from '../runtime/native-advanced.ts';
import fs from 'node:fs';import path from 'node:path';import {readWatchdogSettings} from '../agent/watchdog-settings.ts';
import type {NativeProjectBudget} from '../runtime/native-project-budget.ts';
import {NativeMissionSchema,type NativeResearchMissions} from '../runtime/native-missions.ts';
import {NativeScheduleSchema,type NativeResearchSchedules} from '../runtime/native-schedules.ts';
import {NativeWorkflowSchema,type NativeResearchWorkflows} from '../runtime/native-workflows.ts';
import type {NativeProvenance} from '../runtime/native-provenance.ts';
import {makeScientificResultTool,executeScientificResult,ScientificResultParams,type ScientificResultParamsT} from '../agent/scientific-result.ts';
interface Owner { authorization: string; current(): boolean; context(projectId: string): Promise<RuntimeContext>; services?:NativeIndependentServices; advanced?:NativeAdvancedWorkflows;budget?:NativeProjectBudget;missions?:NativeResearchMissions;schedules?:NativeResearchSchedules;workflows?:NativeResearchWorkflows;provenance?:NativeProvenance }
/** @param app - Already admitted local server. @param owner - Private native actor/root owner. */
export async function registerEmbeddedToolRoutes(app: FastifyInstance, owner: Owner): Promise<void> {
  await app.register(async child => {
    child.addHook("preHandler", async (request, reply) => {
      const header = request.headers["x-studybuddy-research-tool"], expected = Buffer.from(owner.authorization);
      if (!owner.current() || typeof header !== "string" || Buffer.byteLength(header) !== expected.length || !timingSafeEqual(Buffer.from(header), expected))
        await reply.code(403).send({ detail: "RESEARCH_NATIVE_TOOL_ROLE_REQUIRED" });
    });
    child.post<{ Params: { operation: string } }>("/research/tools/:operation", async (req, reply) => {
      const body = req.body as { toolCallId?: unknown; sessionId?: unknown; record?: unknown } | null;
      if (!body || Object.keys(body).length !== 3 || Object.keys(body).some(key => !["toolCallId", "sessionId", "record"].includes(key)) || typeof body.toolCallId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(body.toolCallId)) return reply.code(400).send({ detail: "RESEARCH_TOOL_INPUT_INVALID" });
      if(req.params.operation==='budget') {if(!owner.budget)throw Error('RESEARCH_BUDGET_UNAVAILABLE');if(typeof body.sessionId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(body.sessionId))throw Error('RESEARCH_CONTEXT_REVOKED');const context=await owner.context(currentProjectId());if(body.record&&typeof body.record==='object'&&Object.keys(body.record).length===1&&'action'in body.record&&body.record.action==='status')return owner.budget.state(context.projectId);await owner.budget.admit(context.projectId,body.record);return {admitted:true};}
      if (req.params.operation === "catalog") {
        if (typeof body.sessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(body.sessionId)) return reply.code(400).send({ detail: "RESEARCH_TOOL_INPUT_INVALID" });
        const original = [makeNotebookTool(currentProjectId(), () => String(body.sessionId)), notebookSearchTool(input => executeMemoryRecall(currentProjectId(), input)), ...makePdfAnnotationTools(currentProjectId()),makeScientificResultTool(currentProjectId())];
        const paths=resolvePaths(currentProjectId()),watchdogFile=path.join(paths.sandbox,'.pi','WATCHDOG.md');assertResearchPath(watchdogFile);let instructions='';if(fs.existsSync(watchdogFile)){if(fs.statSync(watchdogFile).size>32768)throw Error('RESEARCH_WATCHDOG_GUIDANCE_LIMIT');instructions=fs.readFileSync(watchdogFile,'utf8');}
        return { tools: [...(owner.missions?[{name:'research_mission',description:'Manage original project missions, decisions, receipts and native run links. These authored records do not prove execution, token usage or billing.',parameters:NativeMissionSchema}]:[]),...(owner.schedules?[{name:'research_schedule',description:'Manage durable research automation using a creation-time frozen native workflow and the current account/project. Timer delivery is not completion evidence. Paused or unknown outcomes are never retried as new paid operations.',parameters:NativeScheduleSchema}]:[]),...(owner.workflows?[{name:'research_workflow',description:'Execute the original isolated JavaScript workflow Worker with exact native specialist definitions. Supports scripts, tasks, sequential chains and parallel lanes. workflow:true reads the single js workflow fence in this tool call reply; no workflow executes a Pi model or estimates usage. Inspect/cancel the existing operation; never replay an uncertain start.',parameters:NativeWorkflowSchema}]:[]),...original.map(({ name, description, parameters }) => ({ name, description: description.replaceAll("Kady", "StudyBuddy"), parameters })),...(owner.services?independentServiceTools:[]),...(owner.advanced?[{name:'research_specialist',description:'Run an enabled scientific specialist from the original project roster using the exact native model selection. Observe, steer or cancel its existing operation; never replay a failed or unknown paid start.',parameters:NativeSpecialistSchema},{name:'research_fusion',description:'Compare exact native model perspectives and synthesize through an exact chosen judge model. Every component has its own native Session/accounting; all turns have no tools. This is not independent scientific replication or an OpenRouter server-side request. Inspect the same operation; never substitute or repeat an unknown component.',parameters:NativeFusionSchema}]:[])], mcp: await nativeMcpCatalog(paths),review:{settings:readWatchdogSettings(paths),instructions} };
      }
      // Only Main owns this separate token and has checked the exact native binding before dispatch.
      if (typeof body.sessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(body.sessionId) || !owner.current()) return reply.code(403).send({ detail: "RESEARCH_CONTEXT_REVOKED" });
      const context = { projectId: currentProjectId(), sessionRef: body.sessionId };
      const paths = resolvePaths(context.projectId); assertResearchPath(paths.notebookDir);
      const current = () => { if (!owner.current()) throw Error("RESEARCH_CONTEXT_REVOKED"); assertResearchPath(paths.notebookDir); };
      if(req.params.operation==='advanced'){
        const record=body.record as {name?:unknown;arguments?:unknown;callerSessionId?:unknown}|null;
        if(!record||Object.keys(record).some(key=>!['name','arguments','callerSessionId'].includes(key))||![2,3].includes(Object.keys(record).length)||record.callerSessionId!==undefined&&(typeof record.callerSessionId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(record.callerSessionId)))return reply.code(422).send({detail:'RESEARCH_ADVANCED_UNAVAILABLE'});
        const caller=typeof record.callerSessionId==='string'?record.callerSessionId:context.sessionRef;
        if(record.name==='scientific_result'){if(!Check(ScientificResultParams,record.arguments))return reply.code(400).send({detail:'RESEARCH_SCIENTIFIC_RESULT_INVALID'});const result=executeScientificResult(context.projectId,body.toolCallId,record.arguments as ScientificResultParamsT);current();return result;}
        if(record.name==='research_provenance'&&owner.provenance){const result=await owner.provenance.command(context,record.arguments);current();return result;}
        if(record.name==='research_workflow'&&owner.workflows){const result=await owner.workflows.invoke(context.projectId,context.sessionRef,body.toolCallId,record.arguments,caller);current();return result;}
        if(record.name==='research_schedule'&&owner.schedules){if(caller!==context.sessionRef)throw Error('RESEARCH_SCHEDULE_OWNER_DENIED');const result=await owner.schedules.invoke(context.projectId,context.sessionRef,body.toolCallId,record.arguments);current();return result;}
        if(record.name==='research_mission'&&owner.missions){const result=await owner.missions.invoke(context.projectId,context.sessionRef,body.toolCallId,record.arguments);current();return result;}
        if(!owner.advanced||!['research_specialist','research_fusion'].includes(record.name as string))return reply.code(422).send({detail:'RESEARCH_ADVANCED_UNAVAILABLE'});
        const result=record.name==='research_specialist'?await owner.advanced.forCaller(context.sessionRef,caller).specialist(context.projectId,caller,body.toolCallId,record.arguments):await owner.advanced.fusion(context.projectId,context.sessionRef,body.toolCallId,record.arguments);current();return result;
      }
      if(req.params.operation==='services'){
        if(!owner.services)return reply.code(503).send({detail:'RESEARCH_SERVICE_UNAVAILABLE'});
        const controller=new AbortController(),close=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.once('close',close);
        try{return await owner.services.invoke(context.projectId,context.sessionRef,body.toolCallId,body.record,controller.signal);}finally{reply.raw.removeListener('close',close);}
      }
      if (req.params.operation === "notebook") {
        if (!Check(NotebookParams, body.record)) return reply.code(400).send({ detail: "RESEARCH_NOTEBOOK_INPUT_INVALID" });
        return executeNotebookRecord(context.projectId, () => context.sessionRef, body.toolCallId, body.record, current);
      }
      if (req.params.operation === "memory") return executeMemoryRecall(context.projectId, body.record);
      if (req.params.operation === "pdf-annotations") {
        const record = body.record as { name?: unknown; arguments?: unknown } | null;
        if (!record || Object.keys(record).length !== 2) return reply.code(400).send({ detail: "RESEARCH_PDF_INPUT_INVALID" });
        let value: unknown;
        current(); assertResearchPath(paths.sandbox);
        if (record.name === "add_pdf_annotation" && Check(AddPdfAnnotationParams, record.arguments)) value = await addPdfAnnotation(paths.sandbox, record.arguments, { kind: "expert", id: context.sessionRef, label: "StudyBuddy" }, current);
        else if (record.name === "list_pdf_annotations" && Check(ListPdfAnnotationsParams, record.arguments)) value = listPdfAnnotations(paths.sandbox, record.arguments);
        else if (record.name === "remove_pdf_annotation" && Check(RemovePdfAnnotationParams, record.arguments)) value = await removePdfAnnotation(paths.sandbox, record.arguments, current);
        else return reply.code(400).send({ detail: "RESEARCH_PDF_INPUT_INVALID" });
        current(); return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
      }
      if (req.params.operation === "guard") {
        const record = body.record as { name?: unknown; path?: unknown; command?: unknown } | null;
        if (!record || typeof record.name !== "string") return reply.code(400).send({ detail: "RESEARCH_GUARD_INPUT_INVALID" });
        const policy = readGuardPolicy(paths.sandbox), options = { sandboxRoot: paths.sandbox, protectedGlobs: [...policy.protectedPaths,'.kady/native-budget.json','.kady/provenance/**','.kady/environments/**','.kady/native-provenance/**','.kady/native-events/**','.kady/native-workflows/**','.kady/native-workflow-host/**','.kady/native-specialists/**','.kady/native-goals/**','.kady/native-schedule-intents/**','.studybuddy/native-advanced/**','.studybuddy/native-goals/**','.studybuddy/native-schedules/**'] };
        if (typeof record.path === "string") return { verdict: classifyFilePath(record.path, options), destructiveConfirm: policy.destructiveConfirm };
        if (typeof record.command === "string") return { verdict: classifyBashCommand(record.command, options), destructiveConfirm: policy.destructiveConfirm };
        return { verdict: { kind: "allow" }, destructiveConfirm: policy.destructiveConfirm };
      }
      return reply.code(404).send({ detail: "RESEARCH_TOOL_NOT_REGISTERED" });
    });
  });
}
