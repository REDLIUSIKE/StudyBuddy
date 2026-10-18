/** Release credential checks never expose secret values in errors. */
export function privatePayloadPathReason(path: string): string | undefined
export function assertCredentialFreeText(name: string, bytes: Buffer, credentialValues?: readonly string[]): void
export function assertCredentialFreePayload(directory: string, environment?: NodeJS.ProcessEnv): Promise<{ filesScanned: number; bytesScanned: number; credentialValuesChecked: number }>
