import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Root/subcall Tool composition with one keyed atomic dispatch path. */
import { memo, useMemo } from 'react';
import { toolRowModel } from "./models/tool-call-model.js";
import { GenericToolCard } from "./toolviews/GenericToolCard.js";
import css from './ToolCallTree.module.css';
function toolCallPhase(block) {
    if ('kind' in block)
        return { phase: 'result', block };
    return block.phase === 'preparing' ? { phase: 'preparing', block } : { phase: 'start', block };
}
/** Resolve a Tool call's wire name from its current stage. */
function callName(call) {
    return call.phase === 'result' ? call.block.call?.name ?? '' : call.block.name;
}
/** One atomic call dispatched through the Tool-owned keyed slot. */
const ToolCall = memo(function ToolCall({ renderSlot, callId, toolName, call, openFile, cwd, home, inspectCall, loadImage, useDisclosure, t, children, }) {
    const owner = useMemo(() => ({
        callId,
        toolName,
        ...call,
        openFile,
        cwd,
        home,
        loadImage,
        useDisclosure,
        inspect: inspectCall === undefined ? undefined : () => { inspectCall(callId); },
    }), [callId, toolName, call, openFile, cwd, home, loadImage, inspectCall, useDisclosure]);
    const autoReviewDenied = useMemo(() => call.phase === 'result' && toolRowModel(toolName, call.block).autoReviewDenial !== null, [toolName, call]);
    return (_jsxs("div", { className: css.callRow, "data-chat-anchor-key": `call:${callId}`, "data-chat-call-id": callId, children: [autoReviewDenied
                ? _jsx(GenericToolCard, { ...owner, t: t })
                : renderSlot('tool.call.toolview', owner, {
                    entryKey: toolName,
                    fallback: _jsx(GenericToolCard, { ...owner, t: t }),
                }), children] }));
});
const ToolCallBranch = memo(function ToolCallBranch({ renderSlot, block, cwd, home, openFile, inspectCall, loadImage, useDisclosure, t, }) {
    const call = useMemo(() => toolCallPhase(block), [block]);
    return (_jsx(ToolCall, { renderSlot: renderSlot, callId: call.block.callId, toolName: callName(call), call: call, openFile: openFile, cwd: cwd, home: home, inspectCall: inspectCall, useDisclosure: useDisclosure, loadImage: loadImage, t: t, children: call.phase !== 'preparing' && call.block.subCalls.length > 0 ? (_jsx("div", { className: css.subCalls, "data-subcalls": true, children: call.block.subCalls.map(child => (_jsx(ToolCallBranch, { renderSlot: renderSlot, block: child, cwd: cwd, home: home, openFile: openFile, inspectCall: inspectCall, useDisclosure: useDisclosure, loadImage: loadImage, t: t }, child.callId))) })) : null }));
});
/**
 * Render one root Tool call and its recursive children through the same
 * atomic keyed dispatch.
 * @param props - whole-Tool owner data and the Tool-owned child-slot share.
 * @returns the Tool call tree.
 */
export function ToolCallTree({ renderSlot, node, cwd, openFile, inspectCall, loadImage, useDisclosure, useHostInfo, t, }) {
    const home = useHostInfo(info => info.home);
    return (_jsx(ToolCallBranch, { renderSlot: renderSlot, block: node.data.root, cwd: cwd, home: home, openFile: openFile, inspectCall: inspectCall, useDisclosure: useDisclosure, loadImage: loadImage, t: t }));
}
//# sourceMappingURL=ToolCallTree.js.map