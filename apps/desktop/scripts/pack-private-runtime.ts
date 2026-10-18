/** Pack private first-party runtime workspaces locally without changing npm publication membership. */
import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, globSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import * as yaml from 'js-yaml'
import { capture, pnpmCommand } from '../../../scripts/release/process.ts'
import { packedManifest, tarballFiles } from '../../../scripts/release/tarball.ts'
import { validateTarballPayload } from '../../../scripts/publication-payload.ts'
import { DESKTOP_HOST_PACKAGE } from '../src/core-package-set.ts'
import { resolveDesktopTargetBuildPaths, resolveDesktopBuildTarget, desktopTargetPlatform } from './desktop-build-paths.mjs'
import { privatePayloadPathReason } from './package-credential-guard.mjs'

const ROOTS = ['@deepseek-ai/dsh', DESKTOP_HOST_PACKAGE]
const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..')

/** Source metadata; this is not a packed artifact or publication record. */
export interface PrivateRuntimeSource {
  readonly directory: string
  readonly name: string
  readonly version: string
  readonly manifest: Readonly<Record<string, unknown>>
}

/** Exact bytes of one validated local private package. */
export interface PrivateRuntimeTarball {
  readonly name: string
  readonly version: string
  readonly tarball: string
  readonly bytes: number
  readonly sha256: string
  readonly files: readonly string[]
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`private runtime: invalid ${context}`)
  return value as Record<string, unknown>
}

function dependencies(manifest: Readonly<Record<string, unknown>>, section: string): Record<string, string> {
  if (manifest[section] === undefined) return {}
  const entries = object(manifest[section], `${String(manifest.name)} ${section}`)
  for (const value of Object.values(entries)) if (typeof value !== 'string') throw new Error(`private runtime: invalid ${section}`)
  return entries as Record<string, string>
}

function matchesPlatform(manifest: Readonly<Record<string, unknown>>, field: string, actual: string): boolean {
  const value = manifest[field]
  if (value === undefined) return true
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`private runtime: invalid ${field}`)
  if (value.includes(`!${actual}`)) return false
  const positives = value.filter(item => !item.startsWith('!'))
  return positives.length === 0 || positives.includes(actual) || positives.includes('any')
}

/**
 * Select private workspaces reachable from the installed CLI and Host; omit the already packed Host.
 * @param repositoryRoot Canonical source checkout, or an owned fixture workspace.
 * @param target Platform and architecture of the application being assembled.
 * @returns Private production/peer closure in deterministic name order; missing workspace edges reject.
 */
export function selectPrivateDesktopRuntimePackages(
  repositoryRoot: string,
  target: { readonly platform: string; readonly arch: string },
): PrivateRuntimeSource[] {
  const workspace = object(yaml.load(readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')), 'workspace')
  const patterns = workspace.packages
  if (!Array.isArray(patterns) || patterns.length === 0 || patterns.some(item => typeof item !== 'string')) throw new Error('private runtime: invalid workspace packages')
  const packages = new Map<string, PrivateRuntimeSource>()
  for (const file of globSync(patterns.map(pattern => `${pattern}/package.json`), { cwd: repositoryRoot })) {
    const path = join(repositoryRoot, file)
    if (lstatSync(path).isSymbolicLink()) throw new Error('private runtime: linked package manifest')
    const manifest = object(JSON.parse(readFileSync(path, 'utf8')), file)
    const { name, version } = manifest
    if (typeof name !== 'string' || typeof version !== 'string' || !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name) || !/^[a-zA-Z0-9.+_-]+$/u.test(version)) throw new Error(`private runtime: invalid package identity ${file}`)
    if (packages.has(name)) throw new Error(`private runtime: duplicate source package ${name}`)
    packages.set(name, { directory: resolve(path, '..'), name, version, manifest })
  }
  const selected = new Map<string, PrivateRuntimeSource>()
  const visit = (name: string, optional: boolean): void => {
    if (selected.has(name)) return
    const source = packages.get(name)
    if (source === undefined) throw new Error(`private runtime: missing workspace ${name}`)
    if (!matchesPlatform(source.manifest, 'os', target.platform) || !matchesPlatform(source.manifest, 'cpu', target.arch)) {
      if (optional) return
      throw new Error(`private runtime: required workspace ${name} is incompatible with ${target.platform}-${target.arch}`)
    }
    selected.set(name, source)
    for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [dependency, version] of Object.entries(dependencies(source.manifest, section))) {
        if (packages.has(dependency)) visit(dependency, section === 'optionalDependencies')
        else if (version.startsWith('workspace:')) throw new Error(`private runtime: ${name} requires missing workspace ${dependency}`)
      }
    }
  }
  for (const name of ROOTS) visit(name, false)
  return [...selected.values()].filter(source => source.manifest.private === true && source.name !== DESKTOP_HOST_PACKAGE)
    .sort((left, right) => left.name.localeCompare(right.name))
}

