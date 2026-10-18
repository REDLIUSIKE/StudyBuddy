import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, mkdir, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import assert from 'node:assert/strict'
const [bunInput, entryInput] = process.argv.slice(2)
const bun = resolve(bunInput), entry = resolve(entryInput)
const data = await mkdtemp(join(tmpdir(), 'studybuddy-aigc-http-'))
const authorization = randomBytes(32).toString('hex')
const child = spawn(bun, [entry], { cwd: resolve(entry, '..'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { SystemRoot: process.env.SystemRoot, PATH: resolve(entry, '../../bin') } })
let stderr = ''
child.stderr.on('data', chunk => { stderr += chunk.toString() })
const done = once(child, 'exit')
try {
  const origin = await new Promise((accept, reject) => {
    let text = ''
    const timer = setTimeout(() => reject(new Error('AIGC_READY_TIMEOUT: ' + stderr.slice(-1200))), 45000)
    child.once('exit', () => { clearTimeout(timer); reject(new Error('AIGC_START_FAILED: ' + stderr.slice(-1200))) })
    child.stdout.on('data', chunk => {
      text += chunk.toString()
      const lines = text.split('\n'); text = lines.pop()
      for (const line of lines) {
        try { const message = JSON.parse(line); if (message.type === 'ready') { clearTimeout(timer); accept(message.origin) } } catch { /* Other upstream output is not a control message. */ }
      }
    })
    child.stdin.write(JSON.stringify({ dataDirectory: data, workspaceRoots: [join(data, 'workspaces')], guestAuthorization: authorization }) + '\n')
  })
  assert.equal((await fetch(origin)).status, 401)
  const headers = { 'x-studybuddy-aigc-guest': authorization }
  const page = await fetch(origin, { headers })
  assert.equal(page.status, 200)
  assert.match(await page.text(), /StudyBuddy AIGC/)
  assert.equal((await fetch(origin, { headers: { ...headers, Origin: 'https://foreign.example' } })).status, 403)
  assert.equal((await fetch(origin + '/api/mobileLink/status', { headers })).status, 403)
  const models = await (await fetch(origin + '/api/ai/models', { headers })).json()
  assert.deepEqual(models.data, [])
  const root = join(data, 'workspaces', 'project')
  await mkdir(root)
  const write = await fetch(origin + '/api/workspaces/files/write?directory=' + encodeURIComponent(root) + '&path=canvas.json', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: '{"toonflowCanvas":true}' })
  assert.equal(write.status, 200)
  assert.equal(await readFile(join(root, 'canvas.json'), 'utf8'), '{"toonflowCanvas":true}')
  const foreign = await mkdtemp(join(tmpdir(), 'studybuddy-aigc-foreign-'))
  try {
    await symlink(foreign, join(root, 'foreign'), 'junction')
    assert.equal((await fetch(origin + '/api/workspaces/files/list?directory=' + encodeURIComponent(join(root, 'foreign')), { headers })).status, 403)
  } finally { await unlink(join(root, 'foreign')); await rm(foreign, { recursive: true, force: true }) }
  const video = await fetch(origin + '/api/ai/media/generate', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: root, mediaType: 'video', providerId: 'unconfigured', modelId: 'unconfigured', prompt: 'never dispatch' }) })
  const result = await video.json()
  assert.match(result.message, /AIGC_VIDEO_MODEL_NOT_CONFIGURED/)
  console.log(JSON.stringify({ checks: ['guest authentication', 'same origin admission', 'sharing denied', 'private catalog empty without grants', 'saved project bytes', 'junction denied', 'video unavailable without dispatch'] }))
} finally {
  child.stdin.end('{"type":"shutdown"}\n')
  const timer = setTimeout(() => child.kill(), 10000)
  await done; clearTimeout(timer)
  await rm(data, { recursive: true, force: true })
}
