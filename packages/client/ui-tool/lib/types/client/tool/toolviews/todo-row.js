import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { registerTodoHistory } from "../models/todo-history.js";
import { todoDiffModel } from "../models/todo-diff-model.js";
import { toolRowModel } from "../models/tool-call-model.js";
import { ToolRow } from "../components/ToolRow.js";
import { CONVERSATION_NS as NS } from "../../locale.js";
import { planSummary } from "./plan-summary.js";
function isItem(value) {
    return typeof value === 'object' && value !== null;
}
function summarize(argsRaw, t) {
    if (argsRaw === null)
        return null;
    let parsed;
    try {
        parsed = JSON.parse(argsRaw);
    }
    catch {
        // Mid-stream truncation or malformed model JSON: fall back to the generic summary.
        return null;
    }
    // Valid JSON with invalid todo fields (null root, non-array todos, null items —
    // a rejected tool/call retains such args verbatim): same generic fallback.
    if (typeof parsed !== 'object' || parsed === null)
        return null;
    const todos = parsed.todos;
    if (!Array.isArray(todos) || !todos.every(isItem))
        return null;
    const { done, total, activeContent, activeExtra } = planSummary(todos);
    const head = t('todo.completed', { done, total });
    return {
        text: activeContent === null ? head : `${head} · ${activeContent}`,
        extra: activeExtra,
    };
}
/** Summarizes a plan update without presenting a cancelled call as completed. */
export function TodoRow({ toolName, block, inspect, useDisclosure, useTodoHistory, useSession, t }) {
    const baseline = useTodoHistory(snapshot => snapshot?.get(block.callId));
    const hasMore = useSession(snapshot => snapshot.hasMore);
    const diff = useMemo(() => todoDiffModel(block, baseline, hasMore, t), [block, baseline, hasMore, t]);
    const model = toolRowModel(toolName, block);
    const summary = summarize(model.bodyRaw, t) ?? { text: model.summary, extra: 0 };
    return (_jsx(ToolRow, { useDisclosure: useDisclosure, t: t, variant: model.variant, toolName: toolName, icon: _jsx(IconChecklistOutlineRegular, {}), title: t(model.titleKey), summary: summary.text, summarySuffix: [diff?.summary, summary.extra > 0 ? `+${summary.extra}` : null]
            .filter((part) => part !== null && part !== undefined).join(' · ') || null, bodyRaw: model.bodyRaw, output: model.output, details: diff?.details, errorSummary: model.errorSummary, state: model.state, inspect: inspect }));
}
/** Registers the todo conversation row. */
export const todoToolview = {
    name: 'todo-toolview',
    inject: ['slots', 'uiConversation'],
    apply(ctx) {
        registerTodoHistory(ctx);
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
            name: 'tool.call.toolview', key: 'todo_write', locale: NS,
            inject: (sessionId) => ({
                hooks: { todoHistory: ctx.uiConversation.binding(sessionId).target('tool-todo-history') },
            }),
        }, TodoRow));
    },
};
//# sourceMappingURL=todo-row.js.map