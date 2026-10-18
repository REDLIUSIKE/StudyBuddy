import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Read the question and answer pairs out of the reply text at the conversation boundary.
 * @param text - Model-facing JSON payload of the steered message.
 * @returns The pairs, or empty lists when the payload is unreadable.
 */
export function replyPairsOf(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch (error) {
        // A reply whose text is not JSON renders as its raw text.
        void error;
        return { questions: [], answers: [] };
    }
    if (!isRecord(value) || !Array.isArray(value.questions)) {
        return { questions: [], answers: [] };
    }
    const questions = [];
    for (const question of value.questions) {
        if (!isRecord(question) || typeof question.id !== 'string' || typeof question.question !== 'string')
            continue;
        questions.push({
            id: question.id,
            question: question.question,
            ...(typeof question.detail === 'string' ? { detail: question.detail } : {}),
            ...(typeof question.header === 'string' ? { header: question.header } : {}),
            ...(Array.isArray(question.options)
                ? { options: question.options.flatMap((option) => {
                        if (!isRecord(option) || typeof option.label !== 'string')
                            return [];
                        return [{ label: option.label, ...(typeof option.description === 'string' ? { description: option.description } : {}) }];
                    }) }
                : {}),
            ...(typeof question.multiSelect === 'boolean' ? { multiSelect: question.multiSelect } : {}),
        });
    }
    const answers = [];
    for (const answer of Array.isArray(value.answers) ? value.answers : []) {
        if (!isRecord(answer) || typeof answer.id !== 'string' || !Array.isArray(answer.selected))
            continue;
        answers.push({
            id: answer.id,
            selected: answer.selected.filter((item) => typeof item === 'string'),
            ...(typeof answer.custom === 'string' ? { custom: answer.custom } : {}),
        });
    }
    return { questions, answers };
}
/**
 * Answer values of one question in display order: the selected option labels
 * followed by a non-blank custom answer.
 * @param data - Projected reply holding the recorded answers.
 * @param id - Question id to read.
 * @returns The values, empty when the user skipped that question.
 */
export function replyAnswerValues(data, id) {
    const answer = data.answers.find(item => item.id === id);
    const custom = answer?.custom?.trim() ?? '';
    return [...(answer?.selected ?? []), ...(custom === '' ? [] : [custom])];
}
/**
 * Clipboard text of one late reply: every question with the answer the user
 * gave, in the layout the open bubble shows, without the options nobody chose.
 * The text does not depend on whether the bubble is open.
 * @param data - Projected reply to copy.
 * @param t - Bound `question` namespace translator owning the answer labels.
 * @returns One block per question, or the model-facing text when the payload was unreadable.
 */
export function replyClipboardText(data, t) {
    if (data.questions.length === 0)
        return data.text;
    return data.questions.map((question) => {
        const values = replyAnswerValues(data, question.id);
        const heading = question.header && question.header !== question.question
            ? `${question.header} — ${question.question}`
            : question.question;
        const answer = values.length === 0
            ? t('reply.skipped')
            : `${t('reply.answerLabel')}${values.join(', ')}`;
        return `${heading}\n${answer}`;
    }).join('\n\n');
}
/** Validate a late reply source at the persisted conversation boundary. */
function replySource(event) {
    const source = event.data.source;
    return isRecord(source) && source.kind === 'user-question-reply'
        && typeof source.callId === 'string' && source.outcome === 'answered'
        ? { callId: source.callId, outcome: 'answered' }
        : null;
}
/** Late-reply projection owned by the questions UI. */
export const questionReplyDefinition = {
    kind: 'user-question-reply',
    target: 'chat',
    match: (event) => {
        if (event.type !== 'user/message' || !isAppendSurfaceEvent(event))
            return null;
        return replySource(event) === null ? null : { id: String(event.data.id), role: 'start' };
    },
    start: (_context, match) => {
        if (match.event.type !== 'user/message')
            throw new Error('user-question-reply start requires user/message');
        const event = match.event;
        const block = event.data.content.find(item => item.type === 'text');
        const text = block?.text ?? '';
        const source = replySource(event);
        if (source === null)
            throw new Error('user-question-reply start requires a reply source');
        return {
            seq: event.seq,
            time: event.time,
            callId: source.callId,
            outcome: source.outcome,
            text,
            ...replyPairsOf(text),
        };
    },
    update: context => context.state,
    buildViewNode: (context) => {
        if (context.state === undefined)
            return null;
        const { seq, ...data } = context.state;
        return {
            key: context.key,
            kind: 'question-reply',
            id: context.id,
            target: 'chat',
            anchorSeq: seq,
            location: context.start?.location ?? { kind: 'unresolved' },
            visibility: 'visible',
            data,
        };
    },
};
//# sourceMappingURL=question-reply.js.map