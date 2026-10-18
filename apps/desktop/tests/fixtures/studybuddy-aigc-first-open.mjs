/** Execute the actual Toonflow startup modules with a held, synthetic catalog. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [mode, sourceRoot] = process.argv.slice(2)
if (!sourceRoot) throw Error('FIXTURE_SOURCE_MISSING')
const pause = Promise.withResolvers()
const wait = () => new Promise(accept => setTimeout(accept, 200))
if (mode === 'gateway') {
  let requests = 0
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch() {
    requests++
    await pause.promise
    return Response.json([])
  } })
  const gateway = await import(pathToFileURL(resolve(sourceRoot, 'apps/server/src/utils/studyBuddy/gateway.ts')).href)
  let configured = false
  const configuring = gateway.configureGateway({ origin: server.url.origin, authorization: '1'.repeat(64) }).then(() => { configured = true })
  await wait()
  const before = { configured, requests }
  pause.resolve()
  await configuring
  await gateway.refreshGateway()
  const after = { requests, models: gateway.getStudyBuddyModels().length }
  server.stop(true)
  console.log(JSON.stringify({ before, after }))
} else if (mode === 'settings') {
  const { default: axios } = await import(Bun.resolveSync('axios', resolve(sourceRoot, 'apps/web')))
  const saved = JSON.stringify(['fixture-provider', 'fixture-model'])
  let catalogRequests = 0, saveRequests = 0
  axios.defaults.adapter = async config => {
    let data
    if (config.url === '/api/settings/get') data = { code: 200, data: { studyBuddyModelDefaults: { text: saved }, stores: { retained: 'original' } } }
    else if (config.url === '/api/ai/models') {
      catalogRequests++
      await pause.promise
      data = { code: 200, data: [{ providerId: 'fixture-provider', providerLabel: 'Synthetic personal source', modelId: 'fixture-model',
        label: 'Synthetic model', protocol: 'openai-completions', contextWindow: 8192, maxOutputTokens: 2048 }] }
    } else if (config.url === '/api/settings/save') { saveRequests++; throw Error('UNEXPECTED_SETTINGS_WRITE') }
    else throw Error('UNEXPECTED_REQUEST')
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  const settings = await import(pathToFileURL(resolve(sourceRoot, 'apps/web/src/stores/settings.ts')).href)
  let ready = false
  const loading = settings.loadSettings().then(() => { ready = true })
  await wait()
  const refreshing = settings.refreshStudyBuddyModels()
  await Promise.resolve()
  const before = { ready, catalogRequests, savedDefault: settings.settings.value.studyBuddyModelDefaults?.text,
    retained: settings.settings.value.stores?.retained }
  pause.resolve()
  await Promise.all([loading, refreshing])
  console.log(JSON.stringify({ before, after: { catalogRequests, saveRequests, choices: settings.modelChoices.value } }))
} else throw Error('FIXTURE_MODE_INVALID')
