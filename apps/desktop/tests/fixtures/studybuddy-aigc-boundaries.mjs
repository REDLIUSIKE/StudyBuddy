import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const [source, check] = process.argv.slice(2)
const directory = await mkdtemp(join(tmpdir(), 'studybuddy-aigc-boundary-'))
const workspace = join(directory, 'workspace')
await mkdir(workspace)
process.env.STUDYBUDDY_EMBEDDED = '1'
try {
  if (check === 'routes') {
    const require = createRequire(pathToFileURL(resolve(source, 'apps/server/package.json')))
    const { default: express } = await import(pathToFileURL(require.resolve('express')).href)
    const policy = await import(pathToFileURL(resolve(source, 'apps/server/src/utils/studyBuddy/policy.ts')).href)
    const token = 'a'.repeat(64)
    await policy.configurePolicy(token, [workspace])
    const app = express()
    app.use(policy.authorize)
    app.all(/.*/, (_req, res) => res.json({ reached: true }))
    const server = app.listen(0, '127.0.0.1')
    await new Promise(accept => server.once('listening', accept))
    const origin = 'http://127.0.0.1:' + server.address().port
    policy.setAdmittedOrigin(origin)
    try {
      for (const path of ['/api/providers/debug/run', '/api/Providers/debug/run', '/api/PROVIDERS/debug/run/',
        '/api/tools/install', '/api/tools/install/', '/api/Tools/INSTALL/', '/api/ext/install/',
        '/api/nodes/install/', '/api/agents/connect/', '/api/mcp/control/events', '/MCP/',
        '/api/desktop/devtools/', '/api/ffmpeg/download/']) {
        const result = await fetch(origin + path, { headers: { 'X-StudyBuddy-Aigc-Guest': token } })
        assert.equal(result.status, 403, 'restricted route reached handler: ' + path)
      }
      for (const path of ['/', '/api/settings/get', '/api/workspaces/files/list', '/api/agent/get', '/api/ffmpeg/execute']) {
        const result = await fetch(origin + path, { headers: { 'X-StudyBuddy-Aigc-Guest': token } })
        assert.equal(result.status, 200, 'supported route was denied: ' + path)
      }
    } finally { await new Promise(accept => server.close(accept)) }
  } else if (check === 'ffmpeg') {
    const { createFfmpeg } = await import(pathToFileURL(resolve(source, 'packages/ffmpeg/src/runtime.ts')).href)
    const factory = createFfmpeg(workspace, { restricted: true })
    const foreign = join(directory, 'foreign.mp4')
    await writeFile(foreign, 'private sibling fixture')
    for (const configure of [
      command => command.inputOptions(['-i', foreign]),
      command => command.outputOptions(['-progress', foreign]),
      command => command.videoFilters('drawtext=textfile=' + foreign),
      command => command.complexFilter('movie=' + foreign + '[outside]'),
      command => command.inputFormat('concat'),
    ]) {
      assert.throws(() => configure(factory('clip.mp4').output('result.mp4'))._getArguments(), /AIGC_FFMPEG_OPERATION_DENIED/)
    }
    assert.throws(() => factory('files.ffconcat').output('result.mp4')._getArguments(), /AIGC_FFMPEG_OPERATION_DENIED/)
    assert.throws(() => factory('frames%03d.png').output('result.png')._getArguments(), /AIGC_FFMPEG_OPERATION_DENIED/)
    const args = factory('clip.mp4').seekInput(1).duration(2).size('320x240').videoCodec('libx264').output('result.mp4')._getArguments()
    assert.ok(args.includes('mov'), 'input demuxer must be fixed so renamed manifests cannot perform indirect I/O')
    assert.ok(args.includes('file'), 'input protocols must be restricted')
    assert.ok(args.includes(join(workspace, 'result.mp4')), 'ordinary editing must retain workspace output')
    const ffmpeg = resolve(source, 'build/bin/ffmpeg.exe'), ffprobe = resolve(source, 'build/bin/ffprobe.exe')
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=64x64:d=1', '-c:v', 'libx264', join(workspace, 'clip.mp4')], { windowsHide: true })
    factory.setFfmpegPath(ffmpeg); factory.setFfprobePath(ffprobe)
    await new Promise((accept, reject) => factory('clip.mp4').duration(0.5).size('32x32').videoCodec('libx264').output('result.mp4').on('end', accept).on('error', reject).run())
    const probe = await new Promise((accept, reject) => factory('result.mp4').ffprobe((error, data) => error ? reject(error) : accept(data)))
    assert.equal(probe.streams[0].width, 32, 'restricted ordinary transcode/probe failed')
  } else if (check === 'jobs') {
    const jobs = await import(pathToFileURL(resolve(source, 'apps/server/src/utils/studyBuddy/jobs.ts')).href).catch(() => null)
    assert.equal(typeof jobs?.runOwnedWork, 'function', 'shutdown does not own asynchronous work')
    let release, aborted = false, stopped = false
    const pending = jobs.runOwnedWork(undefined, async signal => {
      signal.addEventListener('abort', () => { aborted = true }, { once: true })
      await new Promise(accept => { release = accept })
    })
    const cleanup = jobs.stopOwnedWork().then(() => { stopped = true })
    await new Promise(accept => setImmediate(accept))
    assert.equal(aborted, true)
    assert.equal(stopped, false, 'shutdown returned before job cleanup')
    await assert.rejects(jobs.runOwnedWork(undefined, async () => {}), /AIGC_SCOPE_REVOKED/)
    release()
    await Promise.all([pending, cleanup])
    assert.equal(stopped, true)
  } else throw Error('unknown check')
  process.stdout.write(JSON.stringify({ check, passed: true, paidRequests: 0 }) + '\n')
} finally { await rm(directory, { recursive: true, force: true }) }
