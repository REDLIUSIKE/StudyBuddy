/** Serve the registered tool module from verified bytes, never a renderer path. */
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import type { VerifiedNativeRuntime } from './trusted-native-runtime.ts'
import { BusinessFailure } from './business-api.ts'
export type ToolModuleManifest = VerifiedNativeRuntime['module']
export const TOOL_PAGE_URL = 'dsh-tools://tool-center/index.html'
export const LAB_PAGE_URL = 'dsh-tools://tool-center/labs.html'
export const TOOL_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
const denied = (): never => {
  throw new BusinessFailure('TOOL_RESOURCE_DENIED')
}
/**
 * @param url Fixed tool origin request.
 * @param root Verified module directory.
 * @param manifest Registered asset hashes.
 * @returns Bytes from the same checked read, with its local path and MIME type.
 */
export async function resolveToolResource(
  url: string,
  root: string,
  manifest: ToolModuleManifest,
): Promise<{ path: string; mime: string; bytes: Buffer }> {
  try {
    const decoded = decodeURIComponent(url)
    if (
      decoded.includes('\\') ||
      decoded.split('/').some(part => part === '..' || part === '.') ||
      !/^dsh-tools:\/\/tool-center\/[A-Za-z0-9_./-]+$/u.test(decoded)
    )
      denied()
    const target = new URL(url)
    if (
      target.protocol !== 'dsh-tools:' ||
      target.host !== 'tool-center' ||
      target.username ||
      target.password ||
      target.search ||
      target.hash
    )
      denied()
    const name = decodeURIComponent(target.pathname.slice(1)),
      digest = manifest.files[name]
    if (
      !digest ||
      name.split('/').some(part => !part || part === '..' || part === '.') ||
      !/^[a-f0-9]{64}$/u.test(digest)
    )
      denied()
    const path = join(resolve(root), name)
    for (let current = path; ; ) {
      if ((await lstat(current)).isSymbolicLink()) denied()
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    const stat = await lstat(path)
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) denied()
    const bytes = await readFile(path)
    if (createHash('sha256').update(bytes).digest('hex') !== digest) denied()
    const mime = (
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.jpg': 'image/jpeg',
        '.webp': 'image/webp',
        '.woff2': 'font/woff2',
        '.json': 'application/json',
      } as Record<string, string>
    )[extname(name)]
    if (!mime) denied()
    return { path, mime: mime ?? denied(), bytes }
  } catch (error) {
    if (error instanceof BusinessFailure) throw error
    return denied()
  }
}
