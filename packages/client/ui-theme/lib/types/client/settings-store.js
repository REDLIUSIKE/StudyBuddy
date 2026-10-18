/**
 * Appearance and font row slot stores: mirrors of the theme service
 * snapshot. The plugin's apply-world change listener is the only writer; the
 * row components read via props.useStore.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store';
import { DEFAULT_FONT_SIZES } from "../theme-settings.js";
/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore() {
    return defineStore({
        init: () => ({ preference: 'system', revision: -1 }),
        actions: {
            sync: (d, preference, revision) => {
                if (revision <= d.revision)
                    return;
                d.preference = preference;
                d.revision = revision;
            },
        },
    });
}
/**
 * Declares the font rows' state and write surface.
 * @returns the store handle.
 */
export function createFontRowStore() {
    return defineStore({
        init: () => ({ fontSizes: DEFAULT_FONT_SIZES, fontFamilies: { text: '', code: '', terminal: '' }, revision: -1 }),
        actions: {
            sync: (d, fontSizes, fontFamilies, revision) => {
                if (revision <= d.revision)
                    return;
                d.fontSizes = fontSizes;
                d.fontFamilies = fontFamilies;
                d.revision = revision;
            },
        },
    });
}
//# sourceMappingURL=settings-store.js.map