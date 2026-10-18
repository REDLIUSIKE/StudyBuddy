import { officePackageDirectories } from '../../../scripts/libreoffice-packages.mjs'
import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  resolveDesktopAppId,
  resolveMacOSNotarizationEnvironment,
  resolveMacOSSigningEnvironment,
} from './desktop-release-environment.mjs'
import { notarizeMacOSDiskImageArtifact } from './notarize-macos-disk-images.mjs'
import { verifyMacOSSignatureAfterSign } from './verify-macos-signature.mjs'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'
import {
  STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT,
  STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER,
  createStudyBuddyEvSignSigner,
  createStudyBuddyWindowsReleaseSigner,
  validateStudyBuddyEvSignEnvironment,
} from './studybuddy-evsign.mjs'
import { resolveDesktopAutoUpdateConfig } from './desktop-auto-update-environment.mjs'
import { resolveDesktopBuildCommit } from './desktop-build-commit.mjs'
import { resolveDesktopBuildVersion } from './desktop-build-version.mjs'
import { resolveDesktopPolicyEnvironment } from './desktop-policy-environment.mjs'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { installWindowsDirectoryInstaller } from './windows-directory-installer.mjs'
import { preserveWindowsRuntimeSignature, signWindowsCode } from './windows-runtime-signature.mjs'
import { prepareWindowsAsarUnpack, preserveWindowsRuntimeEmptyDirectories, verifyWindowsAsarUnpack } from './windows-asar-unpack.mjs'
import { recordPackagingEvent } from './packaging-run.mjs'
import { verifyStudyBuddyPackageResources, verifyStudyBuddyPackageSources, verifyPackagedStudyBuddyPreloads } from './studybuddy-package-resources.mjs'
import { assertCredentialFreePayload } from './package-credential-guard.mjs'
import {
  resolveMacOSAppUpdateFeed,
  verifyMacOSAppUpdateConfig,
  writeMacOSAppUpdateConfig,
} from './macos-app-update-config.mjs'

const FORMAL_STUDYBUDDY_APP_ID = 'com.studybuddy.desktop'

/**
 * Create electron-builder configuration from one release environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no explicit target is present.
 * @param {string} hostArch - Build-host architecture used when no explicit target is present.
 * @param {string | undefined} preparedRuntime - Verified private dsh tree for installed-update qualification; ordinary releases use the target tree.
 * @param {string | undefined} preparedRuntimeVersion - Version that private tree declares, which qualification rewrites away from the product version.
 * @returns {object} electron-builder configuration.
 */
