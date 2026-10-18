/** Compile and materialize only the embedded domain's reviewed runtime closure. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const directory = path.dirname(fileURLToPath(import.meta.url)), repository = path.dirname(directory);
const require = createRequire(import.meta.url), sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function regular(file) { for (let current = path.resolve(file);;) { const info = await fs.lstat(current); if (info.isSymbolicLink()) throw Error('RESEARCH_BUILD_LINK_DENIED: ' + file); const parent = path.dirname(current); if (parent === current) return; current = parent; } }
async function inventory(root, prefix = '') { const rows = []; for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) { const name = prefix + entry.name; if (entry.isSymbolicLink()) throw Error('RESEARCH_BUILD_LINK_DENIED'); if (entry.isDirectory()) rows.push(...await inventory(root, name + '/')); else if (entry.isFile()) { const bytes = await fs.readFile(path.join(root, name)); rows.push({ path: name, size: bytes.length, sha256: sha(bytes) }); } else throw Error('RESEARCH_BUILD_FILE_INVALID'); } return rows.sort((a, b) => a.path.localeCompare(b.path)); }
async function sourceIdentity() { const git = args => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true }).trim(); const names = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort(), hash = createHash('sha256'); for (const name of names) { await regular(path.join(repository, name)); hash.update(name).update('\0').update(await fs.readFile(path.join(repository, name))).update('\0'); } return { sourceCommit: git(['rev-parse', 'HEAD']), sourceDigest: hash.digest('hex'), lockDigest: sha(Buffer.concat(await Promise.all(['server/package-lock.json', 'web/package-lock.json'].map(name => fs.readFile(path.join(repository, name)))))) }; }

/** Nested {type:module/commonjs} markers are not a distributable package. */
export async function runtimePackageRoot(file) {
  for (let current = path.dirname(path.resolve(file)); path.basename(current).toLowerCase() !== 'node_modules';) {
    const metadataFile = path.join(current, 'package.json');
    const bytes = await fs.readFile(metadataFile).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (bytes) {
      await regular(metadataFile);
      const metadata = JSON.parse(bytes);
      if (metadata && typeof metadata.name === 'string' && metadata.name.trim() && typeof metadata.version === 'string' && metadata.version.trim()) return { root: current, metadata };
    }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  throw Error('RESEARCH_BUILD_PACKAGE_ROOT_MISSING: ' + file);
}

export async function buildEmbeddedResearch({ outputDirectory = path.join(directory, 'dist-embedded') } = {}) {
  if (process.version !== 'v24.21.0') throw Error('RESEARCH_BUILD_NODE_VERSION_INVALID');
  const output = path.resolve(outputDirectory), debugDirectory = path.join(directory, 'dist-embedded.debug');
  // Only this producer's generated output may be replaced. Never remove a
  // computed arbitrary path or any part of the shared source checkout.
  if (output !== path.join(directory, 'dist-embedded')) throw Error('RESEARCH_BUILD_OUTPUT_DENIED');
  const identity = await sourceIdentity(), inputs = new Set(['server/build-embedded.mjs', 'server/package.json', 'server/package-lock.json', 'web/package-lock.json']);
  const pinnedFormats = JSON.parse(await fs.readFile(path.join(directory, 'src/runtime/formats/pinned-sources.json'), 'utf8'));
  const formatNotice = JSON.parse(await fs.readFile(path.join(directory, 'src/runtime/formats/NOTICE.json'), 'utf8'));
  if (sha(await fs.readFile(path.join(directory, 'src/runtime/formats/PI-LICENSE.txt'))) !== formatNotice.licenseSha256) throw Error('RESEARCH_BUILD_FORMAT_LICENSE_CHANGED');
  inputs.add('server/src/runtime/formats/pinned-sources.json');
  for (const source of pinnedFormats.sources) { const file = 'server/node_modules/' + source.package + '/dist/' + source.file; const bytes = await fs.readFile(path.join(repository, file)); if (sha(bytes) !== source.sha256) throw Error('RESEARCH_BUILD_FORMAT_SOURCE_CHANGED: ' + file); inputs.add(file); }
  for (const [name, version] of [['@earendil-works/pi-coding-agent', '1.0.0'], ['pi-subagents', '0.74.0'], ['acorn', '8.18.0'], ['skills', '1.7.0']]) { const file = 'server/node_modules/' + name + '/package.json'; if (JSON.parse(await fs.readFile(path.join(repository, file), 'utf8')).version !== version) throw Error('RESEARCH_BUILD_PACKAGE_VERSION_CHANGED: ' + name); inputs.add(file); }
  await fs.rm(output, { recursive: true, force: true }); await fs.mkdir(output);
  await fs.rm(debugDirectory, { recursive: true, force: true }); await fs.mkdir(debugDirectory);
  const result = await build({ absWorkingDir: repository, entryPoints: ['server/src/research-domain.ts'], outfile: path.join(output, 'research-domain.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: 'external', metafile: true, minifySyntax: true, external: ['ssh2'], define: { 'process.env.KADY_RUNTIME_PROFILE': '"studybuddy"' }, banner: { js: "import { createRequire as __researchCreateRequire } from 'node:module'; const require = __researchCreateRequire(import.meta.url);" }, logLevel: 'warning' });
  await fs.rename(path.join(output, 'research-domain.mjs.map'), path.join(debugDirectory, 'research-domain.mjs.map'));
  for (const name of Object.keys(result.metafile.inputs)) inputs.add(name.replaceAll('\\', '/'));
  await fs.writeFile(path.join(directory, 'dist-embedded.meta.json'), JSON.stringify(result.metafile, null, 2) + '\n');
  for (const name of Object.keys(result.metafile.inputs)) if (/node_modules\/@earendil-works\//.test(name) || /server\/src\/(standalone|embedded-entry|agent\/session-registry)\./.test(name)) throw Error('RESEARCH_BUILD_STANDALONE_IMPORT: ' + name);
  const required = new Set(['research-domain.mjs']), copies = new Map();
  async function copy(from, destination) { const source = path.resolve(from); await regular(source); const previous = copies.get(destination); inputs.add(path.relative(repository, source).replaceAll('\\', '/')); if (previous && previous !== source) { if (sha(await fs.readFile(previous)) !== sha(await fs.readFile(source))) throw Error('RESEARCH_BUILD_RESOURCE_COLLISION: ' + destination); return; } copies.set(destination, source); required.add(destination); await fs.mkdir(path.dirname(path.join(output, destination)), { recursive: true }); await fs.copyFile(source, path.join(output, destination)); }
  async function copyTree(from, destination, accept = () => true) { for (const entry of await fs.readdir(from, { withFileTypes: true })) { if (entry.isSymbolicLink()) throw Error('RESEARCH_BUILD_LINK_DENIED'); const source = path.join(from, entry.name), target = destination + '/' + entry.name; if (entry.isDirectory()) await copyTree(source, target, accept); else if (entry.isFile() && accept(entry.name)) await copy(source, target); } }
  await copyTree(path.join(directory, 'src/helpers'), 'helpers', name => /\.py$/.test(name) || ['pyproject.toml', 'uv.lock'].includes(name));
  await copy(path.join(directory, 'src/autodl/runner.py'), 'runner.py');
  await copy(path.join(directory, 'src/runtime/formats/PI-LICENSE.txt'), 'licenses/@earendil-works__pi-coding-agent@1.0.0/LICENSE');
  await copy(path.join(directory, 'src/runtime/formats/NOTICE.json'), 'licenses/@earendil-works__pi-coding-agent@1.0.0/NOTICE.json');
  await copy(path.join(repository, 'LICENSE'), 'licenses/k-dense/LICENSE');
  for (const kind of ['agents', 'prompts', 'skills']) await copyTree(path.join(directory, 'node_modules/pi-subagents', kind), 'subagents-resources/' + kind);
  const { nodeFileTrace } = require('../web/node_modules/next/dist/compiled/@vercel/nft');
  const traced = await nodeFileTrace([require.resolve('ssh2'), require.resolve('skills/bin/cli.mjs'), require.resolve('acorn')], { base: directory, processCwd: directory });
  const optionalNative = [
    { path: 'node_modules/ssh2/lib/protocol/crypto/build/Release/sshcrypto.node', guardedBy: 'node_modules/ssh2/lib/protocol/crypto.js', reason: 'Upstream optional accelerator; source installation already uses its guarded Node OpenSSL/JavaScript implementation.' },
    { path: 'node_modules/cpu-features/build/Release/cpufeatures.node', guardedBy: 'node_modules/ssh2/lib/protocol/constants.js', reason: 'Upstream optional CPU detection; source installation already catches this unavailable module.' },
  ];
  for (const warning of traced.warnings) if (!optionalNative.some(row => warning.message.replaceAll('\\', '/').includes(row.path.split('/').slice(-2).join('/')))) throw Error('RESEARCH_BUILD_UNCLASSIFIED_TRACE_WARNING: ' + warning.message);
  for (const row of optionalNative) { row.absentInSource = !(await fs.stat(path.join(directory, row.path)).catch(() => undefined)); row.guardSha256 = sha(await fs.readFile(path.join(directory, row.guardedBy))); }
  for (const raw of [...traced.fileList].sort()) { const name = raw.replaceAll('\\', '/'); if (!name.startsWith('node_modules/') || /(^|\/)(test|tests|examples|docs)\//.test(name) || /\.(map|d\.ts|d\.mts)$/.test(name)) throw Error('RESEARCH_BUILD_TRACE_OUTSIDE: ' + name); await copy(path.join(directory, name), name); }
  // Notices are runtime distribution obligations even when the JS is bundled.
  const packageRoots = new Set();
  for (const name of inputs) { if (!name.includes('/node_modules/')) continue; const { root } = await runtimePackageRoot(path.join(repository, name)); packageRoots.add(root); inputs.add(path.relative(repository, path.join(root, 'package.json')).replaceAll('\\', '/')); }
  const supplementalName = 'server/third-party-notices/manifest.json'; inputs.add(supplementalName);
  const supplemental = JSON.parse(await fs.readFile(path.join(repository, supplementalName), 'utf8'));
  if (supplemental.schemaVersion !== 1 || !Array.isArray(supplemental.packages)) throw Error('RESEARCH_BUILD_NOTICE_MANIFEST_INVALID');
  const reviewedNotices = new Map(), usedNotices = new Set();
  for (const row of supplemental.packages) { const key = row.name + '\0' + row.version; if (reviewedNotices.has(key) || !Array.isArray(row.files) || !row.files.length) throw Error('RESEARCH_BUILD_NOTICE_MANIFEST_INVALID'); reviewedNotices.set(key, row); }
  for (const root of packageRoots) {
    const metadataBytes = await fs.readFile(path.join(root, 'package.json')), meta = JSON.parse(metadataBytes), prefix = 'licenses/' + meta.name.replaceAll('/', '__') + '@' + meta.version + '/';
    for (const entry of await fs.readdir(root, { withFileTypes: true })) if (entry.isFile() && /^(license|licence|notice|copying|third.?party)/i.test(entry.name)) await copy(path.join(root, entry.name), prefix + entry.name);
    const key = meta.name + '\0' + meta.version, reviewed = reviewedNotices.get(key);
    if (reviewed) {
      if (sha(metadataBytes) !== reviewed.packageJsonSha256 || meta.license !== reviewed.license) throw Error('RESEARCH_BUILD_NOTICE_PACKAGE_CHANGED: ' + meta.name);
      usedNotices.add(key);
      for (const file of reviewed.files) {
        if (typeof file.source !== 'string' || path.isAbsolute(file.source) || file.source.split(/[\\/]/).includes('..') || typeof file.destination !== 'string' || file.destination !== path.basename(file.destination) || /[\\/]/.test(file.destination) || ['.', '..'].includes(file.destination)) throw Error('RESEARCH_BUILD_NOTICE_PATH_INVALID');
        const source = path.join(directory, file.source), bytes = await fs.readFile(source);
        if (sha(bytes) !== file.sha256 || bytes.length !== file.size) throw Error('RESEARCH_BUILD_NOTICE_BYTES_CHANGED: ' + file.source);
        await copy(source, prefix + file.destination);
      }
    }
    if (![...required].some(name => name.startsWith(prefix))) throw Error('RESEARCH_BUILD_LICENSE_MISSING: ' + meta.name + '@' + meta.version);
  }
  if (usedNotices.size !== reviewedNotices.size) throw Error('RESEARCH_BUILD_NOTICE_PACKAGE_UNUSED');
  for (const name of ['node_modules/acorn/dist/acorn.js', 'node_modules/acorn/package.json', 'helpers/office_helper.py', 'runner.py']) if (!required.has(name)) throw Error('RESEARCH_BUILD_REQUIRED_RESOURCE_MISSING: ' + name);
  await fs.writeFile(path.join(directory, 'dist-embedded.meta.json'), JSON.stringify(result.metafile, null, 2) + '\n');
  const after = await sourceIdentity(); if (identity.sourceDigest !== after.sourceDigest || identity.lockDigest !== after.lockDigest) throw Error('RESEARCH_BUILD_INPUT_CHANGED');
  const inputRows = await Promise.all([...inputs].sort().map(async name => { const bytes = await fs.readFile(path.join(repository, name)); return { path: name, size: bytes.length, sha256: sha(bytes) }; }));
  const proof = { schemaVersion: 1, kind: 'studybuddy-research-server-build', inputBase: '.', sourceDigestKind: 'canonical-git', ...identity, buildSha256: sha(await fs.readFile(fileURLToPath(import.meta.url))), nodeVersion: process.version, inputs: inputRows, files: await inventory(output), debug: { directory: 'dist-embedded.debug', files: await inventory(debugDirectory) }, closure: { requiredFiles: [...required].sort(), worker: { package: 'pi-subagents', version: '0.74.0', entry: 'src/workflows/scripted-workflow.js', sourceSha256: sha(await fs.readFile(path.join(directory, 'node_modules/pi-subagents/src/workflows/scripted-workflow.js'))), kind: 'eval-worker', parser: 'node_modules/acorn/dist/acorn.js', parserVersion: '8.18.0' }, externalModules: ['ssh2'], optionalNative, dependencies: await Promise.all([...packageRoots].sort().map(async root => { const meta = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); return { name: meta.name, version: meta.version, license: meta.license ?? meta.licenses ?? null }; })), traceWarnings: [...traced.warnings].map(error => error.message) } };
  await fs.writeFile(path.join(directory, 'dist-embedded.build.json'), JSON.stringify(proof, null, 2) + '\n'); return proof;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) { const proof = await buildEmbeddedResearch(); process.stdout.write(JSON.stringify({ files: proof.files.length, bytes: proof.files.reduce((sum, row) => sum + row.size, 0), sourceDigest: proof.sourceDigest, warnings: proof.closure.traceWarnings }) + '\n'); }
