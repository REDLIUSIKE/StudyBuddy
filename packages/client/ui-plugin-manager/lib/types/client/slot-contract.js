/**
 * The slots the Plugins page declares for other plugins. Three carry a
 * plugin's own configuration: the official plugins listed beside the official
 * bundles, one bundle's configuration on its page, and one row's configuration
 * opened from that row. Three more take contributions to any detail page —
 * its head actions, the badges beside its title, and the sections under its
 * own content — from a plugin that has something to say about bundles, rows,
 * or official plugins it does not own. A registrant merges this contract with
 * `import type` and registers through `ctx.slots`; it never imports this
 * package at runtime.
 *
 * Entries accept `page` for the form with its own save control and `summary`
 * for an official card's one-liner or a row's missing-description fallback.
 * Bundle configuration renders only `page`. A detail contribution is rendered
 * with the subject of the open page and decides from it whether to render at
 * all. The page draws the title, icon, and crumb itself.
 */
export {};
//# sourceMappingURL=slot-contract.js.map