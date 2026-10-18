/** Composition lifetime for local keyboard handlers, including a late closing keydown. */
/**
 * Observe composition until its closing key is released or consumed.
 * @param document - document whose input events belong to the caller.
 * @returns an event guard and a disposer for all listeners.
 */
export function observeComposition(document) {
    let composing = false;
    let ended = false;
    const start = () => { composing = true; };
    const end = () => { composing = false; ended = true; };
    const release = () => { ended = false; };
    const blur = () => { composing = false; ended = false; };
    document.addEventListener('compositionstart', start, true);
    document.addEventListener('compositionend', end, true);
    document.addEventListener('keyup', release, true);
    document.defaultView?.addEventListener('blur', blur);
    return {
        guards: (event) => {
            // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
            const guarded = composing || ended || event.isComposing || event.keyCode === 229;
            ended = false;
            return guarded;
        },
        dispose: () => {
            document.removeEventListener('compositionstart', start, true);
            document.removeEventListener('compositionend', end, true);
            document.removeEventListener('keyup', release, true);
            document.defaultView?.removeEventListener('blur', blur);
        },
    };
}
//# sourceMappingURL=keyboard-composition.js.map