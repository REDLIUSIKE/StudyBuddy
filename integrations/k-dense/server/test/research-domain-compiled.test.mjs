/** Run with plain Node after build-embedded.mjs. This is a path/closure test,
 * not a scientific decoding test: only the copied helper is a stdlib fixture. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

test('compiled distribution retains every reviewed package license and named dependency identity', async () => {
  const build = process.env.RESEARCH_TEST_BUILD_DIRECTORY ?? fileURLToPath(new URL('../dist-embedded/', import.meta.url));
  const requiredLicenses = [
    'balanced-match@4.0.4/LICENSE.md', 'brace-expansion@5.0.12/LICENSE',
    'long@5.3.2/LICENSE', 'minimatch@10.2.6/LICENSE.md',
  ];
  for (const license of requiredLicenses) assert.ok((await fs.readFile(path.join(build, 'licenses', license))).length > 0, license);
  const proof = JSON.parse(await fs.readFile(path.join(path.dirname(build), 'dist-embedded.build.json'), 'utf8'));
  assert.ok(proof.closure.dependencies.every(row => typeof row.name === 'string' && row.name.trim() && typeof row.version === 'string' && row.version.trim()), 'Every dependency must have a real name and version');
  for (const dependency of proof.closure.dependencies) {
    const prefix = 'licenses/' + dependency.name.replaceAll('/', '__') + '@' + dependency.version + '/';
    assert.ok(proof.files.some(row => row.path.startsWith(prefix)), 'Every dependency must retain its reviewed notice tree: ' + dependency.name + '@' + dependency.version);
  }
  for (const license of requiredLicenses) assert.ok(proof.files.some(row => row.path === 'licenses/' + license), 'Proof must bind license ' + license);
});

test('compiled domain resolves delivered AnnData helper for summary and embedding', async t => {
  const python = process.env.RESEARCH_TEST_PYTHON;
  assert.ok(python && path.isAbsolute(python), 'Set RESEARCH_TEST_PYTHON to the trusted absolute shared Python executable');
  const build = process.env.RESEARCH_TEST_BUILD_DIRECTORY ?? fileURLToPath(new URL('../dist-embedded/', import.meta.url));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'research-compiled-helper-'));
  const server = path.join(temporary, 'server'), web = path.join(temporary, 'web');
  let domain;
  const previousPath = process.env.PATH, previousNodePath = process.env.NODE_PATH, previousCwd = process.cwd();
  try {
    await fs.cp(build, server, { recursive: true });
    await fs.mkdir(web); await fs.writeFile(path.join(web, 'index.html'), '<!doctype html><p>Path fixture</p>');
    assert.ok((await fs.readFile(path.join(server, 'helpers/anndata_helper.py'))).length > 0, 'The actual compiled distribution must deliver the helper before the path fixture replaces it');
    await fs.writeFile(path.join(server, 'helpers/anndata_helper.py'), [
      'import json,sys',
      'from pathlib import Path',
      'assert "-B" in sys.orig_argv and sys.dont_write_bytecode, "managed helper requires explicit -B"',
      'if sys.argv[1] == "summarize":',
      ' print(json.dumps({"fixture": "helper-path-only", "command": "summarize"}))',
      'elif sys.argv[1] == "embedding":',
      ' Path(sys.argv[6]).write_bytes(b"\\x89PNG\\r\\n\\x1a\\nhelper-path-only")',
      'else:',
      ' raise SystemExit(7)',
      '',
    ].join('\n'));
    process.chdir(temporary); process.env.PATH = path.dirname(process.execPath); delete process.env.NODE_PATH;
    const module = await import(pathToFileURL(path.join(server, 'research-domain.mjs')).href);
    const channel = { current: () => true, async request() { throw Error('Unexpected native dispatch'); }, async *events() {} };
    domain = await module.createEmbeddedResearchDomain({ projectsRoot: path.join(temporary, 'account/projects'), staticDirectory: web, guestAuthorization: 'a'.repeat(64), toolAuthorization: 'b'.repeat(64), channel, pythonExecutable: python });
    const { origin } = await domain.start(), headers = { 'x-studybuddy-research-guest': 'a'.repeat(64) };
    const created = await fetch(origin + '/api/projects', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'helper-path', name: 'Helper path fixture' }) });
    assert.equal(created.status, 201, await created.text());
    await fs.writeFile(path.join(temporary, 'account/projects/helper-path/sandbox/fixture.h5ad'), 'path-only fixture');
    const projectHeaders = { ...headers, 'x-project-id': 'helper-path' };
    await t.test('summary invokes the shipped helper location', async () => {
      const response = await fetch(origin + '/api/sandbox/anndata-summary?path=fixture.h5ad', { headers: projectHeaders });
      const body = await response.text(); assert.equal(response.status, 200, body);
      assert.deepEqual(JSON.parse(body), { fixture: 'helper-path-only', command: 'summarize' });
    });
    await t.test('embedding invokes the same shipped helper location', async () => {
      const response = await fetch(origin + '/api/sandbox/anndata-embedding.png?path=fixture.h5ad&key=X_umap', { headers: projectHeaders });
      const body = Buffer.from(await response.arrayBuffer()); assert.equal(response.status, 200, body.toString());
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal(body.toString('hex'), Buffer.from('\x89PNG\r\n\x1a\nhelper-path-only', 'latin1').toString('hex'));
    });
  } finally {
    await domain?.close(); process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    if (previousNodePath === undefined) delete process.env.NODE_PATH; else process.env.NODE_PATH = previousNodePath;
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
