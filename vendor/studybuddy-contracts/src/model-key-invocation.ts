/** Invocation facts contain neither credentials nor StudyBuddy caller identity.
 * The target service resolves funding and model permission from the submitted Key. */
export const MODEL_KEY_PROTOCOLS = [
  'openai_chat_completions', 'openai_responses', 'anthropic_messages',
  'openai_image.generate', 'openai_video.create',
  'minimax_speech.generate', 'minimax_speech.transcribe',
  'volcengine_audio.generate',
] as const;
export type ModelKeyProtocol = typeof MODEL_KEY_PROTOCOLS[number];
export type ModelKeyPurpose = 'chat' | 'image' | 'video' | 'audio' | 'transcription' | 'validation' | 'diagnostic';
export interface ModelKeyInvocationV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly exactModelId: string;
  readonly protocol: ModelKeyProtocol;
  readonly purpose: ModelKeyPurpose;
}
const invalid = (): never => { throw new Error('MODEL_KEY_INVOCATION_INVALID'); };

export function parseModelKeyInvocationV1(input: unknown): ModelKeyInvocationV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const row = input as Record<string, unknown>;
  const fields = ['schemaVersion', 'requestId', 'exactModelId', 'protocol', 'purpose'];
  if (Object.keys(row).length !== fields.length || Object.keys(row).some(key => !fields.includes(key))) return invalid();
  if (row.schemaVersion !== 1 || typeof row.requestId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.requestId)) return invalid();
  if (typeof row.exactModelId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(row.exactModelId)) return invalid();
  if (!MODEL_KEY_PROTOCOLS.includes(row.protocol as ModelKeyProtocol)) return invalid();
  const purpose = row.purpose;
  if (row.protocol === 'openai_image.generate' ? purpose !== 'image' :
      row.protocol === 'openai_video.create' ? purpose !== 'video' :
      row.protocol === 'minimax_speech.generate' || row.protocol === 'volcengine_audio.generate' ? purpose !== 'audio' :
      row.protocol === 'minimax_speech.transcribe' ? purpose !== 'transcription' :
      !['chat', 'validation', 'diagnostic'].includes(purpose as string)) return invalid();
  return { schemaVersion: 1, requestId: row.requestId, exactModelId: row.exactModelId,
    protocol: row.protocol as ModelKeyProtocol, purpose: purpose as ModelKeyPurpose };
}
