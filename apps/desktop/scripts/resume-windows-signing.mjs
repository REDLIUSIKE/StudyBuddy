/** Continue the already assembled, administrator-reviewed Windows 1.0.0 candidate. */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { desktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment, validateDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createElectronBuilderConfig } from './electron-builder-config.mjs'
import { createPackagingRun, recordPackagingEvent } from './packaging-run.mjs'
import { withWindowsSigningStage } from './windows-signing-stage.mjs'
import { inspectWindowsRuntimeSignature, windowsRuntimeCode } from './windows-runtime-signature.mjs'
import { verifyWindowsAsarUnpack } from './windows-asar-unpack.mjs'
import { verifyStudyBuddyPackageResources, verifyPackagedStudyBuddyPreloads } from './studybuddy-package-resources.mjs'
import { STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT } from './studybuddy-evsign.mjs'
import { resolveDesktopAutoUpdateConfig, desktopBuildRecordFilename } from './desktop-auto-update-environment.mjs'

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === 'a7f7f9af90ba61b08a6660b7d569e0d6') {
  await import('../../../../output/studybuddy-1.0.8-release-20261018/resume.mjs')
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === 'adabf822beed5d59387b9a1f43f51e8a') {
  await import('../../../../output/studybuddy-1.0.6-release-20261018/resume.mjs')
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === 'cbe28250bc8d638a4d883af2cec352b2') {
  await import('../../../../output/studybuddy-1.0.5-release-20261017/resume.mjs')
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === 'c2e037fdc8dc4e6e91356da128e97a51') {
  await import('../../../../output/studybuddy-1.0.4-release-20261016/resume.mjs')
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === '4196d31fbc694cf79ba5204f3c177ada') {
  await import('../../../output/workbuddy-restore-1.0.3-20261016/resume-release.mjs')
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === 'bce83daf60b741828f2d0a789ea99412') {
  await import('../../../../output/windows-startup-repair-20261015/resume.mjs')
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === 'd9a15d0048f54d11bfb8e70cdd9a6397') {
  await import('../../../../output/windows-manual-1.0.2-20261015/resume.mjs')
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_RELEASE_BUILD_ID === 'e26f6b65b6a648e28f7d85d1ac88327a') {
  await (await import('./resume-tool-source-1.0.1.mjs')).resume()
  process.exit(process.exitCode ?? 0)
}

if (process.env.STUDYBUDDY_INSTALLER_BRAND_ONLY === '1') {
  await import('./repackage-windows-installer-brand.mjs')
  process.exit(process.exitCode ?? 0)
}

const BUILD_ID = '1441f30273f04a1c8640efbceb283ef8'
const VERSION = '1.0.0'
const UNSIGNED_SHA256 = '33818cb14a33e8bae979886d931bb1e691b7f06872417dbb34f2786d94ece222'
const appRoot = resolve(import.meta.dirname, '..')
const paths = desktopTargetBuildPaths('win-x64')
const appPath = join(paths.artifacts, 'win-unpacked')
const mainPath = join(appPath, 'StudyBuddy.exe')
const resources = join(appPath, 'resources')
const receiptPath = join(paths.artifacts, 'win-x64-signing-resume.json')
const originalRun = join(appRoot, '.desktop-build', 'packaging-runs', '2026-10-14T07-30-59.809Z-I11htq')
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')

