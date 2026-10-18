/** Real-process routing retains both startup modes without loading an unnecessary native bridge. */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

it.each([true, false])('routes ESM and CommonJS with exposed internals = %s', (exposed) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-startup-internals-'))
  try {
    const profile = join(root, 'profiles', 'web'), installed = join(root, 'installation')
    const packageDir = join(installed, 'node_modules', 'startup-routing-fixture')
    mkdirSync(profile, { recursive: true })
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: 'startup-routing-fixture', version: '1.0.0', type: 'module',
      exports: { import: './index.js', require: './index.cjs' },
    }))
    writeFileSync(join(packageDir, 'index.js'), 'export const marker = "esm"\n')
    writeFileSync(join(packageDir, 'index.cjs'), 'module.exports = { marker: "cjs" }\n')
    writeFileSync(join(profile, 'consumer.mjs'), 'export { marker } from "startup-routing-fixture"\n')
    const script = `
      import assert from 'node:assert/strict';
      import {createRequire} from 'node:module';
      import {installRuntimeInterception} from ${JSON.stringify(new URL('../src/profile-resolution/resolver.ts', import.meta.url).href)};
      const require=createRequire(import.meta.url);
      const nativeResolve=require('node:module')._resolveFilename;
      const registration=installRuntimeInterception(${JSON.stringify({
        profilesDir: join(root, 'profiles'), profileDir: profile, localPackageNames: [], linkedRoots: [],
        entries: [{ name: 'startup-routing-fixture', packageDir, scope: 'installation',
          declarer: join(installed, 'package.json'), version: '1.0.0' }],
      })});
      const nativeBridgeLoaded=Object.hasOwn(require.cache,${JSON.stringify(require.resolve('node-addon-require-builtin'))});
      assert.equal(nativeBridgeLoaded,${!exposed},'native bridge should load only when internals are not exposed');
      assert.equal(createRequire(${JSON.stringify(join(profile, 'consumer.cjs'))})('startup-routing-fixture').marker,'cjs');
      assert.equal((await import(${JSON.stringify(pathToFileURL(join(profile, 'consumer.mjs')).href)})).marker,'esm');
      registration.dispose();
      assert.equal(require('node:module')._resolveFilename,nativeResolve);
      console.log(JSON.stringify({exposed:${exposed},nativeBridgeLoaded,esm:true,cjs:true,disposed:true}));
    `
    const environment = Object.fromEntries(Object.entries(process.env)
      .filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD|EVSIGN|CSC_|LICEN[CS]E|^NODE_OPTIONS$/i.test(name)))
    const result = spawnSync(process.execPath, [
      ...exposed ? ['--expose-internals'] : [],
      '--import', pathToFileURL(require.resolve('tsx/esm')).href, '--input-type=module', '-e', script,
    ], { encoding: 'utf8', env: environment, timeout: 20_000, windowsHide: true })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout.trim())).toEqual({
      exposed, nativeBridgeLoaded: !exposed, esm: true, cjs: true, disposed: true,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 25_000)
