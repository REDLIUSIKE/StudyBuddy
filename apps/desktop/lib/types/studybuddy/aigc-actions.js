/** Sandboxed AIGC page inputs carry intentions and rectangles, never native authority. */
import { z } from 'zod';
const directory = z.string().min(1).max(4096), sessionId = z.string().regex(/^session-[a-f0-9-]{36}$/);
export const aigcSubmit = z.strictObject({ kind: z.literal('submit').optional(), directory, sessionId, requestId: z.uuid(), prompt: z.string().max(100000),
    providerId: z.string().min(1).max(512), modelId: z.string().min(1).max(512), reasoningEffort: z.string().max(64).optional(),
    attachments: z.array(z.strictObject({ name: z.string().max(256), path: z.string().min(1).max(4096), mimeType: z.string().max(128) })).max(20) });
const rect = z.strictObject({ x: z.number().finite().min(0).max(16384), y: z.number().finite().min(0).max(16384), width: z.number().finite().min(0).max(16384), height: z.number().finite().min(0).max(16384) });
const reference = z.strictObject({ id: z.uuid(), label: z.string().max(500), dataType: z.string().max(64), value: z.json(), source: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('asset'), path: z.string().max(4096) }),
        z.strictObject({ kind: z.literal('canvas'), canvasId: z.string().max(4096), canvasName: z.string().max(255), nodeId: z.string().max(256), nodeName: z.string().max(500), outputId: z.string().max(256), outputName: z.string().max(500) }),
    ]) });
const action = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('prepare-canvas'), directory, controllerRef: z.uuid() }),
    aigcSubmit.extend({ kind: z.literal('submit') }),
    z.strictObject({ kind: z.literal('open'), directory }), z.strictObject({ kind: z.literal('new'), directory }),
    z.strictObject({ kind: z.literal('select'), directory, sessionId }), z.strictObject({ kind: z.literal('close'), directory, sessionId }),
    z.strictObject({ kind: z.literal('rename'), directory, sessionId, name: z.string().trim().min(1).max(200) }),
    z.strictObject({ kind: z.literal('project-title'), directory, name: z.string().trim().min(1).max(200) }),
    z.strictObject({ kind: z.literal('records'), directory, sessionId }),
    z.strictObject({ kind: z.literal('reference'), directory, sessionId, references: z.array(reference).min(1).max(32) }),
    z.strictObject({ kind: z.literal('list'), directory }), z.strictObject({ kind: z.literal('archive'), directory, file: z.string().max(210).optional() }),
    z.strictObject({ kind: z.literal('continue'), directory, file: z.string().max(210) }),
    z.strictObject({ kind: z.literal('surface'), directory, visible: z.boolean(), rect }),
    z.strictObject({ kind: z.literal('hide') }),
]);
export const parseAigcPageAction = (value) => action.parse(value);
//# sourceMappingURL=aigc-actions.js.map