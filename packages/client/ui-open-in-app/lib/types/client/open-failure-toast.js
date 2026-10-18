import { jsx as _jsx } from "react/jsx-runtime";
/** Per-control failure banner for path gestures. */
import { useCallback, useRef, useState } from 'react';
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Transient failure banner owned by the control that initiated the gesture,
 * so one failed request announces once, from the control the user pressed.
 * @returns `toast` owned by the control and `show` to announce one
 * failure with resolved copy; announcing again replays the banner.
 */
export function useOpenFailureToast() {
    // The seq keys the banner so the same failure text replays instead of staying silently in place.
    const seq = useRef(0);
    const [banner, setBanner] = useState(null);
    const dismiss = useCallback(() => { setBanner(null); }, []);
    return {
        toast: banner === null
            ? null
            : _jsx(Toast, { text: banner.text, icon: _jsx(IconWarningOutlineRegular, {}), onDone: dismiss }, banner.seq),
        show: (text) => {
            seq.current += 1;
            setBanner({ seq: seq.current, text });
        },
    };
}
//# sourceMappingURL=open-failure-toast.js.map