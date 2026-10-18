import { AppearanceRow } from "./AppearanceRow.js";
import { FontSettingsGroup } from "./FontSettingsGroup.js";
import { createAppearanceRowStore, createFontRowStore } from "./settings-store.js";
import { installThemeStyles } from "./styles.js";
import { en, zh } from "./locales.js";
import { DEFAULT_FONT_SIZES, DEFAULT_PREFERENCE, FONT_FAMILY_FIELDS, FONT_ROLES, FONT_SIZE_SPECS, fontFamilyVariable, isFontSize, isThemePreference, normalizeFontFamily, sectionFontSizes, THEME_PREFERENCE_FIELD, THEME_SETTINGS_NAMESPACE, } from "../theme-settings.js";
/** Namespace owning this feature's settings-row copy. */
export const SETTINGS_NS = 'settings.theme';
const BUILTIN_THEMES = Object.freeze([
    Object.freeze({ id: 'light', colorScheme: 'light', tokens: Object.freeze({}) }),
    Object.freeze({ id: 'dark', colorScheme: 'dark', tokens: Object.freeze({}) }),
]);
const BUILTIN_INSPECT_TOKENS = Object.freeze([
    { name: '--dsw-alias-bg-base', description: 'Application base background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-base' },
    { name: '--dsw-alias-bg-layer-1', description: 'Primary raised surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-layer-1' },
    { name: '--dsw-alias-bg-layer-2', description: 'Secondary nested surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-layer-2' },
    { name: '--dsw-alias-bg-overlay', description: 'Overlay and popover background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-overlay' },
    { name: '--dsw-alias-border-l1', description: 'Primary subtle border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-border-l1' },
    { name: '--dsw-alias-border-l2', description: 'Secondary stronger border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-border-l2' },
    { name: '--dsw-alias-brand-primary', description: 'Primary brand accent.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-brand-primary' },
    { name: '--dsw-alias-label-primary', description: 'Primary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-label-primary' },
    { name: '--dsw-alias-label-secondary', description: 'Secondary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-label-secondary' },
    { name: '--dsw-alias-state-error-primary', description: 'Primary error state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-error-primary' },
    { name: '--dsw-alias-state-idle-primary', description: 'Primary inactive state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-idle-primary' },
    { name: '--dsw-alias-state-success-primary', description: 'Primary success state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-success-primary' },
    { name: '--dsw-alias-state-warn-primary', description: 'Primary warning state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-warn-primary' },
    { name: '--dsw-specific-sidebar-fill', description: 'Sidebar column and title-row background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-specific-sidebar-fill' },
]);
/**
 * Theme registry and preference owner. `light`/`dark` are built in (the base
 * stylesheets carry both palettes); third-party themes register alias-layer
 * overrides. Reads go through {@link getTheme}; preference writes only
 * through {@link setTheme}; continuous sync only through the `theme/change`
 * event. {@link overrideTokens} stacks partial token layers over the active
 * theme without touching the registry.
 * The service holds the `prefers-color-scheme` media query (environment
 * sensing, not presentation) and re-emits when the OS scheme flips while the
 * preference is `system`.
 */
