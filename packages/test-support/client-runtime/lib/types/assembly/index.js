/**
 * Whole-client tier entry (deep import only:
 * `@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts`). Kept out of
 * the package root so slot-tier specs do not load the assembly machinery.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly
 */
export { ClientRoster } from "./roster.js";
export { TestClient } from "./test-client.js";
export { remoteDefaultResponses } from "./remote-default-responses.js";
export { bundleRoster, webApp } from "./bundle-roster.js";
export { createClientTest } from "./vitest.js";
//# sourceMappingURL=index.js.map