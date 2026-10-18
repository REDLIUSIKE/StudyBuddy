/** DOM lookups owned by the experimental Inspector, using existing Slot and Chat attributes. */
/**
 * Check an existing element's mounted and ancestor visibility without revealing it.
 * @param element - Candidate element.
 * @returns Whether CSS and hidden ancestors allow it to be displayed.
 */
export function displayed(element) {
    if (!element.isConnected || element.closest('[hidden]') !== null)
        return false;
    for (let parent = element; parent !== null; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden')
            return false;
    }
    return true;
}
/**
 * Find the displayed main Chat's outer flow column without entering a Sidebar or nested View.
 * @returns The current Chat column, or undefined while another View is selected.
 */
export function mainChatRoot() {
    return [...document.querySelectorAll('[data-slot="main.conversation"] [data-slot="conversation.view"] [data-chat-flow]')]
        .find(element => element.closest('[data-sidebar-right-session], [data-step-process-body]') === null && displayed(element));
}
/**
 * Restrict a DOM match to the selected Chat column and its own Conversation View.
 * @param element - Candidate node, including SVG children.
 * @param root - Main Chat column.
 * @returns Whether the candidate belongs to that occurrence.
 */
export function inChat(element, root) {
    return root.contains(element) && element.closest('[data-sidebar-right-session]') === null
        && element.closest('[data-slot="conversation.view"]') === root.closest('[data-slot="conversation.view"]');
}
/**
 * Enumerate exact and approximate occurrences without changing their display state.
 * @param root - Current main Chat column.
 * @param targets - Exact identities followed by nearby loaded Node identities.
 * @returns Unique candidates, with the requested Turn's occurrences before other Turns.
 */
export function findChatTargets(root, targets) {
    const fields = ['chatCallId', 'chatNodeKey', 'chatGroupKey', 'chatTurn'];
    const indexed = {
        chatCallId: new Map(), chatNodeKey: new Map(),
        chatGroupKey: new Map(), chatTurn: new Map(),
    };
    for (const element of root.querySelectorAll('[data-chat-call-id], [data-chat-node-key], [data-chat-group-key], [data-chat-turn]')) {
        if (!inChat(element, root))
            continue;
        for (const field of fields) {
            const value = element.dataset[field];
            if (value === undefined)
                continue;
            const matches = indexed[field].get(value);
            if (matches === undefined)
                indexed[field].set(value, [element]);
            else
                matches.push(element);
        }
    }
    const found = new Set();
    const add = (field, value, part) => {
        if (value === undefined)
            return;
        for (const element of indexed[field].get(value) ?? []) {
            if (part === undefined || element.dataset.chatGroupPart === part)
                found.add(element);
        }
    };
    const turns = new Set();
    const preferredTurn = targets.find(target => target.turn !== undefined)?.turn;
    let preferredTurnAdded = false;
    for (const [index, target] of targets.entries()) {
        if (index > 0 && preferredTurn !== undefined && target.turn !== preferredTurn && !preferredTurnAdded) {
            add('chatTurn', String(preferredTurn));
            preferredTurnAdded = true;
        }
        add('chatCallId', target.callId);
        add('chatNodeKey', target.nodeKey, target.groupPart);
        add('chatNodeKey', target.nodeKey);
        add('chatCallId', target.rootCallId);
        add('chatGroupKey', target.groupKey);
        if (target.turn !== undefined)
            turns.add(target.turn);
    }
    for (const turn of turns) {
        if (!preferredTurnAdded || turn !== preferredTurn)
            add('chatTurn', String(turn));
    }
    return [...found];
}
//# sourceMappingURL=dom.js.map