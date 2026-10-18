/** Browser entry registering the Agent Teams conversation-header action. */
import { registerAgentTeamUi } from "./mount.js";
export { inject } from "./mount.js";
/**
 * Register the Team locale dictionaries and header action on the Client Context.
 * @param ctx - Client Context with the declared `inject` services available.
 */
export function apply(ctx) {
    registerAgentTeamUi(ctx);
}
//# sourceMappingURL=index.js.map