export function createElectronBuilderConfig(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
  preparedRuntime = undefined,
  preparedRuntimeVersion = undefined,
) {
  const appId = resolveDesktopAppId(env)
  const targetPlatform = env.DSH_DESKTOP_TARGET_PLATFORM
  const resolvedPlatform = targetPlatform ?? hostPlatform
  const resolvedArch = env.DSH_DESKTOP_TARGET_ARCH ?? hostArch
  if (env.DSH_DESKTOP_UNSIGNED !== undefined && !['0', '1'].includes(env.DSH_DESKTOP_UNSIGNED)) {
    throw new Error('desktop package: DSH_DESKTOP_UNSIGNED must be 0 or 1')
  }
  const unsigned = env.DSH_DESKTOP_UNSIGNED === '1'
  if (!unsigned && appId !== FORMAL_STUDYBUDDY_APP_ID) {
    throw new Error(`desktop package: signed StudyBuddy packages must use application ID ${FORMAL_STUDYBUDDY_APP_ID}`)
  }
  const packagesMacOS = targetPlatform === 'darwin' || (targetPlatform === undefined && hostPlatform === 'darwin')
  const packagesWindows = resolvedPlatform === 'win32'
  const businessRuntime = fileURLToPath(new URL('../../../.dsh-build/studybuddy-business', import.meta.url))
  const skillsRuntime = fileURLToPath(new URL('../../../.dsh-build/studybuddy-skills-native', import.meta.url))
  const aigcRuntime = fileURLToPath(new URL('../../../.dsh-build/studybuddy-aigc', import.meta.url))
  const researchRuntime = fileURLToPath(new URL('../../../.dsh-build/studybuddy-research', import.meta.url))
  const videoRuntime = fileURLToPath(new URL('../../../.dsh-build/studybuddy-video', import.meta.url))
  const policy = packagesMacOS && unsigned ? undefined : resolveDesktopPolicyEnvironment(env)
  if (resolvedPlatform === 'win32') installWindowsDirectoryInstaller()
  const macOSSigning = packagesMacOS && !unsigned ? resolveMacOSSigningEnvironment(env) : undefined
  if (packagesMacOS && !unsigned) resolveMacOSNotarizationEnvironment(env)
  const buildPaths = desktopTargetBuildPaths(resolveDesktopBuildTarget(env, hostPlatform, hostArch))
  const productVersion = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version
  const buildVersion = resolveDesktopBuildVersion(env, productVersion)
  let primaryRuntimeDestination
  let dshDestination
  let windowsCode = []
  // The research profile uses plain shared Node, which requires physical dsh modules.
  const unpack = ['**/dsh/**/*', '**/*.{node,dylib,dll,so,exe}', '**/*.so.*', '**/spawn-helper', '**/@vscode/ripgrep-*/bin/rg',
    `**/node_modules/@deepseek-ai/libreoffice-kit-${resolvedPlatform}-${resolvedArch}/**/*`]
  const evSign = packagesWindows && !unsigned ? validateStudyBuddyEvSignEnvironment(env) : undefined
  const rawWindowsSigner = packagesWindows && !unsigned
    ? createStudyBuddyEvSignSigner({
        candidateRoot: buildPaths.root,
        licence: evSign.licence,
        environment: env,
        ...(env.DSH_DESKTOP_PACKAGING_RUN_DIR === undefined ? {} : {
          record: event => recordPackagingEvent(env.DSH_DESKTOP_PACKAGING_RUN_DIR, event),
        }),
        preserveSignature: async path => {
          for (const [sourceRoot, destinationRoot] of [[join(buildPaths.runtime, 'primary-runtime'), primaryRuntimeDestination], [buildPaths.dsh, dshDestination]]) {
            if (destinationRoot !== undefined && await preserveWindowsRuntimeSignature(path, {
              sourceRoot, destinationRoot, runDirectory: env.DSH_DESKTOP_PACKAGING_RUN_DIR,
              allowUnsigned: true,
            })) return true
          }
          return false
        },
      })
    : undefined
  const windowsSigner = rawWindowsSigner === undefined ? undefined : createStudyBuddyWindowsReleaseSigner({
    mainExecutable: join(buildPaths.artifacts, 'win-unpacked', 'StudyBuddy.exe'),
    installer: join(buildPaths.artifacts, `StudyBuddy-Windows-${resolvedArch}-${buildVersion}.exe`),
    sign: rawWindowsSigner,
    ...(env.DSH_DESKTOP_PACKAGING_RUN_DIR === undefined ? {} : {
      record: event => recordPackagingEvent(env.DSH_DESKTOP_PACKAGING_RUN_DIR, event),
    }),
  })
  const update = unsigned ? undefined : resolveDesktopAutoUpdateConfig(env, resolvedPlatform, resolvedArch)
  if (preparedRuntime !== undefined) buildPaths.dsh = preparedRuntime
  // electron-builder merges extraMetadata into the packaged manifest, so a build version here reaches
  // the artifact names, the update feed, and the installed app.getVersion() the updater compares against.
  const packaged = resolveDesktopBuildCommit(env)
  return {
    appId,
    protocols: [{ name: 'StudyBuddy', schemes: ['studybuddy'] }],
    extraMetadata: {
      dshDesktopAppId: appId,
      ...(policy === undefined ? {} : { dshMandatoryUpdatePolicy: policy }),
      ...buildVersion === productVersion ? {} : { version: buildVersion },
      ...packaged === undefined ? {} : { dshBuildCommit: packaged.commit, dshBuildDirty: packaged.dirty },
    },
    productName: 'StudyBuddy',
    // Unsigned builds carry their own suffix so a shared file can never pass for a release artifact.
    artifactName: `StudyBuddy-\${os}-\${arch}-\${version}${unsigned ? '-unsigned' : ''}.\${ext}`,
    directories: { output: unsigned ? buildPaths.unsignedArtifacts : buildPaths.artifacts },
    ...(env.STUDYBUDDY_INSTALLER_BRAND_ONLY === '1' ? { compression: 'store' } : {}),
    asar: true,
    electronDist: buildPaths.electron,
    electronFuses: { runAsNode: true },
    beforeBuild: async () => {
      if (resolvedPlatform !== 'win32') return true
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        fileURLToPath(new URL('./prepare-windows-installer.ps1', import.meta.url)),
        '-OutputDirectory', join(buildPaths.root, 'installer-ui')], {
        env: scrubWindowsSigningEnvironment(env), windowsHide: true,
      })
      // A falsy result tells electron-builder to omit its production node_modules collection.
      return true
    },
    files: [
      'lib/*.js',
      'lib/welcome/**/*',
      'lib/preload-app.cjs',
      'lib/preload-mandatory.cjs',
      'lib/preload-platform-account.cjs',
      'lib/preload-update-dialog.cjs',
      'lib/preload-welcome.cjs',
      'lib/preload-studybuddy-tools.cjs',
      'lib/preload-studybuddy-aigc.cjs',
      'lib/preload-studybuddy-skills.cjs',
      'lib/preload-studybuddy-research.cjs',
      'lib/preload-studybuddy-video.cjs',
      'renderer/**/*',
      'package.json',
      // Linked private contracts need only their built dist; never ship source fixtures or local sync records.
      '!**/node_modules/@studybuddy/contracts/src{,/**/*}',
      '!**/node_modules/@studybuddy/contracts/source-manifest.json',
      { from: buildPaths.dsh, to: 'dsh', filter: ['**/*'] },
      // electron-builder excludes a source directory's root node_modules.
      { from: join(buildPaths.dsh, 'node_modules'), to: 'dsh/node_modules', filter: ['**/*'] },
    ],
    asarUnpack: unpack,
    extraResources: [
      // Optional scanner resources are downloaded to userData, never copied from an old development candidate.
      { from: buildPaths.runtime, to: 'runtime', filter: ['**/*', '!skill-scanner', '!skill-scanner/**/*'] },
      // Preserve the exact sealed pnpm runtime: the builder otherwise drops this vendor marker.
      { from: join(buildPaths.runtime, 'primary-runtime/dependencies/pnpm/dist/node_modules/undici/lib/llhttp/.gitkeep'),
        to: 'runtime/primary-runtime/dependencies/pnpm/dist/node_modules/undici/lib/llhttp/.gitkeep' },
      ...(packagesWindows ? [{ from: join(buildPaths.root, 'skill-scanner-publication', 'release.json'), to: 'skill-scanner-release.json' }] : []),
      { from: fileURLToPath(new URL('../resources/icon-windows.png', import.meta.url)), to: 'icon.png' },
      // Windows tray bitmaps; macOS keeps the Dock and ships no menu bar icon.
      ...(packagesWindows ? [{ from: fileURLToPath(new URL('../resources/tray-windows.ico', import.meta.url)), to: 'tray.ico' }] : []),
      ...(packagesWindows ? [{ from: skillsRuntime, to: 'studybuddy-skills-native' }] : []),
      ...(packagesWindows ? [{ from: aigcRuntime, to: 'studybuddy-aigc' }] : []),
      // The builder omits root node_modules even for extraResources; retain the sealed AIGC native dependency tree.
      ...(packagesWindows ? [{ from: join(aigcRuntime, 'node_modules'), to: 'studybuddy-aigc/node_modules', filter: ['**/*'] }] : []),
      ...(packagesWindows ? [{ from: businessRuntime, to: 'studybuddy-business' }] : []),
      ...(packagesWindows ? [{ from: researchRuntime, to: 'studybuddy-research' }] : []),
      ...(packagesWindows ? [{ from: videoRuntime, to: 'studybuddy-video' },
        { from: join(videoRuntime, 'node_modules'), to: 'studybuddy-video/node_modules', filter: ['**/*'] }] : []),
    ],
    mac: {
      icon: fileURLToPath(new URL('../resources/icon-macos.png', import.meta.url)),
      category: 'public.app-category.developer-tools',
      // macOS matches the application locale against this bundle, not Electron Framework resources.
      extendInfo: { CFBundleLocalizations: ['en', 'zh_CN'] },
      // Ad-hoc signing keeps the modified Electron executable runnable without a Developer ID.
      identity: unsigned ? '-' : macOSSigning?.signingIdentity,
      forceCodeSigning: !unsigned,
      hardenedRuntime: true,
      extendInfo: { NSMicrophoneUsageDescription: 'DeepSeek Harness uses your microphone to transcribe speech into message drafts.' },
      entitlements: fileURLToPath(new URL('./macos-entitlements.plist', import.meta.url)),
      entitlementsInherit: fileURLToPath(new URL('./macos-entitlements.plist', import.meta.url)),
      // Prepared runtime files retain their signatures; PAK resources are sealed by their enclosing bundle.
      signIgnore: ['/Contents/Resources/app\\.asar\\.unpacked/dsh(?:/|$)', '/Contents/Resources/runtime/primary-runtime(?:/|$)', '\\.pak$'],
      notarize: !unsigned,
      target: unsigned ? ['dmg'] : ['dmg', 'zip'],
    },
    dmg: {
      sign: !unsigned,
      writeUpdateInfo: false,
    },
    beforePack: async context => {
      if (packagesWindows) {
        await verifyStudyBuddyPackageSources(fileURLToPath(new URL('../../..', import.meta.url)))
        await verifyStudyBuddyPackageResources(fileURLToPath(new URL('../../../.dsh-build', import.meta.url)), {
          primaryRuntimeDirectory: join(buildPaths.runtime, 'primary-runtime'), dshDirectory: buildPaths.dsh,
        })
      }
      const office = await officePackageDirectories(buildPaths.dsh, { platform: resolvedPlatform, arch: resolvedArch })
      const patterns = office.map(directory => `**/${relative(buildPaths.dsh, directory).split(sep).join('/')}/**/*`)
      const existing = context.packager.config.asarUnpack ?? []
      context.packager.config.asarUnpack = [...(typeof existing === 'string' ? [existing] : existing), ...patterns]
      if (packagesWindows) windowsCode = await prepareWindowsAsarUnpack(context, buildPaths.dsh)
      if (windowsSigner !== undefined) {
        primaryRuntimeDestination = join(context.appOutDir, 'resources', 'runtime', 'primary-runtime')
        dshDestination = join(context.appOutDir, 'resources', 'app.asar.unpacked', 'dsh')
      }
      if (policy === undefined) return
      const { resolveDesktopPolicyConfig } = await import('../lib/types/mandatory-update-policy.js')
      resolveDesktopPolicyConfig(policy)
    },
    afterPack: async context => {
      const { verifyDesktopRuntime } = await import('../lib/types/runtime-tree.js')
      const resourcesDir = context.packager.getResourcesDir(context.appOutDir)
      if (packagesWindows) await preserveWindowsRuntimeEmptyDirectories(buildPaths.dsh, join(resourcesDir, 'app.asar.unpacked/dsh'))
      await assertCredentialFreePayload(resourcesDir, env)
      if (packagesWindows) {
        await verifyStudyBuddyPackageSources(fileURLToPath(new URL('../../..', import.meta.url)))
        await verifyStudyBuddyPackageResources(resourcesDir)
        await verifyPackagedStudyBuddyPreloads(context.packager.info.appDir, resourcesDir)
      }
      if (resolvedPlatform === 'darwin' && update !== undefined) {
        await writeMacOSAppUpdateConfig(resourcesDir, resolveMacOSAppUpdateFeed(context.packager.config.publish),
          context.packager.appInfo.updaterCacheDirName)
      }
      // The bundled runtime declares whichever version prepared it: the product version for an ordinary
      // release, and a rewritten one for installed-update qualification.
      await verifyDesktopRuntime(buildPaths.dsh,
        preparedRuntimeVersion ?? productVersion, { platform: resolvedPlatform, arch: resolvedArch })
      // Unsigned Windows builds skip electron-builder's afterSign hook.
      if (packagesWindows && unsigned) await verifyWindowsAsarUnpack(buildPaths.dsh, resourcesDir, windowsCode)
    },
    afterSign: async context => {
      if (windowsSigner !== undefined) {
        await signWindowsCode(context.appOutDir, {
          thumbprint: STUDYBUDDY_EVSIGN_PRODUCT_THUMBPRINT,
          sign: windowsSigner,
          owned: path => relative(context.appOutDir, path) === 'StudyBuddy.exe',
          record: event => recordPackagingEvent(env.DSH_DESKTOP_PACKAGING_RUN_DIR, event),
        })
        await verifyWindowsAsarUnpack(buildPaths.dsh, context.packager.getResourcesDir(context.appOutDir), windowsCode)
      }
      if (context.electronPlatformName !== 'darwin' || unsigned) return
      const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
      if (update !== undefined) {
        await verifyMacOSAppUpdateConfig(appPath, resolveMacOSAppUpdateFeed(context.packager.config.publish),
          context.packager.appInfo.updaterCacheDirName)
      }
      verifyMacOSSignatureAfterSign(context, macOSSigning ?? resolveMacOSSigningEnvironment(env))
    },
    artifactBuildCompleted: artifact => {
      if (unsigned || !artifact.file.endsWith('.dmg')) return
      return notarizeMacOSDiskImageArtifact(
        artifact,
        env,
        macOSSigning ?? resolveMacOSSigningEnvironment(env),
      )
    },
    win: {
      artifactName: `StudyBuddy-Windows-\${arch}-\${version}${unsigned ? '-unsigned' : ''}.\${ext}`,
      icon: fileURLToPath(new URL('../resources/icon-windows.png', import.meta.url)),
      forceCodeSigning: !unsigned,
      signtoolOptions: {
        sign: windowsSigner,
        publisherName: windowsSigner === undefined ? undefined : STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER,
        signingHashAlgorithms: ['sha256'],
      },
      target: ['nsis'],
    },
    linux: {
      category: 'Development',
      target: ['AppImage'],
    },
    nsis: {
      // Directory promotion requires every sealed resource in the same archive.
      preCompressedFileExtensions: [],
      installerSidebar: join(buildPaths.root, 'installer-ui', 'uninstaller-sidebar.bmp'),
      uninstallerSidebar: join(buildPaths.root, 'installer-ui', 'uninstaller-sidebar.bmp'),
      include: fileURLToPath(new URL('./installer.nsh', import.meta.url)),
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: false,
      installerLanguages: ['en_US', 'zh_CN'],
      differentialPackage: true,
    },
    detectUpdateChannel: false,
    publish: update === undefined ? null : [{ provider: 'generic', url: update.publicUrl, channel: update.channel }],
  }
}
