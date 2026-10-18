import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const domainInputs = {
  'toonflow-aigc': resolve(root, 'integrations/toonflow/apps/server/src/embedded/capability-contract.mjs'),
  'openfilm-video': resolve(root, 'integrations/openfilm/packages/openfilm/studio/server/embedded/tool-descriptors.mjs'),
}

/** Resolve public capability descriptors from this repository's integrations. */
export function capabilityDomainInputsPlugin() {
  return {
    name: 'studybuddy-capability-domain-inputs',
    async resolveId(source) {
      const input = source.replaceAll('\\', '/')
      const role = input.endsWith('StudyBuddy-Toonflow/apps/server/src/embedded/capability-contract.mjs')
        ? 'toonflow-aigc'
        : input.endsWith('StudyBuddy-OpenFilm/packages/openfilm/studio/server/embedded/tool-descriptors.mjs')
          ? 'openfilm-video'
          : null
      if (role === null) return null
      return realpath(domainInputs[role])
    },
  }
}
