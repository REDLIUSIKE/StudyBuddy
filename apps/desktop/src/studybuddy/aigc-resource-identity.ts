/** The application pins the prepared manifest; rewriting the manifest cannot bless altered executables. */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertAigcPath, verifyAigcRuntime } from './aigc-resources.ts'

const manifestSha256 = 'c52b7de055a9f98fb91402a2733e586400728ae578664632b7c72517ed57e72f'
/** Verify the prepared source inventory against the identity compiled into this client.
 * @param directory - Canonical development or packaged AIGC resource directory.
 * @returns Private process launch paths after all byte checks pass. */
export async function loadAigcResources(directory: string) {
  await assertAigcPath(directory)
  if (createHash('sha256').update(await readFile(join(directory, 'manifest.json'))).digest('hex') !== manifestSha256) {
    throw new Error('AIGC_RUNTIME_IDENTITY_MISMATCH')
  }
  const manifest = await verifyAigcRuntime(directory)
  return { directory, bun: join(directory, 'bin/bun.exe'), entry: join(directory, manifest.entry) }
}
