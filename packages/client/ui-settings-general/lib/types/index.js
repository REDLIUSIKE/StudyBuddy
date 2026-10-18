import z from '@deepseek-ai/schemastery';
/** Live welcome preference. */
export const Config = z.object({
    welcomeNoticeVersion: z.string().volatile(),
});
/** The browser consumes the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 */
export function apply(ctx) {
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
}
//# sourceMappingURL=index.js.map