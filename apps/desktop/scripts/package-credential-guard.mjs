/** Release payloads contain public runtime bytes, never developer credentials or user stores. */
import { createReadStream } from 'node:fs'
import { readdir, lstat } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { readAsar } from 'app-builder-lib/out/asar/asar.js'
import { createHash } from 'node:crypto'
import publicFixtures from './public-credential-fixtures.json' with { type: 'json' }

/** A path-only check also runs before private packages are admitted to the runtime. */
export function privatePayloadPathReason(name) {
  const parts = name.replaceAll('\\', '/').split('/')
  if (parts.some(part => /^(?:\.credentials\.ya?ml|credentials\.json|studybuddy-session\.json|\.npmrc)$/iu.test(part))) return 'private credential store'
  if (parts.some(part => /^(?:vault|user-data|accounts)$/iu.test(part))) return 'private account data'
  if (parts.some(part => /^\.env(?:\..*)?$/iu.test(part) && !/^\.env\.(?:example|sample|template)$/iu.test(part))) return 'private environment file'
  if (/\.(?:pfx|p12|key)$/iu.test(parts.at(-1) ?? '')) return 'private signing material'
  return undefined
}

const PLACEHOLDER = /(?:your[-_ ]|example|placeholder|replace[-_ ]|change[-_ ]|\$\{|<[^>]+>|\.{3}|^[A-Z][A-Z0-9_]*_(?:API_KEY|TOKEN|SECRET)$)/u
const TOKEN = /(?<![\w-])sk-(?:proj-|ant-api\d{2}-)?[A-Za-z0-9_-]{24,}/gu
const ASSIGNMENT = /["']?\b(?:apiKey|api_key|accessToken|refreshToken|clientSecret|(?:[A-Z][A-Z0-9_]*_)?API_KEY)\b["']?\s*[:=]\s*["']([^"'\r\n]{12,})["']/gu
// Only exact bytes from the integrity-verified upstream crypto fixtures may contain PEM samples.
function approvedPublicFixture(name, bytes) {
  const normalized = name.replaceAll('\\', '/')
  const match = Object.entries(publicFixtures.files).find(([path]) => normalized === path || normalized.endsWith('/' + path))
  return match !== undefined && createHash('sha256').update(bytes).digest('hex') === match[1]
}

/** Diagnostics name only a path and rule; credential bytes and source lines stay private. */
export function assertCredentialFreeText(name, bytes, credentialValues = []) {
  for (const value of credentialValues) {
    if (bytes.includes(Buffer.from(value)) || bytes.includes(Buffer.from(value, 'utf16le'))) throw new Error(`StudyBuddy package: credential bytes in ${name}`)
  }
  const text = bytes.toString('utf8')
  const packagePath = name.replaceAll('\\', '/').split(/(?:^|\/)node_modules\//u).at(-1)
  const firstParty = !name.replaceAll('\\', '/').includes('node_modules/')
    || /^@(?:deepseek-ai|studybuddy)\//u.test(packagePath)
  if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----(?:\s|\\[nr])+[A-Za-z0-9+/=]{32,}/u.test(text)
    && !approvedPublicFixture(name, bytes)) throw new Error(`StudyBuddy package: private key material in ${name}`)
  if (TOKEN.test(text)) { TOKEN.lastIndex = 0; throw new Error(`StudyBuddy package: literal API credential in ${name}`) }
  TOKEN.lastIndex = 0
  // Public dependencies contain OAuth examples and tests. Arbitrary literal-field
  // checks belong to our product code; known release secrets and API-key formats
  // above are checked across every dependency and binary without this distinction.
  if (firstParty) for (const match of text.matchAll(ASSIGNMENT)) if (!PLACEHOLDER.test(match[1])) throw new Error(`StudyBuddy package: literal credential assignment in ${name}`)
  if (/\.env\.(?:example|sample|template)$/iu.test(name)) {
    for (const line of text.split(/\r?\n/u)) {
      const match = /^\s*(?:export\s+)?([\w]*(?:KEY|SECRET|TOKEN|PASSWORD))\s*=\s*(.*?)\s*$/u.exec(line)
      const value = match?.[2]?.replace(/^(['"])(.*)\1$/u, '$2')
      if (value && !PLACEHOLDER.test(value)) throw new Error(`StudyBuddy package: populated credential template in ${name}`)
    }
  }
}

const TEXT = new Set(['.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.html', '.toml', '.txt', '.config', '.ini', '.pem', '.ps1', '.cmd', '.bat', '.sh'])
/** Scan copied resources and packed ASAR contents before release signing or upload. */
export async function assertCredentialFreePayload(directory, environment = {}) {
  const credentialValues = [...new Set(Object.entries(environment).filter(([name, value]) =>
    /(?:KEY|SECRET|TOKEN|PASSWORD|LICEN[CS]E)/iu.test(name) && !/(?:PUBLIC|THUMBPRINT|KEYCHAIN|KEY_FILE|KEY_PATH|KEY_ID)/iu.test(name)
      && typeof value === 'string' && value.length >= 16 && !PLACEHOLDER.test(value)).map(([, value]) => value))]
  const files = [], archives = []
  const assertPath = name => {
    const reason = privatePayloadPathReason(name)
    if (reason) throw new Error(`StudyBuddy package: ${reason} in ${name}`)
  }
  const walk = async parent => {
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const file = join(parent, entry.name), name = relative(directory, file).replaceAll('\\', '/')
      assertPath(name)
      if (entry.isSymbolicLink()) throw new Error(`StudyBuddy package: linked payload in ${name}`)
      if (entry.isDirectory()) await walk(file)
      else if (entry.isFile()) {
        if (entry.name.endsWith('.asar')) archives.push(file)
        else if (TEXT.has(extname(entry.name)) || entry.name.startsWith('.env.') || credentialValues.length > 0) files.push({ file, name })
      }
    }
  }
  const root = await lstat(directory)
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('StudyBuddy package: invalid credential audit root')
  await walk(directory)
  let filesScanned = 0, bytesScanned = 0, cursor = 0
  const overlap = Math.max(16_384, ...credentialValues.map(value => value.length * 2 + 4))
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (cursor < files.length) {
      const { file, name } = files[cursor++]
      const inspectText = TEXT.has(extname(name)) || /\.env\./u.test(name)
      let tail = Buffer.alloc(0)
      for await (const chunk of createReadStream(file, { highWaterMark: 256 * 1024 })) {
        bytesScanned += chunk.length
        const bytes = Buffer.concat([tail, chunk])
        if (inspectText) assertCredentialFreeText(name, bytes, credentialValues)
        else for (const value of credentialValues) if (bytes.includes(Buffer.from(value)) || bytes.includes(Buffer.from(value, 'utf16le'))) throw new Error(`StudyBuddy package: credential bytes in ${name}`)
        tail = bytes.subarray(Math.max(0, bytes.length - overlap))
      }
      filesScanned++
    }
  }))
  for (const file of archives) {
    const archive = await readAsar(file)
    const inspect = async (node, prefix = '') => {
      for (const [part, child] of Object.entries(node.files ?? {})) {
        const name = prefix + part
        assertPath(name)
        if (child.link) throw new Error(`StudyBuddy package: linked archive payload in ${name}`)
        if (child.files) await inspect(child, name + '/')
        else if (!child.unpacked && (TEXT.has(extname(name)) || credentialValues.length > 0)) {
          const bytes = await archive.readFile(name.split('/').join(sep))
          assertCredentialFreeText('app.asar/' + name, bytes, credentialValues)
          filesScanned++; bytesScanned += bytes.length
        }
      }
    }
    await inspect(archive.header)
  }
  return { filesScanned, bytesScanned, credentialValuesChecked: credentialValues.length }
}
