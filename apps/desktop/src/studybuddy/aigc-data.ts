/** Stable storage shared by the legacy entry and the complete native candidate. */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
export function accountAigcDirectory(userDataRoot: string, accountId: string): string {
  return join(userDataRoot, 'studybuddy-aigc', 'accounts', createHash('sha256').update(accountId).digest('hex'))
}