function runtimeExports(value: unknown): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('./src/')) return []
    if (value.includes('*')) throw new Error(`private runtime: unsupported runtime wildcard export ${value}; declare verified concrete entries`)
    return [value]
  }
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(runtimeExports)
}

/**
 * Reject private/development payloads and missing published entry files in the actual tarball.
 * @param manifest Tarball's own manifest, not the source manifest.
 * @param files Members read from the tarball.
 * @returns Nothing; identity, data, source/map or export omissions throw before the package is admitted.
 */
export function validatePrivateRuntimePayload(manifest: Readonly<Record<string, unknown>>, files: readonly string[]): void {
  if (manifest.private !== true) throw new Error(`private runtime: ${String(manifest.name)} lost private status`)
  validateTarballPayload(files, String(manifest.name))
  for (const file of files) if (privatePayloadPathReason(file)) throw new Error(`private runtime: private payload in ${file}`)
  for (const file of files) {
    const parts = file.replace(/\/$/u, '').split('/')
    if (parts[0] !== 'package' || parts.some(part => part === '..' || part === '.' || part.includes('\\')) ||
      parts.some(part => /^(?:accounts|projects|logs|vault|user-data|node_modules)$/iu.test(part)) ||
      parts.some(part => /^(?:\.env(?:\..*)?|\.npmrc|studybuddy-session\.json|credentials\.json)$/iu.test(part)) ||
      /\.(?:pem|pfx|p12|key)$/iu.test(file)) throw new Error(`private runtime: forbidden payload ${file}`)
  }
  const required = runtimeExports(manifest.exports)
  for (const field of ['main', 'types']) if (typeof manifest[field] === 'string') required.push(manifest[field])
  const available = new Set(files)
  for (const file of required) {
    const name = `package/${file.replace(/^\.\//u, '')}`
    if (!available.has(name)) throw new Error(`private runtime: ${String(manifest.name)} omits ${file}`)
  }
}

/**
 * Pack the selected private workspaces into local Desktop inputs with lifecycle scripts disabled.
 * @param repositoryRoot Source checkout whose private dependency closure is selected.
 * @param output Local tarball input directory; existing unlike bytes are never overwritten.
 * @param target Installed application's platform and architecture.
 * @returns Exact package identities and content digests; validation failure prevents later package assembly.
 */
export function packPrivateDesktopRuntime(
  repositoryRoot: string, output: string, target: { readonly platform: string; readonly arch: string },
): PrivateRuntimeTarball[] {
  const sources = selectPrivateDesktopRuntimePackages(repositoryRoot, target)
  mkdirSync(output, { recursive: true })
  const stage = mkdtempSync(join(output, 'private-runtime-'))
  const [command, ...leading] = pnpmCommand()
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/iu.test(name)))
  try {
    return sources.map((source) => {
      const tarball = join(stage, 'package.tgz')
      capture(command, [...leading, '--dir', source.directory, '--config.ignore-scripts=true', 'pack', '--out', tarball], { cwd: repositoryRoot, env })
      const manifest = packedManifest(tarball)
      if (manifest.name !== source.name || manifest.version !== source.version) throw new Error(`private runtime: changed packed identity ${source.name}`)
      const files = tarballFiles(tarball)
      validatePrivateRuntimePayload(manifest, files)
      const patterns = source.manifest.files
      if (patterns !== undefined && (!Array.isArray(patterns) || patterns.some(pattern => typeof pattern !== 'string'))) throw new Error(`private runtime: invalid files ${source.name}`)
      for (const pattern of patterns ?? []) {
        if (typeof pattern !== 'string' || !pattern.startsWith('assets/')) continue
        const assets = globSync(pattern, { cwd: source.directory }).filter(file => lstatSync(join(source.directory, file)).isFile())
        if (assets.length === 0 || assets.some(file => !files.includes(`package/${file.replaceAll('\\', '/')}`))) throw new Error(`private runtime: ${source.name} omits Skill assets`)
      }
      const bytes = readFileSync(tarball)
      const file = `${source.name.replace(/^@/u, '').replaceAll('/', '-')}-${source.version}.tgz`
      const destination = join(output, basename(file))
      if (existsSync(destination)) {
        if (!readFileSync(destination).equals(bytes)) throw new Error(`private runtime: stale local input ${file}`)
      } else copyFileSync(tarball, destination, constants.COPYFILE_EXCL)
      rmSync(tarball)
      return { name: source.name, version: source.version, tarball: destination, bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'), files }
    })
  } finally { rmSync(stage, { recursive: true, force: true }) }
}

function main(): void {
  const { values } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: false })
  const target = resolveDesktopBuildTarget()
  const output = values.out === undefined ? resolveDesktopTargetBuildPaths().packedDsh : resolve(values.out)
  const packages = packPrivateDesktopRuntime(REPOSITORY_ROOT, output, desktopTargetPlatform(target))
  console.log(JSON.stringify({ privateRuntimePackages: packages }))
}

if (import.meta.main) main()
