export function studyBuddyWorkspaceTransition(state, initialAccount, entered) {
    if (state.phase === 'authenticated' && state.account?.id !== initialAccount
        || state.phase === 'signed-out' && initialAccount !== undefined)
        return 'relaunch';
    if (initialAccount !== undefined && state.phase === 'error')
        return 'lock';
    if (initialAccount !== undefined && state.phase === 'authenticated' && !entered)
        return 'resume';
    return 'none';
}
//# sourceMappingURL=workspace-transition.js.map