/** Keyless compiled-domain fixture with real HTTP and stream ownership. */
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

let latest
export class StdioNativeChannel {
  live = true
  bytes = []
  constructor(input, output, shutdown) {
    this.input = input
    this.output = output
    this.read = bytes => {
      this.bytes.push(bytes)
      if (Buffer.concat(this.bytes).toString().includes('"shutdown"')) shutdown?.()
    }
    input.on('data', this.read)
  }
  current() { return this.live }
  async request() { return null }
  async *events() {}
  close() {
    if (!this.live) return
    this.live = false
    this.input.off('data', this.read)
    latest?.trace.push('channel-closed')
    latest?.save()
    if (latest?.scenario.channelCloseError) throw Error('FIXTURE_CHANNEL_CLOSE_FAILED')
  }
}

export async function createEmbeddedResearchDomain(options) {
  const scenario = JSON.parse(await readFile(join(options.staticDirectory, 'scenario.json'), 'utf8'))
  const trace = ['creating']
  const tracePath = join(options.staticDirectory, 'trace.json')
  const save = () => { writeFileSync(tracePath, JSON.stringify(trace)) }
  latest = { trace, save, scenario }
  await writeFile(tracePath, JSON.stringify(trace))
  if (scenario.createAfterAbort && !options.signal.aborted) {
    await new Promise(resolve => { options.signal.addEventListener('abort', resolve, { once: true }) })
  }
  if (scenario.createDelayMs) await delay(scenario.createDelayMs)
  const app = { trace, options }
  const server = createServer((_request, response) => {
    if (scenario.dispatchSigterm && _request.url === '/signal-term') {
      response.end('stopping')
      setImmediate(() => { process.emit('SIGTERM') })
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      projectsRoot: options.projectsRoot,
      staticDirectory: options.staticDirectory,
      pythonExecutable: options.pythonExecutable,
      guestAuthorization: options.guestAuthorization,
      toolAuthorization: options.toolAuthorization,
      received: Buffer.concat(options.channel.bytes).toString('utf8'),
    }))
  })
  let closed
  return {
    app,
    async start() {
      trace.push('starting')
      if (scenario.startDelayMs) await delay(scenario.startDelayMs)
      if (scenario.failStart) throw Error('FIXTURE_START_FAILED')
      await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve) })
      trace.push('started')
      return { origin: scenario.invalidOrigin ? 'https://example.invalid' : 'http://127.0.0.1:' + server.address().port }
    },
    close() {
      return closed ??= (async () => {
        trace.push('closing')
        if (scenario.closeDelayMs) await delay(scenario.closeDelayMs)
        server.closeAllConnections()
        if (server.listening) await new Promise(resolve => { server.close(resolve) })
        trace.push('closed')
        await writeFile(tracePath, JSON.stringify(trace))
      })()
    },
  }
}
