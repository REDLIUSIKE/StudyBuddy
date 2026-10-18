/** Retired StudyBuddy upload entry; historical Session record types remain readable. */
export type * from './types.ts'
/** Legacy plugin identity retained for existing profile configuration. */
export const name = 'session-log-deepseek'
/** Loading an old profile never registers an upload contributor. */
export function apply(): void {}
