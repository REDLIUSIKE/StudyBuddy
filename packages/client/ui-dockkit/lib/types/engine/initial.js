/**
 * Create an id source.
 * @param seed - number the first id counts from; defaults to 0.
 * @returns a minter producing `<prefix><n>` ids.
 */
export function createIdMinter(seed = 0) {
    let counter = seed;
    // The one place a string becomes an id: the prefix names the kind, the counter
    // keeps every id this minter hands out unique.
    const next = ((prefix) => {
        counter += 1;
        return `${prefix}${counter}`;
    });
    return { next };
}
/**
 * The state a surface starts in: collapsed, one docked pane, and whatever tab
 * `makeInitialTab` supplies.
 *
 * The first tab belongs to the initial state rather than to an operation, so
 * expanding and collapsing never accumulates copies of it.
 * @param minter - id source this surface's sequence will keep using.
 * @param makeInitialTab - builds the starting tab; omit for an empty pane.
 * @param mode - starting presentation; the embedder's product default.
 * @returns the collapsed single-pane starting state.
 */
export function createInitialState(minter, makeInitialTab, mode = 'push') {
    const paneId = minter.next('pane');
    const initial = makeInitialTab?.(minter.next('tab'));
    return {
        nodes: {
            [paneId]: {
                kind: 'pane',
                id: paneId,
                host: 'dock',
                tabs: initial === undefined ? [] : [initial.id],
                activeTabId: initial?.id,
                rect: undefined,
            },
        },
        tabs: initial === undefined ? {} : { [initial.id]: initial },
        rootId: paneId,
        floats: [],
        activePaneId: paneId,
        expanded: false,
        mode,
    };
}
//# sourceMappingURL=initial.js.map