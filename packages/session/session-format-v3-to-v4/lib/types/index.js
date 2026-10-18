/** Tool-role V3-to-V4 migration with native V4 framing and delivery validation. */
export { releasedV3SessionFormatCodec } from '@deepseek-ai/dsh-session-format-v2-to-v3';
export * from "./codec.js";
export * from "./migration.js";
export { assertReleasedV4Header, assertReleasedV4Relationships, restoreReleasedV4Artifact } from "./validation.js";
export { historicalChildCatalogSource } from "./facts.js";
export { RELEASED_V3_EVENT_TYPES } from "./extension-identities.js";
//# sourceMappingURL=index.js.map