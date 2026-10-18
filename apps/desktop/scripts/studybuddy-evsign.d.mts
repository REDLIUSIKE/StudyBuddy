export interface StudyBuddyEvSignConfiguration {
  path: string
  hash: string
  isNest: boolean
}

export interface StudyBuddyEvSignSignature {
  status: string
  timestamped: boolean
  thumbprint: string | null
}

export const STUDYBUDDY_EVSIGN_CLI_PATH: string
export const STUDYBUDDY_EVSIGN_CLI_SHA256: string
export const STUDYBUDDY_EVSIGN_CLI_SIGNER_THUMBPRINT: string
export const STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT: string
export const STUDYBUDDY_EVSIGN_TIMESTAMP_SERVER: string
export const STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER: string

export function validateStudyBuddyEvSignEnvironment(environment: NodeJS.ProcessEnv): { licence: string }

export function verifyStudyBuddyEvSignCli(options?: {
  cliPath?: string
  inspectSignature?: (path: string) => Promise<StudyBuddyEvSignSignature>
  fileSha256?: (path: string) => Promise<string>
}): Promise<{ path: string, sha256: string, thumbprint: string }>

export function createStudyBuddyEvSignSigner(options: {
  candidateRoot: string
  licence?: string
  cliPath?: string
  environment?: NodeJS.ProcessEnv
  execute?: (file: string, arguments_: readonly string[], options: object) => Promise<unknown>
  inspectSignature?: (path: string) => Promise<StudyBuddyEvSignSignature>
  fileSha256?: (path: string) => Promise<string>
  preserveSignature?: (path: string) => Promise<boolean>
  record?: (event: object) => void
}): (configuration: StudyBuddyEvSignConfiguration) => Promise<void>

export function createStudyBuddyWindowsReleaseSigner(options: {
  mainExecutable: string
  installer: string
  sign: (configuration: StudyBuddyEvSignConfiguration) => Promise<void>
  record?: (event: object) => void
}): (configuration: StudyBuddyEvSignConfiguration) => Promise<void>
