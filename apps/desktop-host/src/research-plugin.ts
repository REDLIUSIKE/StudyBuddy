/** Cordis research provider and stdio consumer for Main's sealed dsh profile. */
import { Context } from '@deepseek-ai/cordis'
import type { Readable, Writable } from 'node:stream'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type {} from '@deepseek-ai/dsh-cmdline'
import { CompiledResearchService, type ResearchChannel, type ResearchDomain, type ResearchDomainModule } from './research-service.ts'

const absolutePath = z.string().min(1).refine(isAbsolute, 'Expected an absolute resource path')
/** Validated resource paths supplied by Main; credentials are never profile fields. */
export const Config = z.strictObject({ domainEntry: absolutePath, staticDirectory: absolutePath, pythonExecutable: absolutePath })
/** Validated deployment configuration for the built research plugin. */
export type Config = z.infer<typeof Config>
/** Launcher-owned services required before the research profile mounts. */
export const inject = ['appReady', 'appExit']

const Bootstrap = z.strictObject({
  projectsRoot: absolutePath,
  guestAuthorization: z.string().regex(/^[a-f0-9]{64}$/),
  toolAuthorization: z.string().regex(/^[a-f0-9]{64}$/),
})
const BOOTSTRAP_MAX_BYTES = 65_536

/** Stable failures reported without echoing the credential-bearing input line. */
export class ResearchPluginError extends Error {
  constructor(readonly code: 'RESEARCH_BOOTSTRAP_INVALID' | 'RESEARCH_PLUGIN_STOPPED' | 'RESEARCH_MODULE_INVALID' | 'RESEARCH_LAUNCHER_REQUIRED', cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = 'ResearchPluginError'
  }
}

function readBootstrap(input: Readable, signal: AbortSignal): Promise<z.infer<typeof Bootstrap>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0, settled = false
    const release = (): void => {
      input.off('readable', read)
      input.off('end', ended)
      input.off('error', failed)
      signal.removeEventListener('abort', cancelled)
    }
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      release()
      reject(error)
    }
    const cancelled = (): void => {
      const reason: unknown = signal.reason
      fail(reason instanceof Error ? reason : new ResearchPluginError('RESEARCH_PLUGIN_STOPPED'))
    }
    const ended = (): void => { fail(new ResearchPluginError('RESEARCH_PLUGIN_STOPPED')) }
    const failed = (): void => { fail(new ResearchPluginError('RESEARCH_BOOTSTRAP_INVALID')) }
    const read = (): void => {
      let bytes: unknown
      while (!settled && (bytes = input.read()) !== null) {
        if (!Buffer.isBuffer(bytes)) { failed(); return }
        const newline = bytes.indexOf(10)
        const head = newline < 0 ? bytes : bytes.subarray(0, newline)
        size += head.length
        if (size > BOOTSTRAP_MAX_BYTES) { failed(); return }
        chunks.push(head)
        if (newline < 0) continue
        let bootstrap: z.infer<typeof Bootstrap>
        try {
          const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
          bootstrap = Bootstrap.parse(value)
        } catch (error) {
          // Parser diagnostics can contain the credential line; only the stable code crosses stdout/stderr.
          void error
          failed()
          return
        }
        if (newline + 1 < bytes.length) input.unshift(bytes.subarray(newline + 1))
        settled = true
        release()
        resolve(bootstrap)
      }
    }
    input.on('readable', read)
    input.once('end', ended)
    input.once('error', failed)
    signal.addEventListener('abort', cancelled, { once: true })
    if (signal.aborted) cancelled()
    else if (input.readableEnded) ended()
    else read()
  })
}

function isDomainModule(value: unknown): value is ResearchDomainModule {
  return value !== null && typeof value === 'object'
    && 'createEmbeddedResearchDomain' in value && typeof value.createEmbeddedResearchDomain === 'function'
    && 'StdioNativeChannel' in value && typeof value.StdioNativeChannel === 'function'
}

function isDomain(value: unknown): value is ResearchDomain {
  return value !== null && typeof value === 'object'
    && 'app' in value && value.app !== null && typeof value.app === 'object'
    && 'start' in value && typeof value.start === 'function'
    && 'close' in value && typeof value.close === 'function'
}

/**
 * Mount the private stdio consumer and compiled research provider on one fiber.
 * EOF and I/O failure stop initialization, suppress readiness, await domain/Worker
 * cleanup, then release the channel and request launcher shutdown. Fiber disposal
 * cancels initialization immediately and joins the same cleanup. No operation is retried.
 * @param ctx - Owning plugin context with launcher readiness and exit services.
 * @param config - Absolute paths already admitted by Main's sealed profile.
 * @param input - Main's private stdin, beginning with exactly one bootstrap JSON line.
 * @param output - Existing private RPC stdout, also carrying the single ready message.
 * @returns After domain initialization and listen have completed, or cancellation settles.
 * @throws A startup failure after retaining cleanup ownership; malformed bootstrap omits parser text.
 */
