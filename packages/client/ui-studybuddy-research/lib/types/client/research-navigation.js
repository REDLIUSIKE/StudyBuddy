/** Observe transitions rather than geometry, so a manual expansion remains possible. */
export function observeResearchActivation(source, onEnter) {
    let active = false;
    const update = () => {
        const next = source.getSnapshot().activePanelId === 'studybuddy.research';
        const entered = next && !active;
        active = next;
        if (entered)
            onEnter();
    };
    const stop = source.subscribe(update);
    update();
    return stop;
}
//# sourceMappingURL=research-navigation.js.map