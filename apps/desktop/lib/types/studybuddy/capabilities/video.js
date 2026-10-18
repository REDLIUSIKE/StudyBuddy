import { extname, join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { parseHarnessCapabilityResultV1 } from '@studybuddy/contracts';
import { accountVideoDirectory } from "../video-runtime.js";
import { videoCapabilityTools, VIDEO_CAPABILITY_REVISION } from '../../../../../../integrations/openfilm/packages/openfilm/studio/server/embedded/tool-descriptors.mjs';
import { assertVideoPath } from "../video-path.js";
import { readCapabilityFile } from "./assets.js";
const json = (data) => parseHarnessCapabilityResultV1({ data, artifacts: [], operationRef: null });
const record = (value) => { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('VIDEO_RESPONSE_INVALID'); return value; };
const owner = (caller, projectRef) => JSON.stringify([caller.scope, caller.hostGeneration, caller.workspaceId ?? caller.callerSessionId, projectRef]);
/** Video domain adapter: only domain operations, with the original native caller carried separately. */
export class VideoCapabilityPort {
    options;
    id = 'video';
    revision = VIDEO_CAPABILITY_REVISION;
    created = new Set();
    constructor(options) {
        this.options = options;
    }
    async describe() { return { id: this.id, revision: this.revision, label: '剪视频', artifactSchemas: { 'media-v1': { type: 'object', properties: { moduleId: { type: 'string', const: this.id } }, required: ['moduleId'], additionalProperties: true } } }; }
    async admitted(caller, ref) {
        if (!this.created.has(owner(caller, ref)) && !this.options.bridge.isEditorOwner(caller, ref) && !await this.options.associated(caller, { moduleId: this.id, projectRef: ref }))
            throw Error('CAPABILITY_PROJECT_NOT_AUTHORIZED');
    }
    async list(caller, signal) {
        const data = record(await this.options.runtime.command(caller.scope, 'capabilityProjects', { input: { action: 'list' } }, signal));
        if (!Array.isArray(data.projects))
            throw Error('VIDEO_RESPONSE_INVALID');
        const projects = [];
        for (const value of data.projects) {
            const row = record(value);
            if (typeof row.id !== 'string' || typeof row.name !== 'string')
                throw Error('VIDEO_RESPONSE_INVALID');
            try {
                await this.admitted(caller, row.id);
            }
            catch (error) {
                if (error instanceof Error && error.message === 'CAPABILITY_PROJECT_NOT_AUTHORIZED')
                    continue;
                throw error;
            }
            projects.push({ target: { moduleId: this.id, projectRef: row.id }, title: row.name });
        }
        return projects;
    }
    async create(caller, title, signal) {
        const row = record(await this.options.runtime.command(caller.scope, 'capabilityProjects', { input: { action: 'create', title } }, signal));
        signal.throwIfAborted();
        if (typeof row.id !== 'string' || typeof row.name !== 'string')
            throw Error('VIDEO_RESPONSE_INVALID');
        this.created.add(owner(caller, row.id));
        await this.options.bridge.retainTask(caller, row.id);
        return { target: { moduleId: this.id, projectRef: row.id }, title: row.name };
    }
    async resolve(caller, ref, signal) {
        await this.admitted(caller, ref);
        signal.throwIfAborted();
        await this.options.bridge.retainTask(caller, ref);
        const row = record(await this.options.runtime.command(caller.scope, 'projectInfo', { projectId: ref }, signal));
        if (row.id !== ref || typeof row.name !== 'string')
            throw Error('VIDEO_RESPONSE_INVALID');
        return { target: { moduleId: this.id, projectRef: ref }, title: row.name };
    }
    async tools(caller, target) { await this.admitted(caller, target.projectRef); return videoCapabilityTools.map(tool => ({ ...tool, inputValidation: 'domain' })); }
    async execute(caller, target, tool, args, signal) {
        await this.admitted(caller, target.projectRef);
        const descriptor = videoCapabilityTools.find(row => row.name === tool);
        if (!descriptor || validateJsonSchemaValue(descriptor.parameters, args).length)
            throw Error('VIDEO_TOOL_ARGUMENTS_INVALID');
        let admittedArgs = args;
        if (tool === 'createExport') {
            if (!this.options.userDataRoot || !args || typeof args !== 'object' || Array.isArray(args) || 'folder' in args)
                throw Error('VIDEO_EXPORT_PATH_NOT_ADMITTED');
            const binding = await this.options.bridge.retainTask(caller, target.projectRef), folder = join(accountVideoDirectory(this.options.userDataRoot, caller.scope.accountId), 'capability-exports');
            await assertVideoPath(folder);
            await mkdir(folder, { recursive: true });
            await assertVideoPath(folder);
            const admitted = await this.options.runtime.admitPaths(caller.scope, { kind: 'export', scope: binding.scope, paths: [folder] });
            if (admitted.length !== 1 || typeof admitted[0] !== 'string')
                throw Error('VIDEO_PATH_ADMISSION_INVALID');
            signal.throwIfAborted();
            admittedArgs = { ...args, folder: admitted[0] };
        }
        const data = await this.options.bridge.invokeCapability(caller, target.projectRef, tool, admittedArgs, signal);
        const result = json(data), artifacts = [], previews = [];
        const row = data && typeof data === 'object' && !Array.isArray(data) ? record(data) : null;
        const binding = await this.options.bridge.retainTask(caller, target.projectRef);
        if (Array.isArray(row?.artifacts))
            for (const value of row.artifacts) {
                const artifact = record(value);
                if (typeof artifact.relativePath !== 'string' || typeof artifact.mime !== 'string' || typeof artifact.sha256 !== 'string')
                    throw Error('VIDEO_ARTIFACT_INVALID');
                const file = join(binding.projectRoot, artifact.relativePath);
                await assertVideoPath(file);
                // Domain paths are checked again in Main before registering a transferable reference.
                const produced = await this.options.artifact(caller, target, file, artifact.mime);
                if (produced.sha256 !== artifact.sha256)
                    throw Error('VIDEO_ARTIFACT_INVALID');
                artifacts.push(produced);
                if (tool === 'look' && produced.mime === 'image/png')
                    previews.push({ type: 'image', mimeType: 'image/png', data: (await readCapabilityFile(file, produced)).toString('base64') });
            }
        if (tool === 'readExports' && Array.isArray(row?.jobs))
            for (const value of row.jobs) {
                const job = record(value);
                if (job.status !== 'done')
                    continue;
                if (job.originSessionId !== caller.callerSessionId || typeof job.producingRevision !== 'string' || !Array.isArray(job.outputs))
                    throw Error('CAPABILITY_OPERATION_NOT_AUTHORIZED');
                for (const output of job.outputs) {
                    if (typeof output !== 'string')
                        throw Error('VIDEO_ARTIFACT_INVALID');
                    const mime = { '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.zip': 'application/zip', '.vtt': 'text/vtt' }[extname(output).toLowerCase()];
                    if (!mime)
                        throw Error('VIDEO_ARTIFACT_UNSUPPORTED');
                    artifacts.push(await this.options.artifact(caller, target, output, mime));
                }
            }
        return { ...result, ...(previews.length ? { data: { content: [{ type: 'text', text: JSON.stringify(data) }, ...previews], details: result.data } } : {}), artifacts, operationRef: tool === 'createExport' && typeof row?.jobId === 'string' ? 'video-export:' + row.jobId : null };
    }
    status(caller, target, ref, signal) { return this.execute(caller, target, 'readExports', { jobId: this.exportId(ref) }, signal); }
    cancel(caller, target, ref, signal) { return this.execute(caller, target, 'cancelExport', { jobId: this.exportId(ref) }, signal); }
    exportId(ref) { if (!/^video-export:[a-f0-9]{12}$/.test(ref))
        throw Error('CAPABILITY_OPERATION_INVALID'); return ref.slice('video-export:'.length); }
    async release(caller, target) { this.options.bridge.releaseTask(caller, target.projectRef); }
    async import(caller, target, source, bytes, signal) {
        await this.admitted(caller, target.projectRef);
        const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4', 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'text/vtt': '.vtt', 'text/plain': '.txt', 'application/json': '.json' }[source.mime];
        if (!extension || bytes.length > 100 * 1024 * 1024)
            throw Error('VIDEO_IMPORT_TRANSPORT_LIMIT');
        const binding = await this.options.bridge.retainTask(caller, target.projectRef);
        const relativeSource = '.film/capability-import/' + randomUUID() + '.tmp', temporary = join(binding.projectRoot, relativeSource);
        await assertVideoPath(temporary);
        await mkdir(join(binding.projectRoot, '.film/capability-import'), { recursive: true });
        await assertVideoPath(temporary);
        try {
            await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
            signal.throwIfAborted();
            await assertVideoPath(temporary);
            const data = record(await this.options.bridge.invokeCapability(caller, target.projectRef, 'importAsset', { name: source.artifactRef + extension, mime: source.mime, relativeSource, bytes: bytes.length, sha256: source.sha256 }, signal));
            if (typeof data.relativePath !== 'string' || data.sha256 !== source.sha256)
                throw Error('VIDEO_IMPORT_INVALID');
            return this.options.artifact(caller, target, join(binding.projectRoot, data.relativePath), source.mime);
        }
        finally {
            await assertVideoPath(temporary);
            await rm(temporary, { force: true });
        }
    }
}
//# sourceMappingURL=video.js.map