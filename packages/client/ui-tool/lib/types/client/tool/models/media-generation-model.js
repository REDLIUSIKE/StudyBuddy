/** Keyless media references; every byte is fetched through the owned Host route. */
import { HARNESS_IMAGE_MODELS, HARNESS_VIDEO_MODEL } from '@studybuddy/contracts';
export function mediaTaskModel(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const r = value;
    if (r.schemaVersion !== 1 || typeof r.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.requestId) ||
        typeof r.sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(r.sessionId) ||
        !(r.kind === 'image' && HARNESS_IMAGE_MODELS.includes(r.modelId) || r.kind === 'video' && r.modelId === HARNESS_VIDEO_MODEL) ||
        !['queued', 'in_progress', 'completed', 'failed', 'unknown'].includes(String(r.state)) || typeof r.contentAvailable !== 'boolean')
        return null;
    return { schemaVersion: 1, requestId: r.requestId, sessionId: r.sessionId, kind: r.kind, modelId: r.modelId,
        state: r.state, contentAvailable: r.contentAvailable };
}
export function mediaTaskUrl(value, mode) {
    const q = new URLSearchParams({ sessionId: value.sessionId, requestId: value.requestId, kind: value.kind, mode });
    return '/api/studybuddy-media?' + q.toString();
}
//# sourceMappingURL=media-generation-model.js.map