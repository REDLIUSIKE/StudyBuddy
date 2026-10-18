import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { AIGC_DEVELOPMENT_NATIVE_RUNTIME_PIN } from '../src/studybuddy/aigc-development-native-pin.ts'
import { RESEARCH_DEVELOPMENT_RUNTIME_PIN } from '../src/studybuddy/research-development-resource-pin.ts'
import { createHash } from 'node:crypto'

it('embeds both current development resource identities in the executable Main bundle', async () => {
  const bundle = await readFile(resolve('apps/desktop/lib/main.js'), 'utf8')
  for (const [kind, pin] of [['aigc', AIGC_DEVELOPMENT_NATIVE_RUNTIME_PIN], ['research', RESEARCH_DEVELOPMENT_RUNTIME_PIN]] as const) {
    expect(pin, `${kind} development resource is prepared`).not.toBeNull()
    const manifest = await readFile(resolve(`.dsh-build/studybuddy-${kind}-development/manifest.json`))
    const digest = createHash('sha256').update(manifest).digest('hex')
    expect(pin!.manifestSha256, `${kind} source pin matches the prepared resource`).toBe(digest)
    expect(bundle.includes(digest), `${kind} Main bundle must compile the current pin after resource preparation`).toBe(true)
  }
})