export async function mountResearchPlugin(ctx: Context, config: Config, input: Readable, output: Writable): Promise<void> {
  config = Config.parse(config)
  const exit = ctx.get('appExit'), ready = ctx.get('appReady')
  if (exit === undefined || ready === undefined) throw new ResearchPluginError('RESEARCH_LAUNCHER_REQUIRED')
  const controller = new AbortController()
  const stopped = new ResearchPluginError('RESEARCH_PLUGIN_STOPPED')
  let domain: ResearchDomain | undefined, service: CompiledResearchService | undefined, channel: ResearchChannel | undefined
  let closing: Promise<void> | undefined
  let stopping = false, exitRequested = false, exitCode = 0
  let cancelReady = (): void => {}
  const markStopping = (): void => {
    stopping = true
    cancelReady()
    controller.abort(stopped)
  }
  const close = (): Promise<void> => {
    if (closing !== undefined) return closing
    markStopping()
    return closing = (async () => {
      // Startup's original rejection belongs to the plugin activation; cleanup still runs.
      await startup.then(() => {}, (_error: unknown) => {})
      const failures: unknown[] = []
      try {
        if (service !== undefined) await service.close()
        else await domain?.close()
      } catch (error) {
        failures.push(error)
      }
      try {
        channel?.close()
      } catch (error) {
        failures.push(error)
      } finally {
        input.pause()
        input.off('end', onEnd)
        input.off('error', onError)
        output.off('error', onError)
      }
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) throw new AggregateError(failures, 'RESEARCH_CLEANUP_FAILED')
    })()
  }
  const requestExit = (code: number): void => {
    exitCode = Math.max(exitCode, code)
    if (exitRequested) return
    exitRequested = true
    void close().then(() => { exit(exitCode) }, (error: unknown) => {
      ctx.logger.error('RESEARCH_CLEANUP_FAILED', error)
      exit(1)
    })
  }
  const onEnd = (): void => { requestExit(0) }
  const onError = (): void => { requestExit(1) }
  ctx.effect(() => {
    input.once('end', onEnd)
    input.on('error', onError)
    output.on('error', onError)
    return close
  }, 'research.domain-and-channel')
  // Cordis can dispose a LOADING fiber before its async apply has settled.
  ctx.on('internal/plugin', (fiber) => {
    if (fiber === ctx.fiber && fiber.uid === null) markStopping()
  }, { global: true })
  if (input.readableEnded) markStopping()
  const startup = (async () => {
    try {
      const bootstrap = await readBootstrap(input, controller.signal)
      controller.signal.throwIfAborted()
      const module: unknown = await import(pathToFileURL(config.domainEntry).href)
      controller.signal.throwIfAborted()
      if (!isDomainModule(module)) throw new ResearchPluginError('RESEARCH_MODULE_INVALID')
      channel = new module.StdioNativeChannel(input, output, onEnd)
      input.resume()
      const initialized: unknown = await module.createEmbeddedResearchDomain({ ...bootstrap, staticDirectory: config.staticDirectory,
        pythonExecutable: config.pythonExecutable, channel, signal: controller.signal })
      if (!isDomain(initialized)) throw new ResearchPluginError('RESEARCH_MODULE_INVALID')
      domain = initialized
      controller.signal.throwIfAborted()
      await ctx.plugin({
        name: 'research-domain-provider',
        apply(provider: Context) { service = new CompiledResearchService(provider, initialized) },
      })
      controller.signal.throwIfAborted()
      await ctx.plugin({
        name: 'research-lifecycle-consumer',
        inject: ['researchDomain', 'appReady', 'appExit'],
        async apply(consumer: Context) {
          const { origin } = await consumer.researchDomain.start()
          controller.signal.throwIfAborted()
          const address = new URL(origin)
          if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || address.origin !== origin
            || address.port === '' || address.username !== '' || address.password !== '') throw new ResearchPluginError('RESEARCH_MODULE_INVALID')
          consumer.effect(() => {
            cancelReady = ready.onReady(() => {
              if (stopping || !channel?.current()) return
              output.write(JSON.stringify({ type: 'ready', origin }) + '\n', (error) => { if (error) onError() })
            })
            return () => { cancelReady() }
          }, 'research.ready')
        },
      })
    } catch (error) {
      if (error === stopped) return
      requestExit(1)
      throw error
    }
  })()
  if (input.readableEnded) onEnd()
  await startup
}

/**
 * Load the built plugin under the ordinary dsh profile launcher.
 * @param ctx - Cordis plugin context with injected appReady and appExit.
 * @param config - Main's validated absolute resource paths.
 * @returns Initialization of the owned provider and private stdio consumer.
 */
export function apply(ctx: Context, config: Config): Promise<void> {
  return mountResearchPlugin(ctx, config, process.stdin, process.stdout)
}
