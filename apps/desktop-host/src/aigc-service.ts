/** Definition and provider for the account-owned compiled AIGC domain. */
import { Context, Service } from '@deepseek-ai/cordis'

export type AigcNativeOperation = 'question' | 'temporary' | 'budget'
export interface AigcDomain {
  start(): Promise<{ origin: string }>
  invoke(input: unknown, signal: AbortSignal): Promise<unknown>
  close(): Promise<void>
}
export interface AigcDomainOptions {
  bootstrap: unknown
  resourceDirectory: string
  staticDirectory: string
  signal: AbortSignal
  native(operation: AigcNativeOperation, input: unknown, signal: AbortSignal): Promise<unknown>
}
export interface AigcDomainModule { createEmbeddedAigcDomain(options: AigcDomainOptions): Promise<AigcDomain> }
declare module '@deepseek-ai/cordis' { interface Context { aigcDomain: AigcService } }
export abstract class AigcService extends Service implements AigcDomain {
  abstract start(): Promise<{ origin: string }>
  abstract invoke(input: unknown, signal: AbortSignal): Promise<unknown>
  abstract close(): Promise<void>
}
export class CompiledAigcService extends AigcService {
  private starting?: Promise<{ origin: string }>
  private closing?: Promise<void>
  constructor(ctx: Context, private readonly domain: AigcDomain) { super(ctx, 'aigcDomain') }
  start(): Promise<{ origin: string }> {
    if (this.closing) return Promise.reject(Error('AIGC_DOMAIN_CLOSED'))
    return this.starting ??= this.domain.start()
  }
  invoke(input: unknown, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    return this.closing ? Promise.reject(Error('AIGC_DOMAIN_CLOSED')) : this.domain.invoke(input, signal)
  }
  close(): Promise<void> { return this.closing ??= this.domain.close() }
}