export class ThemeRuntime {
    ctx;
    host;
    themes = [...BUILTIN_THEMES];
    preference;
    fontSizes = bootstrapFontSizes();
    fontFamilies = bootstrapFontFamilies();
    revision = 0;
    /** Own settings writes not yet settled; adoption waits for zero so a Host echo of an earlier write cannot revert a later local change. */
    pendingWrites = 0;
    snapshot;
    media;
    /** Override layers by source; seq (monotonic) is the stacking order. */
    overrides = new Map();
    overrideSeq = 0;
    /**
     * @param ctx - owning context (change events are emitted on it; the
     * media-query and scope listeners are released through ctx.effect on dispose).
     * @param host - durable preference scope owned by the same plugin.
     */
    constructor(ctx, host) {
        this.ctx = ctx;
        this.host = host;
        this.preference = DEFAULT_PREFERENCE;
        // Non-browser runs (node e2e booting the client tree) have no matchMedia.
        this.media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)');
        this.snapshot = this.buildSnapshot();
        if (this.media !== undefined) {
            const media = this.media;
            const onChange = () => {
                if (this.preference !== 'system')
                    return;
                this.publish();
            };
            ctx.effect(() => {
                media.addEventListener('change', onChange);
                return () => { media.removeEventListener('change', onChange); };
            }, 'ui-theme: prefers-color-scheme listener');
        }
        ctx.effect(() => host.subscribe(() => { this.adopt(); }), 'ui-theme: settings scope adoption');
        this.adopt();
    }
    /**
     * Read the current immutable theme snapshot.
     * @returns the current snapshot (stable reference until the next change).
     */
    getTheme() {
        return this.snapshot;
    }
    /**
     * Export the current token directory without reading DOM or computed styles.
     * @returns stable JSON-safe token descriptions, including registered and override-only names.
     */
    exportInspectTokens() {
        const tokens = new Map(BUILTIN_INSPECT_TOKENS.map(token => [token.name, token]));
        for (const theme of this.themes) {
            for (const name of Object.keys(theme.tokens)) {
                if (!tokens.has(name))
                    tokens.set(name, dynamicToken(name));
            }
        }
        for (const layer of this.overrides.values()) {
            for (const name of Object.keys(layer.tokens)) {
                if (!tokens.has(name))
                    tokens.set(name, dynamicToken(name));
            }
        }
        return [...tokens.values()].map(token => ({ ...token })).sort((left, right) => left.name.localeCompare(right.name));
    }
    /**
     * Switch the theme preference — the only user preference write entry.
     * Built-in preferences are written through the settings scope and every
     * accepted value emits `theme/change`.
     * @param id - a registered theme id or `system`; unknown ids throw.
     */
    setTheme(id) {
        if (id !== 'system' && !this.themes.some(t => t.id === id)) {
            throw new Error(`theme "${id}" is not registered`);
        }
        if (this.preference === id)
            return;
        this.preference = id;
        if (isThemePreference(id))
            this.write(THEME_PREFERENCE_FIELD, id);
        this.publish();
    }
    /**
     * Change one role's font size — the only font-size write entry. Accepted
     * values are written through the settings scope and emit `theme/change`.
     * @param role - font role.
     * @param px - integer px within the role's `FONT_SIZE_SPECS` range; out-of-range or fractional values throw.
     */
    setFontSize(role, px) {
        const spec = FONT_SIZE_SPECS[role];
        if (!isFontSize(role, px))
            throw new Error(`${role} font size ${px} is outside ${spec.min}..${spec.max}`);
        if (this.fontSizes[role] === px)
            return;
        this.fontSizes = Object.freeze({ ...this.fontSizes, [role]: px });
        this.write(spec.field, px);
        this.publish();
    }
    /**
     * Change one role's font list — the only font-family write entry. The value
     * is normalized, written through the settings scope, and emits `theme/change`
     * when the normalized list differs.
     * @param role - font role.
     * @param value - comma-separated family names; a value without names restores the built-in stack.
     */
    setFontFamily(role, value) {
        const list = normalizeFontFamily(value);
        if (this.fontFamilies[role] === list)
            return;
        this.fontFamilies = Object.freeze({ ...this.fontFamilies, [role]: list });
        this.write(FONT_FAMILY_FIELDS[role], list);
        this.publish();
    }
    /** Write one field through the settings scope, then adopt the durable section once no own write remains. */
    write(field, value) {
        this.pendingWrites += 1;
        void this.host.set(field, value).finally(() => {
            this.pendingWrites -= 1;
            this.adopt();
        });
    }
    /** Adopt the scope's accepted durable preference without writing it back. */
    adopt() {
        if (this.pendingWrites > 0)
            return;
        const section = this.host.getSnapshot().value;
        if (section === undefined)
            return;
        const fontFamilies = durableFontFamilies(section);
        const fontSizes = sectionFontSizes(section);
        if (this.preference === section.preference
            && FONT_ROLES.every(role => this.fontSizes[role] === fontSizes[role] && this.fontFamilies[role] === fontFamilies[role]))
            return;
        this.preference = section.preference;
        this.fontSizes = fontSizes;
        this.fontFamilies = fontFamilies;
        this.publish();
    }
    /**
     * Register a theme. Duplicate id throws (single occupant per id; the
     * built-in pair counts; `system` is a preference, not a registrable id).
     * @param definition - theme id, colorScheme, and alias-token overrides.
     * @returns disposer. Disposing the theme backing the active preference
     * resets the preference to the default so the UI never keeps tokens of an
     * unregistered theme.
     */
    register(definition) {
        if (definition.id === 'system')
            throw new Error('"system" is a preference, not a registrable theme id');
        if (this.themes.some(t => t.id === definition.id)) {
            throw new Error(`theme "${definition.id}" is already registered`);
        }
        this.themes = [...this.themes, definition];
        this.publish();
        return () => {
            if (!this.themes.some(t => t.id === definition.id))
                return;
            this.themes = this.themes.filter(t => t.id !== definition.id);
            if (this.preference === definition.id) {
                this.preference = DEFAULT_PREFERENCE;
            }
            this.publish();
        };
    }
    /**
     * Stack a token override layer on top of the active theme — the token-level
     * analogue of slot shading: the base theme stays untouched, layers compose
     * in seq order with later layers winning per-token, and removing a layer
     * restores whatever it covered. Calling again with the same source replaces
     * that source's whole layer and restacks it on top (effect re-registration
     * semantics). Emits `theme/change` with the recomposed snapshot.
     * @param source - layer identity; one layer per source (dynamic packages
     * pass their package id — the façade pins it, so it also names the layer's
     * origin for inspection).
     * @param tokens - token-name → `{ light, dark }` value pairs. Validated at
     * runtime (model-authored callers reach this boundary with untyped JS);
     * a bare string value throws a teaching error.
     * @returns disposer removing exactly the layer this call created; a no-op
     * once the source has re-overridden (the newer layer is not torn down).
     */
    overrideTokens(source, tokens) {
        const layer = { seq: this.overrideSeq++, tokens: validateOverrides(source, tokens) };
        this.overrides.set(source, layer);
        this.publish();
        return () => {
            if (this.overrides.get(source) !== layer)
                return;
            this.overrides.delete(source);
            this.publish();
        };
    }
    buildSnapshot() {
        const resolvedId = this.preference === 'system'
            ? (this.media?.matches === true ? 'dark' : 'light')
            : this.preference;
        // Both built-ins always exist; a registered preference id resolves or has
        // been reset by its disposer, so the lookup cannot miss.
        const active = this.themes.find(t => t.id === resolvedId);
        /* v8 ignore next 2 -- needs a registry without light/dark, which register()/dispose() cannot produce */
        if (active === undefined)
            throw new Error(`theme registry lost "${resolvedId}"`);
        return Object.freeze({
            preference: this.preference,
            fontSizes: this.fontSizes,
            fontFamilies: this.fontFamilies,
            active: this.composeActive(active),
            themes: Object.freeze([...this.themes]),
            revision: this.revision,
        });
    }
    /**
     * Fold the override layers into the active definition: seq order, later
     * layers win per-token, each value picked for the active color scheme (the
     * presenter consumes the composed snapshot and needs no override awareness).
     * Without layers the registered definition passes through by identity.
     */
    composeActive(active) {
        if (this.overrides.size === 0)
            return active;
        const tokens = { ...active.tokens };
        for (const layer of [...this.overrides.values()].sort((a, b) => a.seq - b.seq)) {
            for (const [name, modes] of Object.entries(layer.tokens)) {
                tokens[name] = modes[active.colorScheme];
            }
        }
        return Object.freeze({ ...active, tokens: Object.freeze(tokens) });
    }
    publish() {
        this.revision += 1;
        this.snapshot = this.buildSnapshot();
        this.ctx.emit('theme/change', this.snapshot);
    }
}
/**
 * Read the font sizes the Host boot script wrote on `body` before any plugin
 * ran, so the initial snapshot matches first paint and ui-layout's presenter
 * does not flash the schema defaults while the settings read is in flight.
 * Non-browser runs, mounts without the boot script, and out-of-range values
 * fall back to each role's default; the durable settings adoption still lands afterwards.
 */
