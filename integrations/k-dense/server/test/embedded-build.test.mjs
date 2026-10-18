import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as producer from '../build-embedded.mjs';

test('license package discovery skips anonymous nested module manifests', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'research-package-root-'));
  try {
    const root = path.join(temporary, 'node_modules/named-package');
    await fs.mkdir(path.join(root, 'dist/esm'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'named-package', version: '1.2.3', license: 'MIT' }));
    await fs.writeFile(path.join(root, 'dist/package.json'), JSON.stringify({ type: 'commonjs' }));
    await fs.writeFile(path.join(root, 'dist/esm/package.json'), JSON.stringify({ type: 'module' }));
    const metadata = await producer.runtimePackageRoot(path.join(root, 'dist/esm/index.js'));
    assert.equal(metadata.root, root); assert.equal(metadata.metadata.name, 'named-package'); assert.equal(metadata.metadata.version, '1.2.3');
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});

test('unnamed or unversioned dependencies fail rather than borrow the project package', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'research-package-invalid-'));
  try {
    const root = path.join(temporary, 'node_modules/invalid-package'); await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(temporary, 'package.json'), JSON.stringify({ name: 'unrelated-project', version: '9.9.9' }));
    for (const metadata of [{ type: 'module' }, { name: '', version: '1.0.0' }, { name: 'invalid-package' }, { name: 'invalid-package', version: 1 }]) {
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(metadata));
      await assert.rejects(() => producer.runtimePackageRoot(path.join(root, 'index.js')), /RESEARCH_BUILD_PACKAGE_ROOT_MISSING/);
    }
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
