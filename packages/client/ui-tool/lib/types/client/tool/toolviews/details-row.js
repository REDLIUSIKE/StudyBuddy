import { jsx as _jsx } from "react/jsx-runtime";
/** Keyed recorded-result rows sharing the compact detail body. */
import { useMemo } from 'react';
import { IconAgentPresetOutlineRegular, IconBranchOutlineRegular, IconChecklistOutlineRegular, IconClockOutlineRegular, IconCodeOutlineRegular, IconCordisPluginOutlineRegular, IconGoalOutlineRegular, IconSearchOutlineRegular, IconUsersOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { CONVERSATION_NS as NS } from "../../locale.js";
import { ToolRow } from "../components/ToolRow.js";
import { detailsCardModel } from "../models/details-card-model.js";
import { parsedToolCall } from "../models/raw-tool-call.js";
import { toolRowModel } from "../models/tool-call-model.js";
const LSP_TITLE_KEYS = {
    goToDefinition: 'tool.title.findDefinition',
    findReferences: 'tool.title.findReferences',
    goToImplementation: 'tool.title.findImplementation',
    hover: 'tool.title.hoverSymbol',
};
/** Teammate-coordination tools presented with the two-person team icon. */
const TEAMMATE_TOOLS = new Set(['spawn_teammate', 'list_agents', 'send_message', 'interrupt_agent', 'wait_agent']);
function detailIcon(toolName) {
    if (TEAMMATE_TOOLS.has(toolName))
        return _jsx(IconUsersOutlineRegular, { size: 14 });
    if (toolName.startsWith('schedule_'))
        return _jsx(IconClockOutlineRegular, { size: 14 });
    if (toolName.endsWith('_goal'))
        return _jsx(IconGoalOutlineRegular, { size: 14 });
    if (toolName.startsWith('cordis_'))
        return _jsx(IconCordisPluginOutlineRegular, {});
    if (toolName.startsWith('terminal_'))
        return _jsx(IconCodeOutlineRegular, { size: 14 });
    if (toolName.startsWith('session_') || toolName === 'lsp')
        return _jsx(IconSearchOutlineRegular, { size: 14 });
    if (toolName.startsWith('job_') || toolName.startsWith('team_task_'))
        return _jsx(IconChecklistOutlineRegular, {});
    if (toolName === 'workflow' || toolName === 'ralph')
        return _jsx(IconBranchOutlineRegular, { size: 14 });
    return _jsx(IconAgentPresetOutlineRegular, { size: 14 });
}
/**
 * Present recorded entities, receipts, and report fields in the existing expandable row.
 * @param props - Tool call, row actions, and locale supplied by the keyed slot.
 * @returns A Tool row with structured details or generic input/output.
 */
export function DetailsRow({ toolName, block, cwd, home, openFile, inspect, useDisclosure, t }) {
    const model = toolRowModel(toolName, block, cwd, home);
    const locale = document.documentElement.lang;
    const details = useMemo(() => detailsCardModel(block, t, locale), [block, t, locale]);
    const operation = toolName === 'lsp' ? parsedToolCall(block)?.args.operation : undefined;
    const titleKey = typeof operation === 'string' && Object.hasOwn(LSP_TITLE_KEYS, operation)
        ? LSP_TITLE_KEYS[operation]
        : model.titleKey;
    return (_jsx(ToolRow, { useDisclosure: useDisclosure, t: t, variant: model.variant, toolName: toolName, icon: detailIcon(toolName), title: t(titleKey), summary: details?.summary ?? details?.items[0]?.title ?? details?.empty ?? model.summary, details: details, bodyRaw: model.bodyRaw, output: model.output, errorSummary: model.errorSummary, state: model.state, inspect: inspect, onOpenFile: openFile }));
}
/** Register recorded-result details through the standard atomic Tool slot. */
export const detailsToolview = {
    name: 'details-toolview',
    inject: ['slots'],
    apply(ctx) {
        ctx.slots.inject('tool.call.toolview', function* () {
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'create_goal', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'get_goal', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'update_goal', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_create', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_list', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_delete', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_update', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'cordis_inspect_list', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'cordis_inspect_query', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'cordis_inspect_self', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'workflow', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'ralph', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_event_read', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_event_search', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_event_trace', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_search', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_trace', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'list_subagent_models', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'subagent', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'list_agents', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'send_message', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'interrupt_agent', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'job_list', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'job_output', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'job_kill', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_open', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_read', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_list', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_signal', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_close', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'lsp', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'spawn_teammate', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_create', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_get', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_update', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_list', locale: NS }, DetailsRow);
            yield ctx.slots.register({ name: 'tool.call.toolview', key: 'wait_agent', locale: NS }, DetailsRow);
        });
    },
};
//# sourceMappingURL=details-row.js.map