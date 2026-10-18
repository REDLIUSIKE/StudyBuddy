/** Account domain provider and lifecycle consumer loaded only by a sealed dsh profile. */
import { Context } from '@deepseek-ai/cordis'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Readable, Writable } from 'node:stream'
import { z } from 'zod'
import type {} from '@deepseek-ai/dsh-cmdline'
import { AigcChannel } from './aigc-channel.ts'
import { CompiledAigcService } from './aigc-service.ts'
import type { AigcDomain, AigcDomainModule } from './aigc-service.ts'

const absolute = z.string().min(1).refine(isAbsolute)
export const Config = z.strictObject({ domainEntry: absolute, resourceDirectory: absolute, staticDirectory: absolute })
export type Config = z.infer<typeof Config>
export const inject = ['appReady', 'appExit']
const Bootstrap = z.strictObject({ dataDirectory: absolute, workspaceRoots: z.array(absolute).min(1).max(64), guestAuthorization: z.string().regex(/^[a-f0-9]{64}$/),
  gateway: z.strictObject({ origin: z.string().regex(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/), authorization: z.string().regex(/^[a-f0-9]{64}$/) }).optional() })

function moduleShape(value: unknown): value is AigcDomainModule { return !!value && typeof value === 'object' && 'createEmbeddedAigcDomain' in value && typeof value.createEmbeddedAigcDomain === 'function' }
function domainShape(value: unknown): value is AigcDomain { return !!value && typeof value === 'object' && ['start', 'invoke', 'close'].every(key => typeof Reflect.get(value, key) === 'function') }

export async function mountAigcPlugin(ctx: Context, config: Config, input: Readable, output: Writable): Promise<void> {
  config = Config.parse(config)
  const ready = ctx.get('appReady'), exit = ctx.get('appExit')
  if (!ready || !exit) throw Error('AIGC_LAUNCHER_REQUIRED')
  const lifetime = new AbortController()
  let domain: AigcDomain | undefined, service: CompiledAigcService | undefined, closing: Promise<void> | undefined
  let cancelReady = () => {}, exitRequested = false, exitCode = 0
  const stop = () => { cancelReady(); lifetime.abort(Error('AIGC_PLUGIN_STOPPED')); void channel.close().catch(() => {}) }
  const close = (): Promise<void> => {
    stop()
    return closing ??= (async () => {
      await startup.catch(() => {})
      await Promise.all([service ? service.close() : domain?.close(), channel.close()])
    })()
  }
  const requestExit = (failed: boolean): void => {
    exitCode = Math.max(exitCode, failed ? 1 : 0)
    if (exitRequested) return
    exitRequested = true; stop()
    void close().then(() => { exit(exitCode) }, () => { exit(1) })
  }
  const channel = new AigcChannel(input, output, requestExit)
  ctx.effect(() => close, 'aigc.domain-and-channel')
  ctx.on('internal/plugin', fiber => { if (fiber === ctx.fiber && fiber.uid === null) stop() }, { global: true })
  const startup = (async () => {
    const bootstrapValue = await channel.bootstrap
    const parsed = Bootstrap.safeParse(bootstrapValue)
    if (!parsed.success) throw Error('AIGC_BOOTSTRAP_INVALID')
    lifetime.signal.throwIfAborted()
    const module: unknown = await import(pathToFileURL(config.domainEntry).href)
    if (!moduleShape(module)) throw Error('AIGC_DOMAIN_MODULE_INVALID')
    lifetime.signal.throwIfAborted()
    const initialized: unknown = await module.createEmbeddedAigcDomain({ bootstrap: parsed.data,
      resourceDirectory: config.resourceDirectory, staticDirectory: config.staticDirectory, signal: lifetime.signal,
      native: (operation, input, signal) => channel.request(operation, input, signal) })
    if (!domainShape(initialized)) throw Error('AIGC_DOMAIN_MODULE_INVALID')
    domain = initialized; lifetime.signal.throwIfAborted()
    await ctx.plugin({ name: 'aigc-domain-provider', apply(provider: Context) { service = new CompiledAigcService(provider, initialized) } })
    lifetime.signal.throwIfAborted()
    await ctx.plugin({ name: 'aigc-lifecycle-consumer', inject: ['aigcDomain', 'appReady', 'appExit'], async apply(consumer: Context) {
      const { origin } = await consumer.aigcDomain.start(); lifetime.signal.throwIfAborted()
      const url = new URL(origin)
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin !== origin || !url.port || Number(url.port) > 65535) throw Error('AIGC_DOMAIN_ORIGIN_INVALID')
      channel.listen((input, signal) => consumer.aigcDomain.invoke(input, signal))
      cancelReady = ready.onReady(() => { if (!lifetime.signal.aborted) void channel.send({ type: 'ready', origin }).catch(() => { requestExit(true) }) })
    } })
  })()
  try { await startup } catch (error) {
    if (lifetime.signal.aborted) return
    requestExit(true); throw error
  }
}
export async function apply(ctx: Context, config: Config): Promise<void> { await mountAigcPlugin(ctx, config, process.stdin, process.stdout) }
