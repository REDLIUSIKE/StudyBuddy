/** Reject mixed product versions before building or signing any desktop release input. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planShared } from '../../../scripts/release/bump.ts'
import { releaseFamily } from '../../../scripts/release/families.ts'

/**
 * Check root, published DSH members and private workspaces using the existing release version plan.
 * @param root Canonical Harness checkout; manifests and Git state are never modified.
 * @returns The shared product version; all version conflicts are reported in one error.
 */
export function requireDesktopReleaseVersions(root: string): string {
  const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (manifest === null || typeof manifest !== 'object' || !('version' in manifest)
    || typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error('desktop package: package.json must declare a string version')
  }
  const family = releaseFamily('dsh')
  const { planned } = planShared(family, root, family.members(root), manifest.version)
  const conflicts = planned.filter(entry => entry.from !== manifest.version)
  if (conflicts.length > 0) {
    throw new Error(`desktop package: source version conflicts; expected ${manifest.version}:\n${conflicts
      .map(entry => `${entry.manifestPath}: ${entry.from}`).join('\n')}\nAlign these release manifests before packaging; no build or signing was started.`)
  }
  return manifest.version
}
