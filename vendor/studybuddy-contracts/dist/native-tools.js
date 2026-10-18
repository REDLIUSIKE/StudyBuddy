import { nativeToolDefinitions } from './native-tools-data.js';
export const NATIVE_TOOLS = Object.freeze(nativeToolDefinitions.map((definition) => Object.freeze({
    ...definition,
    protocols: Object.freeze([...definition.protocols]),
    platformSupport: Object.freeze({ ...definition.platformSupport }),
})));
const byId = new Map(NATIVE_TOOLS.map((definition) => [definition.id, definition]));
export function getNativeToolDefinition(id) {
    const definition = typeof id === 'string' ? byId.get(id) : undefined;
    if (!definition)
        throw new Error('unknown_tool');
    return definition;
}
//# sourceMappingURL=native-tools.js.map