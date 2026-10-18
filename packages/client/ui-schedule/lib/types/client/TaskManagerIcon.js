import { jsx as _jsx } from "react/jsx-runtime";
/** Decorative occupant for the task-manager sidebar entry. */
import { IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Render the clock glyph at the size the sidebar asks for; the sidebar owns
 * its accessible navigation label. The glyph is the row's direct icon child,
 * as on every other panel row: an inline wrapper makes it the baseline of a
 * line box inside the row's glyph slot, which lifts it above the label.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns decorative clock icon.
 */
export function TaskManagerIcon({ size }) {
    return _jsx(IconClockOutlineRegular, { size: size });
}
//# sourceMappingURL=TaskManagerIcon.js.map