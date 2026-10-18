/**
 * Pointer ownership shared by the docking surface and the float layer.
 *
 * Capture is hardening, not the mechanism: the window listeners carry the
 * gesture either way. Capture is what stops a scroll container the pointer
 * crosses from claiming it, which Chromium reports as a cancelled pointer and
 * an abandoned drag. Environments without the API (jsdom) simply go unhardened.
 */
import { useEffect, useRef } from 'react';
/**
 * Take ownership of the pointer for the rest of the gesture.
 * @param element - the element the gesture started on.
 * @param pointerId - the pointer to capture.
 */
export function capturePointer(element, pointerId) {
    if (typeof element.setPointerCapture !== 'function')
        return;
    element.setPointerCapture(pointerId);
}
/**
 * Capture the pointer, then follow it on the window until release or cancel.
 * Only that pointer's events count: a second finger or a pen beside the mouse
 * neither moves nor ends the gesture. The listeners remove themselves before
 * `up` or `cancel` runs; the returned callback ends the gesture early, for an
 * unmount or a superseding press.
 * @param element - the element the gesture started on.
 * @param pointerId - the pointer to capture and follow.
 * @param followers - listeners for move, release, and cancel.
 * @returns detach callback removing the three listeners.
 */
export function followPointer(element, pointerId, followers) {
    capturePointer(element, pointerId);
    const controller = new AbortController();
    const { signal } = controller;
    element.dataset.dockkitPointer = String(pointerId);
    signal.addEventListener('abort', () => {
        if (element.dataset.dockkitPointer === String(pointerId))
            delete element.dataset.dockkitPointer;
    }, { once: true });
    const own = (event) => event.pointerId === pointerId;
    window.addEventListener('pointermove', (event) => { if (own(event))
        followers.move(event); }, { signal });
    window.addEventListener('pointerup', (event) => {
        if (!own(event))
            return;
        controller.abort();
        followers.up(event);
    }, { signal });
    window.addEventListener('pointercancel', (event) => {
        if (!own(event))
            return;
        controller.abort();
        followers.cancel();
    }, { signal });
    return () => { controller.abort(); };
}
/**
 * One pointer gesture at a time for a component. A gesture ends on release, on
 * cancel, or when a new press supersedes it; `reset` runs at each of those ends
 * so the component clears its preview. Unmounting mid-gesture removes the
 * listeners without resetting anything.
 * @param reset - clears the component's gesture preview.
 * @returns the gesture starter, called from a pointer-down handler.
 */
export function useGesture(reset) {
    const inFlight = useRef(undefined);
    useEffect(() => () => { inFlight.current?.stop(); }, []);
    return (element, pointerId, followers) => {
        inFlight.current?.end();
        const settle = () => {
            inFlight.current = undefined;
            reset();
        };
        const stop = followPointer(element, pointerId, {
            move: followers.move,
            up: (event) => {
                settle();
                followers.up(event);
            },
            cancel: settle,
        });
        inFlight.current = {
            stop,
            end: () => {
                stop();
                settle();
            },
        };
    };
}
//# sourceMappingURL=pointer.js.map