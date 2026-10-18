import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntimeManifest, verifyRuntimeManifest } from './prepare-business-runtime.mjs'
import * as runtime from './prepare-business-runtime.mjs'
import { parseCreateSupportLogUploadV2Request } from '../../vendor/studybuddy-contracts/dist/support.js'

test('generated private contract package limits installed files to compiled exports and declarations', () => {
  assert.equal(typeof runtime.studyBuddyContractsPackage, 'function')
  const original = { name: '@studybuddy/contracts', version: '0.0.0', exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } }, dependencies: { semver: '7.8.5' } }
  assert.deepEqual(runtime.studyBuddyContractsPackage(original), {
    name: original.name, version: original.version, private: true, type: 'module',
    main: './dist/index.js', types: './dist/index.d.ts', exports: { '.': original.exports['.'] },
    dependencies: original.dependencies, files: ['dist/**/*.js', 'dist/**/*.d.ts'],
  })
})

test('assembled runtime probe requires an actual verified native reply', () => {
  const good = { status: 0, signal: null, stdout: Buffer.from('STUDYBUDDY_NATIVE_RUNTIME_VERIFIED_V2\n') }
  assert.doesNotThrow(() => runtime.assertNativeAssemblyProbe(good))
  for (const result of [
    { ...good, status: 1 },
    { ...good, signal: 'SIGTERM' },
    { ...good, error: new Error('fixture spawn failure') },
    { ...good, stdout: Buffer.alloc(0) },
    { ...good, stdout: Buffer.from('NATIVE_RUNTIME_INVALID') },
    { ...good, stdout: Buffer.from('STUDYBUDDY_NATIVE_RUNTIME_VERIFIED_V2\nextra') },
  ]) assert.throws(() => runtime.assertNativeAssemblyProbe(result), /RUNTIME_ASSEMBLY_INVALID/)
})

