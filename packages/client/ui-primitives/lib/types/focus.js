/** Focus presentation for automatic entry and restoration. */
const releases = new WeakMap();
const navigationKeys = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
/**
 * Focus an automatic destination without a focus outline until keyboard navigation or blur.
 * The theme suppresses outlines while data-dsh-automatic-focus is present; borders and shadows remain intact.
 * Tab and directional navigation restore normal focus styling.
 * @param element - control or container receiving automatic focus.
 * @param options - browser focus options, including scroll preservation.
 */
export function focusWithoutRing(element, options) {
    releases.get(element)?.();
    const release = () => {
        element.removeAttribute('data-dsh-automatic-focus');
        element.removeEventListener('blur', release);
        element.removeEventListener('keydown', navigate, true);
        releases.delete(element);
    };
    const navigate = (event) => {
        if (!event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey && navigationKeys.has(event.key))
            release();
    };
    releases.set(element, release);
    element.setAttribute('data-dsh-automatic-focus', '');
    element.addEventListener('blur', release);
    element.addEventListener('keydown', navigate, true);
    element.focus(options);
    if (!element.matches(':focus'))
        release();
}
//# sourceMappingURL=focus.js.map