function bootstrapFontSizes() {
    /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
    if (typeof document === 'undefined')
        return DEFAULT_FONT_SIZES;
    const read = (role) => {
        const parsed = Number.parseInt(document.body.style.getPropertyValue(FONT_SIZE_SPECS[role].variable), 10);
        return isFontSize(role, parsed) ? parsed : FONT_SIZE_SPECS[role].default;
    };
    return Object.freeze({ text: read('text'), code: read('code'), terminal: read('terminal') });
}
/** Font lists the Host boot script wrote on `body`, read for the same first-paint reason as {@link bootstrapFontSizes}. */
function bootstrapFontFamilies() {
    /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
    if (typeof document === 'undefined')
        return Object.freeze({ text: '', code: '', terminal: '' });
    const style = document.body.style;
    return Object.freeze({
        text: normalizeFontFamily(style.getPropertyValue(fontFamilyVariable('text'))),
        code: normalizeFontFamily(style.getPropertyValue(fontFamilyVariable('code'))),
        terminal: normalizeFontFamily(style.getPropertyValue(fontFamilyVariable('terminal'))),
    });
}
/** Normalized font lists from one accepted settings section (hand-edited documents may hold raw input). */
function durableFontFamilies(section) {
    return Object.freeze({
        text: normalizeFontFamily(section.textFontFamily),
        code: normalizeFontFamily(section.codeFontFamily),
        terminal: normalizeFontFamily(section.terminalFontFamily),
    });
}
/**
 * Runtime shape check for one override layer (model-authored callers pass
 * untyped JS through the dynamic-package façade, so the static type cannot
 * enforce the pair shape there). Returns a defensive per-token copy so later
 * caller mutation cannot reach the stored layer.
 */ function validateOverrides(source, tokens) {
    const validated = {};
    for (const [name, value] of Object.entries(tokens)) {
        if (typeof value === 'string') {
            throw new TypeError(`theme override "${name}" from "${source}" is a bare string — pass { light: ${JSON.stringify(value)}, dark: ${JSON.stringify(value)} } `
                + '(repeat the value when it is the same in both palettes); a single value goes illegible when the user switches color scheme');
        }
        if (typeof value !== 'object' || value === null
            || typeof value.light !== 'string'
            || typeof value.dark !== 'string') {
            throw new TypeError(`theme override "${name}" from "${source}" must map to a { light, dark } pair of strings — one value per color scheme`);
        }
        const modes = value;
        validated[name] = { light: modes.light, dark: modes.dark };
    }
    return validated;
}
function dynamicToken(name) {
    return {
        name,
        description: 'Theme token registered by the current Client composition.',
        valueType: 'CSS value',
        requiresLightAndDark: true,
        ...(name.startsWith('--') ? { cssVariable: name } : {}),
    };
}
/**
 * Required services: settings transport plus slots/locale for the Appearance
 * row. `remote` carries the forwarded settings invalidation that
 * `ctx.configForms.get(entryId)` subscribes to on this context.
 */
