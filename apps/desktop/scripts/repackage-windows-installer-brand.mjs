/** Rebuild only installer branding while retaining the already signed application. */
import { resolve, join } from 'node:path'
import { rm } from 'node:fs/promises'
import { desktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createPackagingRun, recordPackagingEvent } from './packaging-run.mjs'
import { withWindowsSigningStage } from './windows-signing-stage.mjs'

const appRoot = resolve(import.meta.dirname, '..')
const paths = desktopTargetBuildPaths('win-x64')
// Explicit repair resumes may reuse the just-built payload after updating its verified members.
if (process.env.STUDYBUDDY_REUSE_PAYLOAD_ARCHIVE !== '1') {
  await rm(join(paths.artifacts, '@deepseek-aidsh-desktop-1.0.0-x64.nsis.7z'), { force: true })
}
const env = { ...loadDesktopPackageEnvironment('win32'), DSH_DESKTOP_TARGET_PLATFORM: 'win32',
  DSH_DESKTOP_TARGET_ARCH: 'x64', DSH_DESKTOP_UNSIGNED: '0', DSH_DESKTOP_BUILD_VERSION: '1.0.0',
  ELECTRON_BUILDER_7Z_FILTER: 'BCJ', ELECTRON_BUILDER_COMPRESSION_LEVEL: '1' }
const run = createPackagingRun(join(appRoot, '.desktop-build/packaging-runs'), {
  target: 'win-x64', version: '1.0.0', buildId: process.env.STUDYBUDDY_RELEASE_BUILD_ID,
  installerBrandOnly: true, signedApplicationRetained: true,
  additionalChecks: 'main-import-closure-and-installed-research-resource-check',
}, { secrets: [env.STUDYBUDDY_EVSIGN_LICENSE] })
env.DSH_DESKTOP_PACKAGING_RUN_DIR = run.directory
console.log(`DESKTOP_PACKAGING_RECORD ${run.directory}`)
let success = false
try {
  await withWindowsSigningStage({ stage: 'artifacts-resume', record: event => recordPackagingEvent(run.directory, event) }, async () => {
    await run.run('studybuddy-installer-brand-package', process.execPath, [process.env.npm_execpath,
      'exec', 'electron-builder', '--config', 'electron-builder.config.mjs', '--win', 'nsis',
      '--x64', '--publish', 'never', '--prepackaged', join(paths.artifacts, 'win-unpacked')],
    { cwd: appRoot, env })
  })
  success = true
} catch (error) {
  console.error(String(error).replaceAll(env.STUDYBUDDY_EVSIGN_LICENSE, '[REDACTED]'))
  process.exitCode = 1
} finally {
  run.finish(success)
}
