/** Load the shipped plugin with Node's native resolver, without TypeScript source aliases. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function checkSkillSafetyEntry(root) {
  const runtime = createRequire(join(root, 'package.json'))
  const entry = await import(pathToFileURL(runtime.resolve('@deepseek-ai/dsh-skill-safety-assistant/tools')).href)
  assert.equal(typeof entry.apply, 'function', 'The Skill safety tool entry must activate through Cordis')
  assert.deepEqual([...entry.inject].sort(), ['agents', 'skillSafety', 'tools'])
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await checkSkillSafetyEntry(resolve(process.argv[2]))
  console.log('SKILL_SAFETY_MODULE_IMPORT_OK')
}
