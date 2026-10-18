import { nativeToolDefinitions } from './native-tools-data.js';

export type NativeToolId = typeof nativeToolDefinitions[number]['id'];
export type NativeProtocol = 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages';
export interface NativeToolDefinition {
  readonly id: NativeToolId;
  readonly upstreamId: string;
  readonly displayName: string;
  readonly noModelConfig: boolean;
  readonly nativeConfigScope: string;
  readonly protocols: readonly NativeProtocol[];
  readonly platformSupport: Readonly<Record<'windows'|'macos'|'linux','native'|'embedded'|'unsupported'>>;
  readonly sourceSha256: string;
  /** Pending official contracts are not model-configuration support. */
  readonly configurationEvidence: 'verified'|'pending'|'not_applicable';
  /** An explicit user decision, independent of whether a protocol is documented. */
  readonly configurationRestriction: 'user_deferred_overwrite' | null;
}

export const NATIVE_TOOLS: readonly NativeToolDefinition[] = Object.freeze(nativeToolDefinitions.map((definition) => Object.freeze({
  ...definition,
  protocols: Object.freeze([...definition.protocols]) as readonly NativeProtocol[],
  platformSupport: Object.freeze({...definition.platformSupport}),
})));
const byId = new Map(NATIVE_TOOLS.map((definition) => [definition.id, definition]));

export function getNativeToolDefinition(id: unknown): NativeToolDefinition {
  const definition = typeof id === 'string' ? byId.get(id as NativeToolId) : undefined;
  if (!definition) throw new Error('unknown_tool');
  return definition;
}