if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.STUDYBUDDY_RELEASE_BUILD_ID !== BUILD_ID) {
  throw new Error('Windows signing resume requires the fixed reviewed Windows x64 candidate')
}
const original = JSON.parse(await readFile(join(originalRun, 'run.json'), 'utf8'))
if (original.target !== 'win-x64' || original.version !== VERSION || original.unsigned !== false) {
  throw new Error('Windows signing resume original candidate identity differs')
}
const env = {
  ...loadDesktopPackageEnvironment('win32'),
  DSH_DESKTOP_TARGET_PLATFORM: 'win32', DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_UNSIGNED: '0', ELECTRON_BUILDER_7Z_FILTER: 'BCJ',
  DSH_DESKTOP_BUILD_VERSION: VERSION,
}
validateDesktopPackageEnvironment(env, { platform: 'win32', arch: 'x64' })
const run = createPackagingRun(join(appRoot, '.desktop-build', 'packaging-runs'), {
  target: 'win-x64', version: VERSION, buildId: BUILD_ID, resume: true,
  originalRun, unsignedSha256: UNSIGNED_SHA256,
}, { secrets: [env.STUDYBUDDY_EVSIGN_LICENSE] })
env.DSH_DESKTOP_PACKAGING_RUN_DIR = run.directory
console.log(`DESKTOP_PACKAGING_RECORD ${run.directory}`)
let success = false
try {
  const digest = await hash(mainPath)
  const signature = await inspectWindowsRuntimeSignature(mainPath)
  if (signature.status === 'NotSigned') {
    if (digest !== UNSIGNED_SHA256) throw new Error('Windows signing resume reviewed unsigned bytes differ')
  } else {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    if (receipt.buildId !== BUILD_ID || receipt.unsignedSha256 !== UNSIGNED_SHA256 || receipt.signedSha256 !== digest
      || signature.status !== 'Valid' || !signature.timestamped || signature.thumbprint !== STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT) {
      throw new Error('Windows signing resume signed candidate receipt differs')
    }
  }
  await verifyStudyBuddyPackageResources(resources)
  await verifyPackagedStudyBuddyPreloads(appRoot, resources)
  const peFiles = (await windowsRuntimeCode(paths.dsh)).map(path => path.slice(paths.dsh.length + 1))
  await verifyWindowsAsarUnpack(paths.dsh, resources, peFiles)
  recordPackagingEvent(run.directory, { type: 'reviewed-prepackaged-verified', path: appPath, sha256: digest })
  const config = createElectronBuilderConfig(env)
  await withWindowsSigningStage({ stage: 'artifacts-resume', record: event => recordPackagingEvent(run.directory, event) }, async () => {
    if (signature.status === 'NotSigned') {
      await config.win.signtoolOptions.sign({ path: mainPath, hash: 'sha256', isNest: false })
      await writeFile(receiptPath, `${JSON.stringify({ schemaVersion: 1, buildId: BUILD_ID, version: VERSION,
        unsignedSha256: UNSIGNED_SHA256, signedSha256: await hash(mainPath), originalRun,
        mainSignedAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' })
    } else {
      recordPackagingEvent(run.directory, { type: 'studybuddy-evsign-existing-verified', path: mainPath, sha256: digest })
    }
    const pnpm = process.env.npm_execpath
    if (!pnpm) throw new Error('Windows signing resume requires the pnpm entry')
    await run.run('electron-installer-from-reviewed-package', process.execPath, [pnpm, 'exec', 'electron-builder',
      '--config', 'electron-builder.config.mjs', '--win', 'nsis', '--x64', '--publish', 'never',
      '--prepackaged', appPath], { cwd: appRoot, env })
  })
  const signatureAfter = await inspectWindowsRuntimeSignature(mainPath)
  const mainReceipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  if (await hash(mainPath) !== mainReceipt.signedSha256 || signatureAfter.status !== 'Valid') {
    throw new Error('Windows signing resume signed main bytes changed')
  }
  const update = resolveDesktopAutoUpdateConfig(env, 'win32', 'x64')
  await writeFile(join(paths.artifacts, desktopBuildRecordFilename('win-x64')), `${JSON.stringify({
    schemaVersion: 1, target: 'win-x64', version: VERSION, environment: update.environment,
    publicUrl: update.publicUrl, commit: original.commit, dirty: original.dirty,
  }, null, 2)}\n`)
  recordPackagingEvent(run.directory, { type: 'artifacts', directory: paths.artifacts })
  success = true
} catch (error) {
  console.error(String(error).replaceAll(env.STUDYBUDDY_EVSIGN_LICENSE, '[REDACTED]'))
  process.exitCode = 1
} finally {
  run.finish(success)
}
