import { IconCompactOutlineRegular, IconDownloadOutlineRegular, IconGoalOutlineRegular, IconPaperPlaneOutlineRegular, IconPlanOutlineRegular, PermissionIconFullAccessRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { builtinCommandName } from "./resolution.js";
/** Row names per section, highest usage first; rows outside both lists close the Commands section in catalog order. */
const SECTION_ROWS = {
    add: ['file', 'goal', 'plan', 'feedback'],
    commands: ['compact', 'permission', 'model', 'export'],
};
/** One built-in Host command's face, keyed by its dictionary entries. */
function hostFace(name, icon) {
    return [name, {
            label: `label.${name}`,
            description: `description.${name}`,
            icon,
        }];
}
/** Built-in Host commands whose client face this package owns. */
const HOST_FACES = new Map([
    hostFace('goal', IconGoalOutlineRegular),
    hostFace('plan', IconPlanOutlineRegular),
    hostFace('feedback', IconPaperPlaneOutlineRegular),
    hostFace('compact', IconCompactOutlineRegular),
    hostFace('permission', PermissionIconFullAccessRegular),
    hostFace('export', IconDownloadOutlineRegular),
]);
/**
 * The localized menu face of a catalog row.
 * @param descriptor - effective Host command descriptor.
 * @param t - the `command` namespace translator.
 * @returns title, description, and glyph for a built-in command; undefined
 * for any other row, which keeps its catalog description.
 */
export function builtinRowFace(descriptor, t) {
    const name = builtinCommandName(descriptor);
    const face = name === undefined ? undefined : HOST_FACES.get(name);
    return face === undefined ? undefined : { label: t(face.label), description: t(face.description), icon: face.icon };
}
/**
 * Arrange the empty-query menu: the Add section, then the Commands section,
 * each in usage order, with unlisted rows closing Commands in their input
 * order; each row carries its section heading.
 * @param rows - the visible candidates in catalog-then-contribution order.
 * @param t - the `command` namespace translator.
 * @returns the sectioned rows.
 */
export function sectionRows(rows, t) {
    const listed = new Set([...SECTION_ROWS.add, ...SECTION_ROWS.commands]);
    const byName = new Map(rows.map(row => [row.name, row]));
    const pick = (names) => names.flatMap((name) => {
        const row = byName.get(name);
        return row === undefined ? [] : [row];
    });
    const add = pick(SECTION_ROWS.add).map(row => ({ ...row, section: t('section.add') }));
    const commands = [...pick(SECTION_ROWS.commands), ...rows.filter(row => !listed.has(row.name))]
        .map(row => ({ ...row, section: t('section.commands') }));
    return [...add, ...commands];
}
//# sourceMappingURL=presentation.js.map