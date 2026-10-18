/** Materialize the reviewed compiled research closure against Desktop's shared runtime. */
import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { isBuiltin } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { createResearchSharedIntegrity, verifyResearchSharedIntegrity } from '../../apps/desktop/src/studybuddy/research-shared-integrity.ts'

const repository = 'https://github.com/K-Dense-AI/k-dense-byok.git'
const upstreamCommit = '44c52cee8e9fdc343c6132909769f49accf14a82'
const nodeVersion = '24.21.0'
const pythonVersion = '3.12.14'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const sharedGeneratorPath = fileURLToPath(new URL('../../apps/desktop/src/studybuddy/research-shared-integrity.ts', import.meta.url))
const parserPath = fileURLToPath(import.meta.resolve('typescript'))

function exportTarget(value, conditions) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) { const result = exportTarget(item, conditions); if (result) return result }
  } else if (value && typeof value === 'object') {
    for (const [condition, item] of Object.entries(value)) if (condition === 'default' || conditions.has(condition)) {
      const result = exportTarget(item, conditions); if (result) return result
    }
  }
}

function packageExport(metadata, subpath, mode) {
  const conditions = new Set(['node', mode])
  if (metadata.exports !== undefined) {
    const exports = metadata.exports
    if (typeof exports === 'object' && exports && !Array.isArray(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
      if (Object.hasOwn(exports, subpath)) return exportTarget(exports[subpath], conditions)
      const patterns = Object.keys(exports).filter(key => key.includes('*')).sort((a, b) => b.length - a.length)
      for (const pattern of patterns) {
        const [before, after] = pattern.split('*')
        if (subpath.startsWith(before) && subpath.endsWith(after)) {
          const target = exportTarget(exports[pattern], conditions)
          if (target) return target.replaceAll('*', subpath.slice(before.length, subpath.length - after.length))
        }
      }
      return
    }
    if (subpath === '.') return exportTarget(exports, conditions)
    return
  }
  return subpath === '.' ? metadata.main ?? 'index.js' : subpath.slice(2)
}

async function existing(path) {
  return lstat(path).catch(error => { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return; throw error })
}

async function moduleFile(path) {
  for (const candidate of [path, path + '.js', path + '.json', path + '.node', join(path, 'index.js')]) {
    if ((await existing(candidate))?.isFile()) return candidate
  }
  throw Error('RESEARCH_SHARED_CLOSURE_MISSING: ' + path)
}

// The boot optimization loads only these five Node internals; its bridge must not escape.
function reviewedInternalBuiltinBridge(node, parsed) {
  const argument = node.arguments[0], arrow = node.parent, property = arrow?.parent, object = property?.parent
  if (!ts.isIdentifier(argument) || argument.text !== 'moduleId' || !ts.isArrowFunction(arrow) || arrow.body !== node ||
    arrow.parameters.length !== 1 || arrow.parameters[0].name.getText(parsed) !== 'moduleId' ||
    !ts.isPropertyAssignment(property) || property.name.getText(parsed) !== 'requireBuiltin' ||
    !ts.isObjectLiteralExpression(object) || object.properties.length !== 1) return false
  const conditional = object.parent, declaration = conditional?.parent
  const normalized = value => value.getText(parsed).replace(/\s+/gu, '').replaceAll('"', "'")
  if (!ts.isConditionalExpression(conditional) || conditional.whenTrue !== object ||
    normalized(conditional.condition) !== "process.execArgv.includes('--expose-internals')" ||
    normalized(conditional.whenFalse) !== "require('node-addon-require-builtin')" ||
    !ts.isVariableDeclaration(declaration) || declaration.name.getText(parsed) !== 'builtins' ||
    !(declaration.parent.flags & ts.NodeFlags.Const)) return false
  let owner = declaration.parent
  while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent
  if (owner?.name?.text !== 'internalModules' || !owner.body) return false
  const requires = owner.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
    .filter(row => ts.isIdentifier(row.name) && row.name.text === 'require')
  if (requires.length !== 1 || !requires[0].initializer || normalized(requires[0].initializer) !== 'createRequire(import.meta.url)' ||
    !(requires[0].parent.flags & ts.NodeFlags.Const)) return false
  const expected = new Set(['internal/modules/esm/loader', 'internal/modules/cjs/loader', 'internal/modules/helpers',
    'internal/modules/esm/utils', 'internal/modules/esm/resolve'])
  const calls = [], visit = current => {
    if (ts.isIdentifier(current) && current.text === 'builtins' && current !== declaration.name) {
      const access = current.parent, call = access.parent
      if (!ts.isPropertyAccessExpression(access) || access.expression !== current || access.name.text !== 'requireBuiltin' ||
        !ts.isCallExpression(call) || call.expression !== access || call.arguments.length !== 1 || !ts.isStringLiteralLike(call.arguments[0])) calls.push(null)
      else calls.push(call.arguments[0].text)
    }
    ts.forEachChild(current, visit)
  }
  visit(owner.body)
  return calls.length === 5 && new Set(calls).size === 5 && calls.every(value => expected.has(value))
}

function importRows(bytes, path) {
  const parsed = ts.createSourceFile(path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  if (parsed.parseDiagnostics.length) throw Error('RESEARCH_SHARED_CLOSURE_INVALID: ' + path)
  const imports = [], dynamic = [], internalBuiltinOffsets = new Set()
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.push({ specifier: node.moduleSpecifier.text, mode: 'import' })
    }
    if (ts.isCallExpression(node)) {
      const call = node.expression, argument = node.arguments[0]
      const mode = call.kind === ts.SyntaxKind.ImportKeyword ? 'import' : ts.isIdentifier(call) && call.text === 'require' ? 'require' : undefined
      if (mode && argument) {
        if (ts.isStringLiteralLike(argument)) {
          let cursor = node.parent, command
          while (cursor) {
            if (ts.isCaseClause(cursor) && ts.isStringLiteralLike(cursor.expression) &&
              ts.isSwitchStatement(cursor.parent.parent) && cursor.parent.parent.expression.getText(parsed) === 'invocation.mode') {
              command = cursor.expression.text; break
            }
            cursor = cursor.parent
          }
          imports.push({ specifier: argument.text, mode, command })
        }
        else {
          dynamic.push({ mode, expression: argument.getText(parsed), offset: node.pos })
          if (mode === 'require' && reviewedInternalBuiltinBridge(node, parsed)) internalBuiltinOffsets.add(node.pos)
        }
      }
      if (ts.isPropertyAccessExpression(call) && call.name.text === 'import' && argument && ts.isStringLiteralLike(argument)) {
        imports.push({ specifier: argument.text, mode: 'import' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return { imports, dynamic, internalBuiltinOffsets }
}

/** Discover actual compiled imports, with conservative package runtime roots for their data and internal variants. */
export async function discoverResearchDshScopes(dshDirectory, profile = 'research') {
  if (!['research', 'aigc'].includes(profile)) throw Error('SHARED_PROFILE_INVALID')
  const pluginEntry = `lib/${profile}-plugin.js`
  const scopes = new Map(), pending = [], seen = new Set(), dynamicImports = [], excludedCommands = [], inputs = new Map(), resolutions = new Map()
  const nativeResolutions = new Map()
  const dynamicCounts = new Map()
  const packageName = specifier => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
  async function admit(physical, name, parentScope) {
    const candidates = [join(dshDirectory, 'node_modules', name)]
    if (parentScope) {
      let cursor = join(dshDirectory, parentScope.path)
      for (;;) {
        candidates.push(join(cursor, 'node_modules', name))
        if (resolve(cursor) === resolve(dshDirectory)) break
        const parent = dirname(cursor)
        if (!contained(resolve(dshDirectory), parent)) break
        cursor = parent
      }
    }
    let portable
    for (const candidate of candidates) if (await existing(candidate) && resolve(await realpath(candidate)) === resolve(physical)) {
      portable = relative(dshDirectory, candidate).split(sep).join('/'); break
    }
    if (!portable) throw Error('RESEARCH_SHARED_CLOSURE_NOT_PORTABLE: ' + name)
    admittedRelative(portable)
    if (scopes.has(portable)) return scopes.get(portable)
    const raw = await readFile(join(physical, 'package.json')), metadata = JSON.parse(raw.toString('utf8'))
    inputs.set(portable + '/package.json', { path: portable + '/package.json', size: raw.length, sha256: sha(raw) })
    if (metadata.name !== name) throw Error('RESEARCH_SHARED_CLOSURE_INVALID')
    const workspace = name.startsWith('@deepseek-ai/') && metadata.private === true ||
      Object.values(metadata.dependencies ?? {}).some(version => typeof version === 'string' && version.startsWith('workspace:')) ||
      typeof metadata.repository?.url === 'string' && metadata.repository.url.includes('deepseek-harness')
    let entries
    if (name === '@deepseek-ai/dsh-desktop-host') entries = ['package.json', pluginEntry]
    else if (name === '@deepseek-ai/dsh') entries = ['package.json', 'lib']
    else if (workspace && Array.isArray(metadata.files)) {
      entries = ['package.json', ...metadata.files.map(value => value.split('/')[0]).filter(value => value && !/[*!?{}[\]]/.test(value))]
      for (const entry of await readdir(physical)) if (/^(?:LICEN[CS]E|NOTICE|COPYING)(?:\.|$)/i.test(entry)) entries.push(entry)
    } else entries = (await readdir(physical)).filter(value => value !== 'node_modules' && value !== '.git')
    entries = [...new Set(entries)].sort()
    for (const entry of entries) if (!await existing(join(physical, entry))) throw Error('RESEARCH_SHARED_CLOSURE_MISSING')
    const scope = { packageName: name, path: portable, entries, physical, metadata, workspace }
    scopes.set(portable, scope)
    if (!['@deepseek-ai/dsh', '@deepseek-ai/dsh-desktop-host'].includes(name)) {
      for (const dependency of Object.keys(metadata.dependencies ?? {})) await follow(dependency, join(physical, 'package.json'), scope, 'import')
      for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) {
        if (await locate(dependency, join(physical, 'package.json'))) await follow(dependency, join(physical, 'package.json'), scope, 'import')
      }
    }
    return scope
  }
  async function locate(specifier, importer) {
    const name = packageName(specifier)
    let cursor = dirname(importer)
    for (;;) {
      const candidate = join(cursor, 'node_modules', name)
      if (await existing(candidate)) return { name, physical: await realpath(candidate) }
      const parent = dirname(cursor)
      if (parent === cursor) return
      cursor = parent
    }
  }
  async function follow(specifier, importer, parentScope, mode) {
    if (isBuiltin(specifier)) return
    if (specifier.startsWith('.')) {
      const path = await moduleFile(resolve(dirname(importer), specifier))
      if (!contained(parentScope.physical, path)) throw Error('RESEARCH_SHARED_CLOSURE_INVALID')
      nativeResolutions.set(importer + '\0' + specifier + '\0' + mode, { importer, specifier, mode, target: path })
      pending.push({ path, scope: parentScope }); return
    }
    if (specifier.startsWith('#') || isAbsolute(specifier) || specifier.includes(':')) throw Error('RESEARCH_SHARED_CLOSURE_INVALID')
    const located = await locate(specifier, importer)
    if (!located) throw Error('RESEARCH_SHARED_CLOSURE_MISSING: ' + specifier)
    const scope = await admit(located.physical, located.name, parentScope)
    const from = parentScope.path + '/' + relative(parentScope.physical, importer).split(sep).join('/')
    const resolution = { from, packageName: located.name, to: scope.path }, key = from + '\0' + located.name
    if (resolutions.has(key) && !same(resolutions.get(key), resolution)) throw Error('RESEARCH_SHARED_CLOSURE_INVALID')
    resolutions.set(key, resolution)
    const subpath = specifier === located.name ? '.' : '.' + specifier.slice(located.name.length)
    const target = packageExport(scope.metadata, subpath, mode)
    if (!target || target.startsWith('../') || isAbsolute(target)) throw Error('RESEARCH_SHARED_CLOSURE_MISSING: ' + specifier)
    const path = await moduleFile(resolve(scope.physical, target))
    if (!contained(scope.physical, path)) throw Error('RESEARCH_SHARED_CLOSURE_INVALID')
    nativeResolutions.set(importer + '\0' + specifier + '\0' + mode, { importer, specifier, mode, target: path })
    pending.push({ path, scope })
  }
  for (const [name, entry] of [['@deepseek-ai/dsh', 'lib/bin.js'], ['@deepseek-ai/dsh-desktop-host', pluginEntry]]) {
    const scope = await admit(await realpath(join(dshDirectory, 'node_modules', name)), name)
    pending.push({ path: join(scope.physical, entry), scope })
  }
  while (pending.length) {
    const { path, scope } = pending.shift()
    if (seen.has(path) || !/\.[cm]?js$/.test(path)) continue
    seen.add(path)
    const bytes = await readFile(path), rows = importRows(bytes, path)
    const inputPath = scope.path + '/' + relative(scope.physical, path).split(sep).join('/')
    inputs.set(inputPath, { path: inputPath, size: bytes.length, sha256: sha(bytes) })
    for (const row of rows.imports) {
      if (scope.packageName === '@deepseek-ai/dsh' && relative(scope.physical, path).split(sep).join('/') === 'lib/bin.js' &&
        ['plugin', 'dump-config', 'dump-config-schema'].includes(row.command)) {
        excludedCommands.push({ path: scope.path + '/lib/bin.js', sha256: sha(bytes), ...row }); continue
      }
      await follow(row.specifier, path, scope, row.mode)
    }
    for (const row of rows.dynamic) {
      const relativePath = relative(scope.physical, path).split(sep).join('/')
      const policies = {
        '@deepseek-ai/dsh-desktop-host': ['pathToFileURL(config.domainEntry).href', '__rewriteRelativeImportExtension(pathToFileURL(config.domainEntry).href)'],
        '@deepseek-ai/dsh-app-boot': ['this.filename'],
        '@deepseek-ai/cordis-plugin-include': ['__rewriteRelativeImportExtension(\n\t\t\t\tthis.filename\n)'],
        '@deepseek-ai/cordis-plugin-loader': ['id', '__rewriteRelativeImportExtension(\n\t\t\t\tnew URL(name, this.ctx.baseUrl).href\n)', '__rewriteRelativeImportExtension(\n\t\t\t\tname\n)'],
        'node-addon-native-custom-loader': ["node_path_1.default.join(packageDir, 'package.json')", "node_path_1.default.join(packageDir, 'prebuilds.json')", 'loadPath', 'candidate.request'],
      }
      const normalized = value => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')
      const admittedFile = scope.packageName === '@deepseek-ai/dsh-desktop-host' ? pluginEntry : 'lib/index.js'
      const key = scope.packageName + '/' + relativePath + ':' + row.mode + ':' + normalized(row.expression)
      const count = (dynamicCounts.get(key) ?? 0) + 1
      dynamicCounts.set(key, count)
      const maximum = scope.packageName === 'node-addon-native-custom-loader' &&
        ['loadPath', normalized("node_path_1.default.join(packageDir, 'package.json')")].includes(normalized(row.expression)) ? 2 : 1
      const internalBuiltinBridge = scope.packageName === '@deepseek-ai/dsh-app-boot' && row.mode === 'require' && rows.internalBuiltinOffsets.has(row.offset)
      if (relativePath !== admittedFile || count > maximum || !internalBuiltinBridge && !policies[scope.packageName]?.some(value => normalized(value) === normalized(row.expression))) throw Error('RESEARCH_SHARED_DYNAMIC_IMPORT_UNREVIEWED: ' + scope.packageName + '/' + relativePath + ' ' + row.expression)
      dynamicImports.push({ packageName: scope.packageName, path: scope.path + '/' + relativePath, sha256: sha(bytes), ...row })
    }
  }
  // Node itself confirms every import/require condition and extension selection.
  // Resolution does not import or execute the selected modules.
  const queries = [...nativeResolutions.values()]
  const nativeScript = `import {readFileSync} from 'node:fs'; import {createRequire} from 'node:module'; import {fileURLToPath,pathToFileURL} from 'node:url'; const rows=JSON.parse(readFileSync(0,'utf8')); console.log(JSON.stringify(rows.map(row=>row.mode==='require'?createRequire(pathToFileURL(row.importer)).resolve(row.specifier):fileURLToPath(import.meta.resolve(row.specifier,pathToFileURL(row.importer).href)))));`
  const resolved = JSON.parse(execFileSync(process.execPath, ['--experimental-import-meta-resolve', '--input-type=module', '--eval', nativeScript], {
    input: JSON.stringify(queries), encoding: 'utf8', windowsHide: true,
  }))
  if (!Array.isArray(resolved) || resolved.length !== queries.length || resolved.some((path, index) => resolve(path) !== resolve(queries[index].target))) throw Error('RESEARCH_SHARED_CLOSURE_RESOLUTION_MISMATCH')
  return { scopes: [...scopes.values()].map(({ packageName, path, entries }) => ({ packageName, path, entries })).sort((a, b) => a.path.localeCompare(b.path)), inputs: [...inputs.values()].sort((a, b) => a.path.localeCompare(b.path)), resolutions: [...resolutions.values()], dynamicImports, excludedCommands }
}

async function regularPath(value) {
  let cursor = resolve(value)
  for (;;) {
    const info = await lstat(cursor).catch(error => { if (error.code === 'ENOENT') return; throw error })
    if (info?.isSymbolicLink()) throw Error('RESEARCH_RUNTIME_PATH_DENIED')
    const parent = dirname(cursor)
    if (parent === cursor) return
    cursor = parent
  }
}

function admittedRelative(name) {
  if (typeof name !== 'string' || name.includes('\\') || name.includes(':') || /[\x00-\x1f]/.test(name) ||
    name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error('RESEARCH_RUNTIME_PATH_DENIED')
  return name
}

function contained(root, target) {
  const name = relative(root, target)
  return name !== '' && name !== '..' && !name.startsWith('..' + sep) && !isAbsolute(name)
}

function separate(left, right) {
  if (left === right || contained(left, right) || contained(right, left)) throw Error('RESEARCH_RUNTIME_PATH_DENIED')
}

function sourceName(name) {
  admittedRelative(name)
  if (/(^|\/)\.env($|\.(?!example$|template$))/.test(name) || /^(projects|\.git|node_modules)\//.test(name)) throw Error('RESEARCH_RUNTIME_SOURCE_INVALID')
}

function runtimeName(name) {
  admittedRelative(name)
  if (/^(?:bin|source|web\/node_modules|web\/\.next)(?:\/|$)/.test(name) || /(?:^|\/)(?:src|\.next|\.git)(?:\/|$)/.test(name) ||
    /(?:^|\/)node(?:\.exe)?$/i.test(name) || /\.map$/.test(name) || /(?:^|\/)\.env(?:\.|$)/.test(name) ||
    /(?:^|\/)node_modules\/(?:next|@next\/[^/]+|tsx|@earendil-works\/pi-(?:coding-agent|agent-core|ai))(?:\/|$)/.test(name) ||
    ['server/embedded.js', 'server/embedded-entry.js', 'server/embedded-entry.mjs'].includes(name)) throw Error('RESEARCH_FORBIDDEN_RESOURCE')
}

async function fileBytes(path, missingCode) {
  await regularPath(path)
  const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') throw Error(missingCode); throw error })
  if (!info.isFile() || info.isSymbolicLink()) throw Error('RESEARCH_RUNTIME_PATH_DENIED')
  return readFile(path)
}

async function inventory(root, prefix = '') {
  await regularPath(join(root, prefix))
  const rows = []
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = prefix + item.name
    admittedRelative(name)
    if (item.isSymbolicLink()) throw Error('RESEARCH_RUNTIME_PATH_DENIED')
    if (item.isDirectory()) rows.push(...await inventory(root, name + '/'))
    else if (item.isFile()) {
      const bytes = await fileBytes(join(root, name), 'RESEARCH_BUILD_OUTPUT_MISMATCH')
      rows.push({ path: name, size: bytes.length, sha256: sha(bytes) })
    }
    else throw Error('RESEARCH_RUNTIME_PATH_DENIED')
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path))
}

async function sourceIdentity(sourceDirectory) {
  const git = args => execFileSync('git', ['-C', sourceDirectory, ...args], { encoding: 'utf8', windowsHide: true }).trim()
  if (git(['remote', 'get-url', 'origin']) !== repository) throw Error('RESEARCH_RUNTIME_SOURCE_INVALID')
  git(['merge-base', '--is-ancestor', upstreamCommit, 'HEAD'])
  const names = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort()
  if (!names.length || new Set(names).size !== names.length) throw Error('RESEARCH_RUNTIME_SOURCE_INVALID')
  const hash = createHash('sha256')
  for (const name of names) {
    sourceName(name)
    hash.update(name).update('\0').update(await fileBytes(join(sourceDirectory, name), 'RESEARCH_RUNTIME_SOURCE_INVALID')).update('\0')
  }
  const locks = [await fileBytes(join(sourceDirectory, 'server/package-lock.json'), 'RESEARCH_RUNTIME_SOURCE_INVALID'), await fileBytes(join(sourceDirectory, 'web/package-lock.json'), 'RESEARCH_RUNTIME_SOURCE_INVALID')]
  const sourceCommit = git(['rev-parse', 'HEAD'])
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw Error('RESEARCH_RUNTIME_SOURCE_INVALID')
  return { sourceCommit, sourceDigest: hash.digest('hex'), lockDigest: sha(Buffer.concat(locks)), names }
}

async function sharedIdentity(primaryRuntimeDirectory, dshDirectory) {
  const fail = 'RESEARCH_SHARED_RUNTIME_MISMATCH'
  const runtimeBytes = await fileBytes(join(primaryRuntimeDirectory, 'runtime.json'), fail)
  let runtime
  try { runtime = JSON.parse(runtimeBytes.toString('utf8')) } catch (error) { throw Error(fail, { cause: error }) }
  if (!runtime || runtime.node !== nodeVersion || runtime.python !== pythonVersion || !digest(runtime.payloadDigest) || runtime.platform !== process.platform || runtime.arch !== process.arch) throw Error(fail)
  const node = join(primaryRuntimeDirectory, 'dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node')
  const nodeBytes = await fileBytes(node, fail)
  const python = join(primaryRuntimeDirectory, 'dependencies/python', process.platform === 'win32' ? 'python.exe' : 'bin/python3')
  const pythonBytes = await fileBytes(python, fail)
  if (execFileSync(node, ['--version'], { encoding: 'utf8', windowsHide: true }).trim() !== 'v' + nodeVersion) throw Error(fail)
  const snapshots = [{ path: 'runtime.json', sha256: sha(runtimeBytes) }]
  const packages = []
  // Main may select a development dsh installation whose package directories
  // are workspace links. Their exact launcher/plugin bytes are pinned, not copied.
  for (const name of ['dsh', 'dsh-desktop-host']) {
    const root = join(dshDirectory, 'node_modules/@deepseek-ai', name)
    const bytes = await readFile(join(root, 'package.json')).catch(error => { throw Error(fail, { cause: error }) })
    let value
    try { value = JSON.parse(bytes.toString('utf8')) } catch (error) { throw Error(fail, { cause: error }) }
    if (!value || value.name !== '@deepseek-ai/' + name || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value.version)) throw Error(fail)
    packages.push(value)
    snapshots.push({ path: name + '/package.json', sha256: sha(bytes) })
  }
  if (packages[0].version !== packages[1].version) throw Error(fail)
  const hashes = []
  for (const path of ['node_modules/@deepseek-ai/dsh/lib/bin.js', 'node_modules/@deepseek-ai/dsh-desktop-host/lib/research-plugin.js']) {
    const target = join(dshDirectory, path)
    const info = await lstat(target).catch(error => { throw Error(fail, { cause: error }) })
    if (!info.isFile() || info.isSymbolicLink()) throw Error(fail)
    hashes.push(sha(await readFile(target)))
  }
  return { identity: { nodeVersion, pythonVersion, payloadDigest: runtime.payloadDigest, nodeSha256: sha(nodeBytes), pythonSha256: sha(pythonBytes), dshVersion: packages[0].version, dshEntrySha256: hashes[0], hostPluginSha256: hashes[1] }, snapshots }
}

function proofRows(values) {
  if (!Array.isArray(values) || !values.length) throw Error('RESEARCH_BUILD_PROOF_INVALID')
  const seen = new Set()
  return values.map(value => {
    if (!value || typeof value !== 'object') throw Error('RESEARCH_BUILD_PROOF_INVALID')
    admittedRelative(value.path)
    const size = value.size ?? value.bytes
    const key = process.platform === 'win32' ? value.path.toLowerCase() : value.path
    if (!Number.isSafeInteger(size) || size < 0 || !digest(value.sha256) || seen.has(key) || value.size !== undefined && value.bytes !== undefined && value.size !== value.bytes) throw Error('RESEARCH_BUILD_PROOF_INVALID')
    seen.add(key)
    return { path: value.path, size, sha256: value.sha256 }
  }).sort((left, right) => left.path.localeCompare(right.path))
}

async function verifyInputs(inputs, code) {
  for (const row of inputs) {
    const bytes = await fileBytes(row.absolute, code)
    if (bytes.length !== row.size || sha(bytes) !== row.sha256) throw Error(code)
  }
}

async function verifyDebug(debug, code) {
  const actual = await inventory(debug.directory).catch(error => {
    if (error.code === 'ENOENT' || error.message === 'RESEARCH_BUILD_OUTPUT_MISMATCH') throw Error(code)
    throw error
  })
  if (!same(actual, debug.files)) throw Error(code)
  for (const row of debug.files) {
    const bytes = await fileBytes(join(debug.directory, row.path), code)
    let map
    try { map = JSON.parse(bytes.toString('utf8')) } catch (error) { throw Error('RESEARCH_DEBUG_MAP_INVALID', { cause: error }) }
    if (!map || map.version !== 3 || !Array.isArray(map.sources) || !map.sources.length ||
      map.sources.some(source => typeof source !== 'string' || !source) || typeof map.mappings !== 'string' ||
      map.sourcesContent !== undefined && (!Array.isArray(map.sourcesContent) || map.sourcesContent.length !== map.sources.length ||
        map.sourcesContent.some(content => content !== null && typeof content !== 'string'))) throw Error('RESEARCH_DEBUG_MAP_INVALID')
  }
}

async function reviewedDebug(sourceDirectory, profile, proof, productionPaths) {
  if (!proof.debug || typeof proof.debug !== 'object' || !Array.isArray(proof.debug.files) || !proof.debug.files.length) throw Error('RESEARCH_DEBUG_PROOF_INVALID')
  if (proof.debug.directory !== 'dist-embedded.debug') throw Error('RESEARCH_RUNTIME_PATH_DENIED')
  const files = proofRows(proof.debug.files)
  for (const row of files) if (!/\.(?:[cm]?js|css)\.map$/.test(row.path) || !productionPaths.has(row.path.slice(0, -4))) throw Error('RESEARCH_DEBUG_PROOF_INVALID')
  const debug = { directory: join(sourceDirectory, profile, proof.debug.directory), files }
  await verifyDebug(debug, 'RESEARCH_DEBUG_OUTPUT_MISMATCH')
  return debug
}

async function reviewedBuild(sourceDirectory, profile, identity) {
  const proofPath = join(sourceDirectory, profile, 'dist-embedded.build.json')
  const bytes = await fileBytes(proofPath, 'RESEARCH_BUILD_PROOF_MISSING')
  let proof
  try { proof = JSON.parse(bytes.toString('utf8')) } catch (error) { throw Error('RESEARCH_BUILD_PROOF_INVALID', { cause: error }) }
  const server = profile === 'server'
  if (!proof || proof.schemaVersion !== 1 || proof.kind !== `studybuddy-research-${profile}-build` || proof.inputBase !== (server ? '.' : 'web') ||
    proof.sourceDigestKind !== (server ? 'canonical-git' : 'inputs-json') || !digest(proof.sourceDigest) || !Array.isArray(proof.inputs) || !proof.inputs.length) throw Error('RESEARCH_BUILD_PROOF_INVALID')
  if (server && (!digest(proof.buildSha256) || proof.sourceCommit !== identity.sourceCommit || proof.sourceDigest !== identity.sourceDigest || proof.lockDigest !== identity.lockDigest)) throw Error('RESEARCH_BUILD_INPUT_MISMATCH')
  if (!server && (proof.profile !== 'studybuddy' || proof.entry !== 'index.html' || proof.nodeVersion !== 'v' + nodeVersion || proof.sourceDigest !== sha(JSON.stringify(proof.inputs)))) throw Error('RESEARCH_BUILD_PROOF_INVALID')
  const inputBase = server ? sourceDirectory : join(sourceDirectory, 'web'), seen = new Set(), inputs = []
  for (const input of proof.inputs) {
    if (!input || typeof input.path !== 'string' || isAbsolute(input.path) || input.path.includes('\\') || input.path.includes(':') || /[\x00-\x1f]/.test(input.path)) throw Error('RESEARCH_RUNTIME_PATH_DENIED')
    const absolute = resolve(inputBase, input.path)
    if (!contained(sourceDirectory, absolute)) throw Error('RESEARCH_RUNTIME_PATH_DENIED')
    const path = relative(sourceDirectory, absolute).split(sep).join('/')
    sourceName(path)
    const size = input.size ?? input.bytes, key = process.platform === 'win32' ? path.toLowerCase() : path
    if (seen.has(key) || !Number.isSafeInteger(size) || size < 0 || !digest(input.sha256) || input.size !== undefined && input.bytes !== undefined && input.size !== input.bytes) throw Error('RESEARCH_BUILD_PROOF_INVALID')
    seen.add(key); inputs.push({ path, absolute, size, sha256: input.sha256 })
  }
  for (const path of [`${profile}/package.json`, `${profile}/package-lock.json`, ...(!server ? ['web/embedded.html', 'web/src/embedded-main.tsx', 'web/vite.embedded.config.ts'] : [])]) if (!seen.has(process.platform === 'win32' ? path.toLowerCase() : path)) throw Error('RESEARCH_BUILD_PROOF_INVALID')
  await verifyInputs(inputs, 'RESEARCH_BUILD_INPUT_MISMATCH')
  const files = proofRows(proof.files)
  for (const row of files) runtimeName(profile + '/' + row.path)
  const paths = new Set(files.map(row => row.path))
  if (!paths.has(server ? 'research-domain.mjs' : 'index.html')) throw Error('RESEARCH_BUILD_CLOSURE_MISSING')
  if (server) {
    if (!proof.closure || !Array.isArray(proof.closure.requiredFiles) || !proof.closure.requiredFiles.length) throw Error('RESEARCH_BUILD_CLOSURE_MISSING')
    for (const path of proof.closure.requiredFiles) if (!paths.has(admittedRelative(path))) throw Error('RESEARCH_BUILD_CLOSURE_MISSING')
  }
  const directory = join(sourceDirectory, profile, 'dist-embedded')
  await regularPath(directory)
  if (!same(await inventory(directory), files)) throw Error('RESEARCH_BUILD_OUTPUT_MISMATCH')
  const debug = await reviewedDebug(sourceDirectory, profile, proof, paths)
  return { profile, directory, proofPath, bytes, files, inputs, debug, inputDigest: proof.sourceDigest }
}

async function copyResource(source, destination) {
  await regularPath(source); await regularPath(destination)
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { errorOnExist: true, force: false })
}

/** Copy the exact reviewed server/static outputs; never launch an account or paid service.
 * @param options - Canonical source, new immutable candidate and Main-selected shared runtime directories.
 * @returns Existing manifest/source/lock pins for review; this function never activates them. */
export async function prepareResearchRuntime({ sourceDirectory, outputDirectory, primaryRuntimeDirectory, dshDirectory, debugDirectory, workspaceDirectory }) {
  if (![sourceDirectory, outputDirectory, primaryRuntimeDirectory, dshDirectory].every(value => typeof value === 'string' && isAbsolute(value)) || [debugDirectory, workspaceDirectory].some(value => value !== undefined && (typeof value !== 'string' || !isAbsolute(value)))) throw Error('RESEARCH_RUNTIME_INPUT_MISSING')
  for (const path of [sourceDirectory, outputDirectory, primaryRuntimeDirectory, dshDirectory, ...(debugDirectory ? [debugDirectory] : [])]) await regularPath(path)
  if (/\.asar(?:[\\/]|$)/.test(dshDirectory)) throw Error('RESEARCH_SHARED_RUNTIME_MISMATCH')
  for (const input of [sourceDirectory, primaryRuntimeDirectory, dshDirectory]) separate(resolve(outputDirectory), resolve(input))
  if (debugDirectory) for (const input of [sourceDirectory, outputDirectory, primaryRuntimeDirectory, dshDirectory]) separate(resolve(debugDirectory), resolve(input))
  for (const path of [outputDirectory, ...(debugDirectory ? [debugDirectory] : [])]) if (await lstat(path).catch(error => { if (error.code === 'ENOENT') return; throw error })) throw Error('RESEARCH_RUNTIME_ALREADY_EXISTS')
  const assemblerPath = fileURLToPath(import.meta.url), assemblerSha256 = sha(await readFile(assemblerPath))
  const generatorSha256 = sha(await readFile(sharedGeneratorPath)), parserSha256 = sha(await readFile(parserPath))
  const identity = await sourceIdentity(sourceDirectory), shared = await sharedIdentity(primaryRuntimeDirectory, dshDirectory)
  const sharedSnapshot = structuredClone(shared)
  const dshClosure = await discoverResearchDshScopes(dshDirectory)
  shared.identity.integrity = await createResearchSharedIntegrity({ primaryRuntimeDirectory, dshDirectory }, {
    dshScopes: dshClosure.scopes, dshResolutions: dshClosure.resolutions, generatorSha256, workspaceDirectory,
  })
  const sharedRows = new Map(shared.identity.integrity.dsh.files.map(row => [row.path, row]))
  for (const input of dshClosure.inputs) if (!same(input, sharedRows.get(input.path))) throw Error('RESEARCH_SHARED_INTEGRITY_INPUT_CHANGED')
  const builds = []
  for (const profile of ['server', 'web']) builds.push(await reviewedBuild(sourceDirectory, profile, identity))
  await mkdir(outputDirectory, { recursive: false })
  if (debugDirectory) await mkdir(debugDirectory, { recursive: false })
  const expected = [], expectedDebug = []
  for (const name of identity.names.filter(name => /^(?:LICENSE|NOTICE)(?:\.[^/]+)?$/i.test(name))) {
    await copyResource(join(sourceDirectory, name), join(outputDirectory, name))
    const bytes = await fileBytes(join(sourceDirectory, name), 'RESEARCH_BUILD_INPUT_CHANGED')
    expected.push({ path: name, size: bytes.length, sha256: sha(bytes) })
  }
  if (!expected.length) throw Error('RESEARCH_BUILD_CLOSURE_MISSING')
  for (const build of builds) {
    for (const row of build.files) {
      await copyResource(join(build.directory, row.path), join(outputDirectory, build.profile, row.path))
      expected.push({ ...row, path: build.profile + '/' + row.path })
    }
    const path = `build/${build.profile}.build.json`
    await mkdir(join(outputDirectory, 'build'), { recursive: true })
    await writeFile(join(outputDirectory, path), build.bytes, { flag: 'wx' })
    expected.push({ path, size: build.bytes.length, sha256: sha(build.bytes) })
    if (debugDirectory) {
      for (const row of build.debug.files) {
        await copyResource(join(build.debug.directory, row.path), join(debugDirectory, build.profile, row.path))
        expectedDebug.push({ ...row, path: build.profile + '/' + row.path })
      }
      const path = `${build.profile}.build.json`
      await writeFile(join(debugDirectory, path), build.bytes, { flag: 'wx' })
      expectedDebug.push({ path, size: build.bytes.length, sha256: sha(build.bytes) })
    }
  }
  const after = await sourceIdentity(sourceDirectory)
  for (const key of ['sourceCommit', 'sourceDigest', 'lockDigest']) if (after[key] !== identity[key]) throw Error('RESEARCH_BUILD_INPUT_CHANGED')
  for (const build of builds) {
    if (sha(await fileBytes(build.proofPath, 'RESEARCH_BUILD_OUTPUT_CHANGED')) !== sha(build.bytes)) throw Error('RESEARCH_BUILD_OUTPUT_CHANGED')
    await verifyInputs(build.inputs, 'RESEARCH_BUILD_INPUT_CHANGED')
    if (!same(await inventory(build.directory), build.files)) throw Error('RESEARCH_BUILD_OUTPUT_CHANGED')
    await verifyDebug(build.debug, 'RESEARCH_DEBUG_OUTPUT_CHANGED')
  }
  if (!same(await sharedIdentity(primaryRuntimeDirectory, dshDirectory), sharedSnapshot)) throw Error('RESEARCH_SHARED_RUNTIME_MISMATCH')
  await verifyResearchSharedIntegrity(shared.identity.integrity, { primaryRuntimeDirectory, dshDirectory }, { workspaceDirectory })
  if (sha(await readFile(assemblerPath)) !== assemblerSha256) throw Error('RESEARCH_BUILD_INPUT_CHANGED')
  if (sha(await readFile(sharedGeneratorPath)) !== generatorSha256 || sha(await readFile(parserPath)) !== parserSha256) throw Error('RESEARCH_BUILD_INPUT_CHANGED')
  const files = await inventory(outputDirectory)
  if (!same(files, expected.sort((left, right) => left.path.localeCompare(right.path)))) throw Error('RESEARCH_BUILD_OUTPUT_CHANGED')
  for (const row of files) runtimeName(row.path)
  const debugFiles = debugDirectory ? await inventory(debugDirectory) : undefined
  if (debugFiles && !same(debugFiles, expectedDebug.sort((left, right) => left.path.localeCompare(right.path)))) throw Error('RESEARCH_DEBUG_OUTPUT_CHANGED')
  const { sourceCommit, sourceDigest, lockDigest } = identity
  const manifest = { schemaVersion: 2, kind: 'studybuddy-research-plugin', profile: 'studybuddy-research', entry: 'server/research-domain.mjs', staticEntry: 'web/index.html', platform: process.platform, arch: process.arch,
    upstream: { repository, commit: upstreamCommit }, sourceCommit, sourceDigest, lockDigest, sharedRuntime: shared.identity,
    build: { assemblerSha256, serverBuildSha256: sha(builds[0].bytes), webBuildSha256: sha(builds[1].bytes) },
    closure: { ...Object.fromEntries(builds.map(build => [build.profile, { proof: `build/${build.profile}.build.json`, sourceDigestKind: build.profile === 'server' ? 'canonical-git' : 'inputs-json', inputDigest: build.inputDigest }])), sharedDsh: { parserSha256, dynamicImports: dshClosure.dynamicImports, excludedCommands: dshClosure.excludedCommands } }, files }
  const encoded = JSON.stringify(manifest, null, 2) + '\n'
  if (debugDirectory) await writeFile(join(debugDirectory, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, kind: 'studybuddy-research-debug', productionManifestSha256: sha(encoded), sourceCommit, sourceDigest, lockDigest,
    build: manifest.build, files: debugFiles,
  }, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(outputDirectory, 'manifest.json'), encoded, { flag: 'wx' })
  return { manifestSha256: sha(encoded), sourceCommit, sourceDigest, lockDigest }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [sourceDirectory, outputDirectory, primaryRuntimeDirectory, dshDirectory, debugDirectory, workspaceDirectory] = process.argv.slice(2)
  process.stdout.write(JSON.stringify(await prepareResearchRuntime({ sourceDirectory, outputDirectory, primaryRuntimeDirectory, dshDirectory, debugDirectory, workspaceDirectory })) + '\n')
}
