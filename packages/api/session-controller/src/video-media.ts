/** Seekable video responses over the same authenticated, policy-owned filesystem as other file previews. */
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'

const CHUNK_BYTES = 64 * 1024

/** Serve a video without loading the complete export into Host or renderer memory. */
export async function serveVideo(request: Request, fs: FileSystem, target: FsTarget, headers: Record<string, string>): Promise<Response> {
  const fail = (status: number): Response => new Response(null, { status, headers })
  if (!headers['Content-Type']?.startsWith('video/')) return fail(415)
  const info = await fs.stat(target, request.signal)
  if (info === undefined) return fail(404)
  if (info.type !== 'file') return fail(403)
  const size = info.size
  if (size === undefined || !Number.isSafeInteger(size) || size < 0) return fail(409)
  headers = { ...headers, 'Accept-Ranges': 'bytes' }
  let start = 0, end = size - 1, status = 200
  const range = request.headers.get('range')
  if (range !== null && request.method !== 'HEAD') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    const unsatisfied = (): Response => new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    if (!match || !match[1] && !match[2]) return unsatisfied()
    if (match[1]) {
      start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    } else {
      const suffix = Number(match[2])
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return unsatisfied()
      start = Math.max(0, size - suffix)
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return unsatisfied()
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    status = 206
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1))
  if (request.method === 'HEAD') return new Response(null, { headers })
  const lifetime = new AbortController()
  const signal = AbortSignal.any([request.signal, lifetime.signal])
  let offset = start
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted()
        if (offset > end) { controller.close(); return }
        const length = Math.min(CHUNK_BYTES, end - offset + 1)
        const data = await fs.readByteRange(target, { offset, length }, signal)
        signal.throwIfAborted()
        if (data.length === 0 || data.length > length) throw new Error('Video file changed during playback')
        offset += data.length
        controller.enqueue(data)
        if (offset > end) controller.close()
      } catch (error) { controller.error(error) }
    },
    cancel(reason) { lifetime.abort(reason) },
  })
  return new Response(body, { status, headers })
}
