/** Anonymous public-source transport; private destinations fail closed. */
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant'
import { lookup as resolveAddresses } from 'node:dns'
import { isIP, type LookupFunction } from 'node:net'
import { request } from 'node:https'
/**
 * Reject local, reserved and transition addresses at the actual socket lookup.
 * @param address - DNS-resolved numeric address, never an arbitrary hostname.
 * @returns Whether the fixed public-source host may use this address.
 */
export function isPublicSkillSourceAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 6) {
    const first = Number.parseInt(address.split(':')[0]!, 16)
    return first >= 0x2000 && first <= 0x3fff && !/^2001:(?:0:|2:|db8:)|^2002:/i.test(address) && !address.includes('%')
  }
  if (family !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  return a !== undefined && b !== undefined && a > 0 && a < 224 && a !== 10 && a !== 127
    && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0))
    && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    && !(a === 203 && b === 0 && c === 113)
}
/**
 * Fetch a bounded anonymous response; redirects remain the source owner's decision.
 * @param url - Fixed skills.sh or GitHub API HTTPS location.
 * @param signal - Acquisition deadline and caller cancellation.
 * @param maxBytes - Maximum response bytes, including JSON wrappers.
 * @returns Public response without inherited credentials, proxies or cookies.
 */
export async function requestSkillSafetyPublic(url: URL, signal: AbortSignal, maxBytes: number): Promise<Response> {
  if (url.protocol !== 'https:' || !['api.github.com', 'skills.sh'].includes(url.hostname) || url.port || url.username || url.password) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
  const lookup: LookupFunction = (hostname, options, callback) => {
    resolveAddresses(hostname, { all: true }, (error, addresses) => {
      if (error) { callback(error, []); return }
      if (addresses.length === 0 || addresses.some(row => !isPublicSkillSourceAddress(row.address))) { callback(new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE'), []); return }
      const selected = addresses.find(row => !options.family || options.family === row.family)
      if (!selected) { callback(new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE'), []); return }
      if (options.all) callback(null, addresses)
      else callback(null, selected.address, selected.family)
    })
  }
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method: 'GET', signal, lookup, agent: false, headers: { accept: 'application/json', 'user-agent': 'StudyBuddy-Skill-Safety' } }, incoming => {
      let length = 0
      const chunks: Buffer[] = []
      incoming.on('data', (data: Buffer) => {
        length += data.length
        if (length > maxBytes) { incoming.destroy(new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')); return }
        chunks.push(data)
      })
      incoming.once('error', reject)
      incoming.once('end', () => {
        const headers = new Headers()
        for (const name of ['content-type', 'content-length', 'location']) { const value = incoming.headers[name]; if (typeof value === 'string') headers.set(name, value) }
        const status = incoming.statusCode ?? 502
        resolve(new Response([204, 304].includes(status) ? null : Uint8Array.from(Buffer.concat(chunks, length)), { status, headers }))
      })
    })
    outgoing.once('error', reject)
    outgoing.end()
  })
}
