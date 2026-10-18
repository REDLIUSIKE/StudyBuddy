/** Resolve the welcome bundle separately from shell-owned HTML and artwork. */
import { join } from 'node:path'
import { serveWebDocument } from '../web-document.ts'

export function serveStudyBuddyShellDocument(request: Request, appRoot: string): Promise<Response> {
  const url = new URL(request.url)
  const runtimePrefix = '/lib/welcome/'
  if (!url.pathname.startsWith(runtimePrefix)) return serveWebDocument(request, join(appRoot, 'renderer'))
  url.pathname = url.pathname.slice(runtimePrefix.length - 1)
  return serveWebDocument(new Request(url, { method: request.method, headers: request.headers, signal: request.signal }), join(appRoot, 'lib', 'welcome'))
}
