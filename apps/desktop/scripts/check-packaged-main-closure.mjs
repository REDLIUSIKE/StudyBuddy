/** Resolve the complete main-process import closure against the actual ASAR, including dynamic chunks. */
import { createRequire, isBuiltin } from 'node:module'
import { join, normalize, posix, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
const root = resolve(import.meta.dirname, '..')
const require = createRequire(join(root, 'package.json'))
const asar = createRequire(require.resolve('app-builder-lib/package.json'))('@electron/asar')
const exportsResolve = createRequire(require.resolve('vite/package.json'))('resolve.exports').resolve
const ts = createRequire(join(root, '../../package.json'))('typescript')
const archive = join(root, '.desktop-build/targets/win-x64/artifacts/win-unpacked/resources/app.asar')
const exists = name => { try { return !asar.statFile(archive, normalize(name)).files } catch { return false } }
const json = name => JSON.parse(asar.extractFile(archive, normalize(name)).toString('utf8'))
const seen = new Set()
const missing = []
const optional = []
const queue = ['lib/main.js']
function file(name) {
  return [name, name + '.js', name + '.cjs', name + '.mjs', name + '/index.js'].find(exists)
}
function moduleTarget(name, importer, commonjs) {
  if (name === 'electron' || isBuiltin(name)) return undefined
  if (name.startsWith('.')) return file(posix.normalize(posix.join(posix.dirname(importer), name))) ?? null
  const parts = name.split('/')
  const pkg = name.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  const subpath = name.slice(pkg.length)
  let dir = posix.dirname(importer)
  for (;;) {
    const base = posix.join(dir === '.' ? '' : dir, 'node_modules', pkg)
    if (exists(base + '/package.json')) {
      const manifest = json(base + '/package.json')
      if (manifest.exports) {
        try {
          const targets = exportsResolve(manifest, subpath ? '.' + subpath : '.', { require: commonjs })
          return targets?.map(target => file(posix.join(base, target))).find(Boolean) ?? null
        } catch { return null }
      }
      return file(posix.join(base, subpath || manifest.main || 'index.js')) ?? null
    }
    if (dir === '.') break
    dir = posix.dirname(dir)
  }
  let caller = posix.dirname(importer)
  for (;;) {
    if (exists(caller + '/package.json')) {
      const manifest = json(caller + '/package.json')
      if (manifest.optionalDependencies?.[pkg] || manifest.peerDependenciesMeta?.[pkg]?.optional) {
        optional.push({ importer, name }); return undefined
      }
      break
    }
    if (caller === '.') break
    caller = posix.dirname(caller)
  }
  return null
}
while (queue.length) {
  const importer = queue.shift()
  if (seen.has(importer)) continue
  seen.add(importer)
  if (!/\.[cm]?js$/u.test(importer)) continue
  const parsed = ts.createSourceFile(importer, asar.extractFile(archive, normalize(importer)).toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const consume = (name, commonjs = false, node = undefined) => {
    const target = moduleTarget(name, importer, commonjs)
    let parent = node?.parent
    let caught = false
    while (parent) {
      if (ts.isTryStatement(parent) && parent.catchClause && node.pos >= parent.tryBlock.pos && node.end <= parent.tryBlock.end) caught = true
      parent = parent.parent
    }
    if (target === null && caught) optional.push({ importer, name, reason: 'caught-optional-require' })
    else if (target === null) missing.push({ importer, name })
    else if (target) queue.push(target)
  }
  const walk = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) consume(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) consume(node.arguments[0].text)
      else if (ts.isIdentifier(node.expression) && /^(?:require|__require)$/u.test(node.expression.text)) consume(node.arguments[0].text, true, node)
    }
    ts.forEachChild(node, walk)
  }
  walk(parsed)
}
const receipt = { checkedAt: new Date().toISOString(), archive, checkedModules: seen.size, missing, optional }
await writeFile(join(root, '../../../output/studybuddy-installer-brand-20261014/main-closure-check.json'), JSON.stringify(receipt, null, 2) + '\n')
console.log(JSON.stringify(receipt))
if (missing.length) process.exitCode = 1
