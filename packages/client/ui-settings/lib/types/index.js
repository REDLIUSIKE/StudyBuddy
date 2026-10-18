import z from '@deepseek-ai/schemastery';
import { DeveloperToolsSettingsFields } from "./developer-tools-settings.js";
/** Live preferences projected to the browser. */
export const Config = z.object({
    enabled: DeveloperToolsSettingsFields['enabled'].volatile(),
});
/** Host preferences are consumed through the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 */
export function apply(ctx) {
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
}
//# sourceMappingURL=index.js.map