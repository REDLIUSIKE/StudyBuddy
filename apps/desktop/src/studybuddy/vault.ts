/** Electron safeStorage envelope for this application's own refresh credential. */
import { readFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { StudyBuddyVault } from './services.ts'
interface Encryption { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
export function studyBuddyVault(path: string, encryption: Encryption): StudyBuddyVault {
  const check = (): void => { if (!encryption.isEncryptionAvailable()) throw new Error('StudyBuddy secure storage unavailable') }
  return {
    async read() {
      let raw: string
      try { raw = await readFile(path, 'utf8') }
      catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null; throw error }
      check()
      const value: unknown = JSON.parse(raw)
      if (typeof value !== 'object' || value === null || !('format' in value) || value.format !== 1
        || !('ciphertext' in value) || typeof value.ciphertext !== 'string' || value.ciphertext.length > 32768
        || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value.ciphertext)) throw new Error('Invalid StudyBuddy vault')
      return encryption.decryptString(Buffer.from(value.ciphertext, 'base64'))
    },
    async write(value) {
      check(); await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.tmp`
      await writeFile(temporary, JSON.stringify({ format: 1, ciphertext: encryption.encryptString(value).toString('base64') }), { mode: 0o600 })
      await rename(temporary, path)
    },
    async clear() { try { await unlink(path) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error } },
  }
}
