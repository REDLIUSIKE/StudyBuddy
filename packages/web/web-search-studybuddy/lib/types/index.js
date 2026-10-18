import { StudyBuddySearchProvider } from "./provider.js";
export * from "./provider.js";
export const name = 'web-search-studybuddy';
export const inject = ['web', 'studybuddySearch'];
/** Register once through the product profile, with an effect-scoped disposer. */
export function apply(ctx) { ctx.web.registerSearchProvider(new StudyBuddySearchProvider(ctx.studybuddySearch)); }
export * from "./wire.js";
//# sourceMappingURL=index.js.map