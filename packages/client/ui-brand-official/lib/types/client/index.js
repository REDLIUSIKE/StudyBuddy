import { OfficialBrandMark, OfficialBrandName, StudyBuddyHeroMark } from "./Brand.js";
/** Required service: the UI slot registry. */
export const inject = ['slots'];
/**
 * Fill the sidebar brand slots as one declaration-aware registration set. The
 * conversation hero receives the same approved StudyBuddy mascot.
 * @param ctx - Client root context.
 */
export function apply(ctx) {
    ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OfficialBrandMark);
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, OfficialBrandName);
    }));
    ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, StudyBuddyHeroMark));
}
//# sourceMappingURL=index.js.map