export const inject = ['slots', 'locale', 'remote', 'configForms'];
/**
 * Client plugin body: provide the theme service and register the
 * feature-owned Appearance and font settings rows into the General section's item
 * slot (a feature owns its settings surface).
 * @param ctx - client cordis context.
 */
export function apply(ctx) {
    installThemeStyles(ctx);
    const host = ctx.configForms.get(THEME_SETTINGS_NAMESPACE);
    const theme = new ThemeRuntime(ctx, host);
    ctx.provide('theme', theme);
    ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-theme: settings row dictionaries');
    const store = createAppearanceRowStore();
    let bound;
    const fontStore = createFontRowStore();
    let fontBound;
    const sync = (snapshot) => {
        bound?.sync(snapshot.preference, snapshot.revision);
        fontBound?.sync(snapshot.fontSizes, snapshot.fontFamilies, snapshot.revision);
    };
    ctx.on('theme/change', sync);
    const injected = (actions) => {
        bound = actions;
        // Re-sync from the getter so no event is lost between registration and
        // first render (the store's revision guard drops stale duplicates).
        sync(theme.getTheme());
        return {
            setTheme: (id) => { theme.setTheme(id); },
        };
    };
    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'appearance',
        order: 10,
        store,
        locale: SETTINGS_NS,
        inject: injected,
    }, AppearanceRow));
    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'font-size',
        order: 11,
        store: fontStore,
        locale: SETTINGS_NS,
        inject: (actions) => {
            fontBound = actions;
            sync(theme.getTheme());
            return {
                setFontFamily: (role, value) => { theme.setFontFamily(role, value); },
                setFontSize: (role, px) => { theme.setFontSize(role, px); },
            };
        },
    }, FontSettingsGroup));
}
//# sourceMappingURL=index.js.map