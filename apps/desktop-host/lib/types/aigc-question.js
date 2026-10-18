import { z } from 'zod';
const field = z.object({ field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/), title: z.string().max(200),
    type: z.enum(['input', 'textarea', 'radio', 'checkbox', 'select', 'inputNumber', 'switch']), required: z.boolean().optional(),
    options: z.array(z.string().max(300)).max(20).optional(), placeholder: z.string().max(300).optional() });
const question = z.strictObject({ title: z.string().max(100), question: z.string().min(1).max(4000), options: z.array(z.string().max(300)).max(8).optional(), fields: z.array(field).max(12).optional() });
export async function askAigcQuestion(ctx, agent, value, signal) {
    const input = question.parse(value);
    const fields = input.fields?.length ? input.fields : [{ field: 'answer', title: input.question, type: 'input', ...(input.options ? { options: input.options } : {}) }];
    const result = await ctx.userQuestions.ask({ agent, signal, questions: fields.map(item => ({ id: item.field, header: input.title,
            question: item.title, ...(input.fields?.length ? { detail: input.question } : {}), ...(item.placeholder ? { detail: input.question + '\n' + item.placeholder } : {}),
            ...(item.type === 'switch' ? { options: [{ label: '是' }, { label: '否' }] } : item.options ? { options: item.options.map(label => ({ label })) } : {}),
            ...(item.type === 'checkbox' ? { multiSelect: true } : {}) })) });
    if (!result.answers.some(answer => answer.custom?.trim() || answer.selected.length))
        return { answer: '', ...(input.fields?.length ? { values: {} } : {}), skipped: true };
    const values = {};
    for (const item of fields) {
        const answer = result.answers.find(row => row.id === item.field);
        const text = answer?.custom ?? answer?.selected.join(', ') ?? '';
        if (!text && item.required)
            throw Error('AIGC_ANSWER_REQUIRED');
        if (!text && !item.required && (item.type === 'inputNumber' || item.type === 'switch'))
            continue;
        if (item.type === 'inputNumber') {
            if (!text || !Number.isFinite(Number(text)))
                throw Error('AIGC_ANSWER_INVALID');
            values[item.field] = Number(text);
        }
        else if (item.type === 'switch') {
            if (!['是', '否'].includes(text))
                throw Error('AIGC_ANSWER_INVALID');
            values[item.field] = text === '是';
        }
        else
            values[item.field] = item.type === 'checkbox' ? [...answer?.selected ?? [], ...(answer?.custom ? [answer.custom] : [])] : text;
    }
    return { answer: input.fields?.length ? JSON.stringify(values) : values.answer ?? '', ...(input.fields?.length ? { values } : {}),
        ...(!result.answers.some(answer => answer.custom || answer.selected.length) ? { skipped: true } : {}) };
}
//# sourceMappingURL=aigc-question.js.map