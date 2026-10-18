/** Replace Desktop JavaScript through the maintained ASAR streaming API, preserving runtime unpack flags. */
import { createRequire } from 'node:module'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { finished } from 'node:stream/promises'
import { Readable } from 'node:stream'

const appRoot = resolve(import.meta.dirname, '..')
const require = createRequire(join(appRoot, 'package.json'))
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const asar = builderRequire('@electron/asar')
const resources = join(appRoot, '.desktop-build/targets/win-x64/artifacts/win-unpacked/resources')
const source = join(resources, 'app.asar')
const work = 'E:/StudyBuddy-Release-Cache/installer-brand-20261014/main-closure-fix'
await mkdir(work, { recursive: true })
const dest = join(work, 'app.asar')
const original = asar.getRawHeader(source)
const originalPackage = JSON.parse(asar.extractFile(source, 'package.json').toString('utf8'))
const sourcePackage = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'))
originalPackage.dependencies = sourcePackage.dependencies
delete originalPackage.devDependencies
const replacements = new Map([
  ['lib/main.js', await readFile(join(appRoot, 'lib/main.js'))],
  ['package.json', Buffer.from(JSON.stringify(originalPackage))],
])
for (const file of await readdir(join(appRoot, 'lib'))) {
  if (file.endsWith('.js')) replacements.set('lib/' + file, await readFile(join(appRoot, 'lib', file)))
}
const streams = []
let files = 0
let unpacked = 0
const walk = (entries, prefix = '') => {
  for (const [name, entry] of Object.entries(entries)) {
    const path = prefix + name
    if (entry.files) {
      streams.push({ path, type: 'directory', unpacked: entry.unpacked })
      walk(entry.files, path + '/')
    } else if (entry.link) {
      streams.push({ path, type: 'link', symlink: entry.link, unpacked: entry.unpacked })
    } else {
      files++
      const bytes = replacements.get(path)
      if (entry.unpacked) unpacked++
      streams.push({ path, type: 'file', unpacked: entry.unpacked,
        stat: { size: bytes?.length ?? entry.size, mode: entry.executable ? 0o100755 : 0o100644 },
        streamGenerator: bytes ? () => Readable.from([bytes]) : entry.unpacked
          ? () => createReadStream(join(source + '.unpacked', path))
          : () => entry.size === 0 ? Readable.from([]) : createReadStream(source, {
            start: 8 + original.headerSize + Number(entry.offset),
            end: 8 + original.headerSize + Number(entry.offset) + entry.size - 1,
          }),
      })
    }
  }
}
walk(original.header.files)
for (const [path, bytes] of replacements) {
  if (path.startsWith('lib/') && !original.header.files.lib.files[path.slice(4)]) {
    streams.push({ path, type: 'file', unpacked: false,
      stat: { size: bytes.length, mode: 0o100644 }, streamGenerator: () => Readable.from([bytes]) })
  }
}
const output = await asar.createPackageFromStreams(dest, streams)
await finished(output)
await copyFile(source, join(work, 'app-before-closure-fix.asar'))
await copyFile(dest, source)
asar.uncache(source)
console.log(JSON.stringify({ status: 'DESKTOP_MAIN_CLOSURE_REBUILT', files, unpacked,
  bytes: (await stat(source)).size, retainedUnpackedRuntime: true }))