async function withBuildFixture(body) {
  const directory = await mkdtemp(join(tmpdir(), 'studybuddy-inputs-'))
  try {
    const source = join(directory, 'source'),
      output = join(directory, 'runtime')
    const inputs = {
      'packages/contracts/src/index.ts': 'export const schema = 2;',
      'packages/contracts/package.json': '{}',
      'apps/desktop/src/features/native-tools/NativeSourceConfigurationPanel.tsx': 'export const panel = 1;',
      'apps/desktop/src-tauri/src/tools/echobird/source_configuration/reviewed.rs': 'const CLOSED: bool = true;',
      'apps/desktop/src-tauri/Cargo.toml': '[package]\nname="fixture"',
      'apps/desktop/src-tauri/build_identity_config.rs': 'const DEVELOPMENT: bool = true;',
      'apps/desktop/src-tauri/build_support.rs': 'const LEGAL: bool = true;',
      'apps/desktop/src-tauri/src/environment/priority-install-recipes.json': '{"fixture":1}',
      'apps/desktop/src-tauri/vendor/echobird-tool-runtime/src/lib.rs': 'pub const ORIGINAL: bool = true;',
      'apps/desktop/src-tauri/vendor/cc-switch-config/Cargo.toml': '[package]\nname="fixture-config"',
      'apps/desktop/src-tauri/vendor/cc-switch-model-fetch/src/lib.rs': 'pub const ORIGINAL: bool = true;',
      'pnpm-lock.yaml': 'fixture-lock-version: 1',
      'apps/desktop/tsconfig.json': '{"compilerOptions":{"strict":true}}',
      'apps/desktop/harness-labs.html': '<html><script src="./labs.js"></script></html>',
    }
    for (const [name, bytes] of Object.entries(inputs)) {
      await mkdir(join(source, name, '..'), { recursive: true })
      await writeFile(join(source, name), bytes)
    }
    for (const name of [
      'contracts/index.js',
      'module/index.html',
      'recipes/priority-install-recipes.json',
      'companion.exe',
    ]) {
      await mkdir(join(output, name, '..'), { recursive: true })
      await writeFile(join(output, name), name === 'module/index.html' ? '<html></html>' : 'fixture')
    }
    const options = {
      source,
      sourceHead: 'a'.repeat(40),
      companion: join(output, 'companion.exe'),
      contracts: join(output, 'contracts'),
      recipes: join(output, 'recipes'),
      module: join(output, 'module'),
    }
    await body({ directory, source, output, options })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('newerSourceIncludesConfigurationPanel', async () => {
  await withBuildFixture(async ({ source, output, options }) => {
    const manifest = await createRuntimeManifest(options)
    assert.equal(manifest.schemaVersion, 2)
    assert.equal(manifest.protocolVersion, 2)
    assert.match(
      manifest.sourceFiles['apps/desktop/src/features/native-tools/NativeSourceConfigurationPanel.tsx'],
      /^[a-f0-9]{64}$/,
    )
    assert.match(
      manifest.sourceFiles['apps/desktop/src-tauri/src/tools/echobird/source_configuration/reviewed.rs'],
      /^[a-f0-9]{64}$/,
    )
    assert.equal(manifest.module.entry, 'index.html')
    await verifyRuntimeManifest(manifest, output, { source, sourceHead: 'a'.repeat(40) })
  })
})

test('reuseRejectsChangedRustOrRecipe', async () => {
  for (const name of [
    'apps/desktop/src-tauri/src/tools/echobird/source_configuration/reviewed.rs',
    'apps/desktop/src-tauri/src/environment/priority-install-recipes.json',
  ]) {
    await withBuildFixture(async ({ source, output, options }) => {
      const manifest = await createRuntimeManifest(options)
      await writeFile(join(source, name), 'changed one input')
      await assert.rejects(
        verifyRuntimeManifest(manifest, output, { source, sourceHead: 'a'.repeat(40) }),
        /RUNTIME_SOURCE_MISMATCH/,
      )
    })
  }
})
test('reuse rejects every compiled local vendor and frontend compiler input change', async () => {
  for (const name of [
    'apps/desktop/src-tauri/vendor/echobird-tool-runtime/src/lib.rs',
    'apps/desktop/src-tauri/vendor/cc-switch-config/Cargo.toml',
    'apps/desktop/src-tauri/vendor/cc-switch-model-fetch/src/lib.rs',
    'pnpm-lock.yaml',
    'apps/desktop/tsconfig.json',
    'apps/desktop/harness-labs.html',
    'apps/desktop/src-tauri/build_identity_config.rs',
    'apps/desktop/src-tauri/build_support.rs',
  ]) {
    await withBuildFixture(async ({ source, output, options }) => {
      const manifest = await createRuntimeManifest(options)
      assert.match(manifest.sourceFiles[name], /^[a-f0-9]{64}$/)
      await writeFile(join(source, name), 'changed compile input')
      await assert.rejects(
        verifyRuntimeManifest(manifest, output, { source, sourceHead: 'a'.repeat(40) }),
        /RUNTIME_SOURCE_MISMATCH/,
      )
    })
  }
})

test('sourceArgCannotSilentlyUseOldDefault', () => {
  assert.equal(typeof runtime.parseRuntimeArgs, 'function')
  assert.throws(() => runtime.parseRuntimeArgs(['--source']), /RUNTIME_SOURCE_REQUIRED/)
  assert.throws(() => runtime.parseRuntimeArgs(['--source', 'relative-source']), /RUNTIME_SOURCE_INVALID/)
  assert.throws(
    () => runtime.parseRuntimeArgs(['--source', 'C:/checked', '--source', 'C:/other']),
    /RUNTIME_ARGUMENT_INVALID/,
  )
  assert.throws(() => runtime.parseRuntimeArgs(['--unknown']), /RUNTIME_ARGUMENT_INVALID/)
  const parsed = runtime.parseRuntimeArgs(['--source', join(tmpdir(), 'checked'), '--contracts-only'])
  assert.equal(parsed.source, join(tmpdir(), 'checked'))
  assert.equal(parsed.contractsOnly, true)
})

test('runtime rejects manifest path traversal and linked source paths', async () => {
  await withBuildFixture(async ({ source, output, options }) => {
    const manifest = await createRuntimeManifest(options)
    for (const name of ['../outside', 'module/../companion.exe', 'module\\outside', '/absolute']) {
      await assert.rejects(
        verifyRuntimeManifest({ ...manifest, files: { ...manifest.files, [name]: 'a'.repeat(64) } }, output),
        /RUNTIME_PATH_DENIED/,
      )
    }
    const { symlink } = await import('node:fs/promises')
    const path = join(source, 'apps/desktop/src/linked')
    await symlink(output, path, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(createRuntimeManifest(options), /RUNTIME_LINK_DENIED/)
  })
})

test('runtime manifest verifies real bytes and rejects modified companion', async () => {
  await withBuildFixture(async ({ output, options }) => {
    const manifest = await createRuntimeManifest(options)
    await verifyRuntimeManifest(manifest, output)
    await writeFile(join(output, 'companion.exe'), 'different bytes')
    await assert.rejects(verifyRuntimeManifest(manifest, output), /RUNTIME_HASH_MISMATCH/)
  })
})
test('canonical cargo cache remains allowed while packaged linked bytes stay denied', async () => {
  await withBuildFixture(async ({ directory, source, output, options }) => {
    const { symlink, realpath } = await import('node:fs/promises')
    const cache = join(directory, 'cargo-cache'),
      target = join(source, 'apps/desktop/src-tauri/target')
    await mkdir(cache)
    await symlink(cache, target, process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(typeof runtime.canonicalCargoTarget, 'function')
    assert.equal(await runtime.canonicalCargoTarget(source), await realpath(cache))
    await symlink(cache, join(output, 'module/linked'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(createRuntimeManifest(options), /RUNTIME_LINK_DENIED/)
  })
})

test('native build binds the existing public catalog identity and rejects a changed trust root', () => {
  const trust = { schemaVersion: 1, keyId: 'studybuddy-install-catalog-ed25519-2026-10-local',
    publicKeySpkiBase64: 'MCowBQYDK2VwAyEA25rqZrPHg4RFgKE9AJw4gO4euFBVM0CoCeHtWzjuyhw=' }
  const expected = { STUDYBUDDY_INSTALL_CATALOG_KEY_ID: trust.keyId,
    STUDYBUDDY_INSTALL_CATALOG_PUBLIC_KEY_BASE64: Buffer.from(trust.publicKeySpkiBase64, 'base64').subarray(12).toString('base64') }
  assert.deepEqual(runtime.compileCatalogTrust(trust, {}), expected)
  assert.throws(() => runtime.compileCatalogTrust({ ...trust, keyId: 'another-key' }, {}), /RUNTIME_CATALOG_TRUST_INVALID/)
  assert.throws(() => runtime.compileCatalogTrust({ ...trust, publicKeySpkiBase64: 'MCowBQYDK2VwAyEADq/o7cL8M+fpUsICS/MZbMC3qPgjjBV897GFQzbXJsI=' }, {}), /RUNTIME_CATALOG_TRUST_INVALID/)
  assert.throws(() => runtime.compileCatalogTrust({ ...trust, privateKey: 'not-admitted' }, {}), /RUNTIME_CATALOG_TRUST_INVALID/)
  assert.throws(() => runtime.compileCatalogTrust(trust, { STUDYBUDDY_INSTALL_CATALOG_KEY_ID: 'another-key' }), /RUNTIME_CATALOG_TRUST_INVALID/)
})

test('development upload metadata satisfies the unchanged V2 parser without a production class', () => {
  const environment = runtime.compileDevelopmentBuild('a'.repeat(40), {})
  assert.equal(environment.STUDYBUDDY_BUILD_CLASS, 'development')
  assert.equal(environment.STUDYBUDDY_SOURCE_GIT_SHA, 'a'.repeat(40))
  assert.match(environment.STUDYBUDDY_BUILD_ID, /^[0-9a-f]{32}$/)
  const request = { platform: 'windows', architecture: 'x64', appVersion: '0.1.32',
    buildNumber: '0.1.32', range: 'last_24_hours', compressedBytes: '123', sha256: 'b'.repeat(64),
    eventCount: 1, firstOccurredAt: '2026-10-12T00:00:00.000Z', lastOccurredAt: '2026-10-12T00:00:00.000Z',
    uploadKind: 'MANUAL_DIAGNOSTIC', clientBuild: { buildId: environment.STUDYBUDDY_BUILD_ID,
      sourceGitSha: environment.STUDYBUDDY_SOURCE_GIT_SHA } }
  assert.deepEqual(parseCreateSupportLogUploadV2Request(request), request)
  assert.throws(() => parseCreateSupportLogUploadV2Request({ ...request,
    clientBuild: { buildId: 'dev', sourceGitSha: 'dev' } }))
  for (const inherited of [
    { STUDYBUDDY_BUILD_CLASS: 'production' }, { STUDYBUDDY_BUILD_ID: 'c'.repeat(32) },
    { STUDYBUDDY_SOURCE_GIT_SHA: 'c'.repeat(40) },
  ]) assert.throws(() => runtime.compileDevelopmentBuild('a'.repeat(40), inherited), /RUNTIME_BUILD_IDENTITY_INVALID/)
  assert.throws(() => runtime.compileDevelopmentBuild('dev', {}), /RUNTIME_BUILD_IDENTITY_INVALID/)
})

test('runtime records its development build identity against the exact source HEAD', async () => {
  await withBuildFixture(async ({ output, options }) => {
    const buildIdentity = { kind: 'development', buildId: 'b'.repeat(32), sourceGitSha: 'a'.repeat(40) }
    const manifest = await createRuntimeManifest({ ...options, buildIdentity })
    assert.deepEqual(manifest.buildIdentity, buildIdentity)
    await verifyRuntimeManifest(manifest, output)
    await assert.rejects(verifyRuntimeManifest({ ...manifest,
      buildIdentity: { ...buildIdentity, sourceGitSha: 'c'.repeat(40) } }, output), /RUNTIME_BUILD_IDENTITY_INVALID/)
  })
})
