import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Media toolview: persistent keyless task reference, owned live status and browser-native previews. */
import { useEffect, useState } from 'react';
import { MEDIA_NS } from "../../generated-images/locale.js";
import { mediaTaskModel, mediaTaskUrl } from "../models/media-generation-model.js";
import styles from './media-generation-row.module.css';
const titles = { generate_image: 'tool.image', generate_video: 'tool.video', generation_status: 'tool.status' };
const status = { queued: 'task.queued', in_progress: 'task.in_progress', completed: 'task.completed', failed: 'task.failed', unknown: 'task.unknown' };
/** Rendering does not place binary image/video content in the reasoning model's request. */
export function MediaGenerationRow(props) {
    const initial = props.phase === 'result' && !props.block.isError ? mediaTaskModel(props.block.meta) : null;
    const [live, setLive] = useState(initial), [error, setError] = useState();
    const key = initial ? initial.sessionId + ':' + initial.requestId + ':' + initial.kind : '';
    useEffect(() => {
        setLive(initial);
        setError(undefined);
        if (!initial)
            return;
        const controller = new AbortController();
        let timer;
        const query = async () => {
            try {
                const response = await fetch(mediaTaskUrl(initial, 'status'), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
                if (!response.ok)
                    throw Error('query');
                const next = mediaTaskModel(await response.json());
                if (!next || next.requestId !== initial.requestId || next.sessionId !== initial.sessionId || next.kind !== initial.kind || next.modelId !== initial.modelId)
                    throw Error('invalid');
                if (controller.signal.aborted)
                    return;
                setLive(next);
                setError(undefined);
                if (next.state === 'queued' || next.state === 'in_progress')
                    timer = setTimeout(() => { void query(); }, 3000);
            }
            catch {
                if (!controller.signal.aborted)
                    setError('task.queryFailed');
            }
        };
        void query();
        return () => { controller.abort(); if (timer)
            clearTimeout(timer); };
    }, [key]);
    const task = live ?? initial, title = titles[props.toolName] ?? 'tool.media', url = task ? mediaTaskUrl(task, 'content') : null;
    return _jsxs("div", { className: styles.root, "data-media-task": task?.requestId, children: [_jsxs("div", { className: styles.header, children: [_jsx("span", { children: props.t(title) }), _jsx("span", { className: styles.status, children: props.t(error ?? (task ? status[task.state] : props.phase === 'result' ? 'task.incomplete' : 'task.processing')) })] }), task && _jsx("div", { className: styles.model, children: task.modelId }), task?.state === 'completed' && task.contentAvailable && url && _jsxs("div", { className: styles.result, children: [task.kind === 'image' ? _jsx("img", { src: url, alt: props.t('image.alt'), loading: "lazy", onError: () => setError('image.loadFailed') }) : _jsx("video", { src: url, controls: true, preload: "metadata", onError: () => setError('video.loadFailed') }), _jsx("a", { href: url, download: true, children: props.t(task.kind === 'image' ? 'image.download' : 'video.download') })] })] });
}
export const mediaGenerationToolview = {
    name: 'studybuddy-media-toolview', inject: ['slots'],
    apply(ctx) {
        ctx.slots.inject('tool.call.toolview', () => {
            const disposers = ['generate_image', 'generate_video', 'generation_status'].map(key => ctx.slots.register({ name: 'tool.call.toolview', key, locale: MEDIA_NS }, MediaGenerationRow));
            return () => { for (const dispose of disposers)
                dispose(); };
        });
    }
};
//# sourceMappingURL=media-generation-row.js.map