import { z } from 'zod';
const text = z.string().min(1).max(512), uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const Scope = z.strictObject({ accountGeneration: text, workspaceId: text, projectId: text, sessionId: text });
const Invocation = z.strictObject({ rpcId: uuid, hostGeneration: uuid, scope: Scope, operation: z.enum(['readProject', 'readGuide', 'readFile', 'applyEdit', 'look', 'transcribe', 'translate', 'createExport', 'cancelExport', 'readExports', 'mediaChoices', 'mediaRequest']), toolCallId: text, input: z.unknown() });
const Capability = z.strictObject({ scope: Scope, caller: z.strictObject({ schemaVersion: z.literal(1), grantRef: uuid, sessionId: text, toolCallId: text }).optional(), requestId: uuid, operation: z.enum(['catalog', 'voice', 'tts', 'sfx', 'music', 'asr', 'image-search', 'image', 'video', 'web-search', 'web-fetch', 'translate', 'custom-service', 'session-export', 'project-release']), authorityRef: text.optional(), input: z.unknown() });
/** Closed private Host-to-Main video invocation; no public renderer entry. */
export function parseVideoToolInvocation(value) {
    const parsed = Invocation.safeParse(value);
    if (!parsed.success || (JSON.stringify(parsed.data.input)?.length ?? 0) > 1024 * 1024)
        throw Error('VIDEO_INVOCATION_INVALID');
    return parsed.data;
}
/** Validate every private domain request before Main dispatches a native capability. */
export function parseVideoCapabilityRequest(value) {
    const parsed = Capability.safeParse(value);
    if (!parsed.success || (JSON.stringify(parsed.data.input)?.length ?? 0) > 1024 * 1024)
        throw Error('VIDEO_CAPABILITY_INVALID');
    const { authorityRef, caller, ...request } = parsed.data;
    return { ...request, ...(authorityRef !== undefined ? { authorityRef } : {}), ...(caller !== undefined ? { caller } : {}) };
}
/** Native domain reports only completed same-parent project renames over private stdio. */
export function parseVideoProjectRelocated(value) {
    const parsed = z.strictObject({ type: z.literal('project-relocated'), id: uuid, accountGeneration: text, event: z.strictObject({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), from: z.string().min(1).max(4096), to: z.string().min(1).max(4096) }) }).safeParse(value);
    if (!parsed.success)
        throw Error('VIDEO_PATH_ADMISSION_INVALID');
    return parsed.data;
}
//# sourceMappingURL=video-wire.js.map