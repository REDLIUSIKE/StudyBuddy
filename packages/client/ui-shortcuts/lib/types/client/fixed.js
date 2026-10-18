/**
 * Describe shared menu actions for display and conflict checking.
 * @param t - shortcut dictionary.
 * @returns read-only actions and each physical combination they occupy.
 */
export function fixedCommands(t) {
    const rows = [
        { id: 'move', keys: ['↑', '↓'], bindings: [{ code: 'ArrowUp', modifiers: [] }, { code: 'ArrowDown', modifiers: [] }], group: 'menus' },
        { id: 'select', keys: ['Enter'], bindings: [{ code: 'Enter', modifiers: [] }], group: 'menus' },
        { id: 'dismiss', keys: ['Esc'], bindings: [{ code: 'Escape', modifiers: [] }], group: 'menus' },
    ];
    return rows.map(row => ({ ...row, id: `fixed.${row.id}`, label: () => t(row.id) }));
}
//# sourceMappingURL=fixed.js.map