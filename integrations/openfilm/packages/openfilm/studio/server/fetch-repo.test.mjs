import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FetchError, cloneInto, createFetches, fetchFilm, parseRepoUrl, splitTree } from './fetch-repo.mjs';

const refused = (input, code) => assert.throws(() => parseRepoUrl(input), (e) => e instanceof FetchError && e.code === code, String(input));

test('a repository address, with or without .git, a slash or the scheme', () => {
  for (const input of ['https://github.com/openfilm/examples', 'https://github.com/openfilm/examples.git', 'https://github.com/openfilm/examples/', 'github.com/openfilm/examples']) {
    const source = parseRepoUrl(input);
    assert.equal(source.cloneUrl, 'https://github.com/openfilm/examples.git', input);
    assert.equal(source.name, 'examples');
    assert.equal(source.tree, null);
    assert.deepEqual(source.github, { owner: 'openfilm', repo: 'examples' }, 'GitHub: over https');
  }
});

test('a folder\'s address: what follows /tree/ is the ref and the folder, told apart later; a file\'s means its folder', () => {
  const folder = parseRepoUrl('https://github.com/openfilm/examples/tree/main/one-prompt');
  assert.deepEqual(folder.tree, ['main', 'one-prompt']);
  assert.equal(folder.blob, false);
  const file = parseRepoUrl('https://github.com/openfilm/examples/blob/main/one-prompt/film.html');
  assert.deepEqual(file.tree, ['main', 'one-prompt', 'film.html']);
  assert.equal(file.blob, true);
  assert.deepEqual(parseRepoUrl('https://github.com/o/r/tree/main/a%20b').tree, ['main', 'a b']);
  const lab = parseRepoUrl('https://gitlab.com/group/sub/film/-/tree/main/one');
  assert.equal(lab.cloneUrl, 'https://gitlab.com/group/sub/film.git');
  assert.equal(lab.github, null, 'GitLab: through git');
  assert.deepEqual(lab.tree, ['main', 'one']);
});

test('only https github.com and gitlab.com addresses of a repository are taken', () => {
  refused('', 'url');
  refused('not a url', 'url');
  refused('http://github.com/o/r', 'url');
  refused('git@github.com:o/r.git', 'url');
  refused('ssh://github.com/o/r', 'url');
  refused('file:///tmp/r', 'url');
  refused('https://example.com/o/r', 'host');
  refused('https://github.com.evil.test/o/r', 'host');
  refused('https://user:pass@github.com/o/r', 'host');
  refused('https://github.com:8443/o/r', 'host');
  refused('https://github.com/o', 'url');
  refused('https://github.com/o/r/issues/1', 'url');
  refused('https://github.com/o;rm -rf ~/r', 'url');
  refused('https://github.com/o/r/tree/main/../../etc', 'url');
  refused('https://github.com/o/r/tree/main/%2e%2e', 'url');
  refused('https://github.com/o/r/tree/main/-x', 'url');
  refused('https://github.com/o/r/tree/main/a*', 'url');
});

test('the ref is the longest start of the path that is a branch or tag', () => {
  const refs = new Set(['main', 'feature/x', 'v1']);
  assert.deepEqual(splitTree(['main', 'one-prompt'], refs, false), { ref: 'main', folder: ['one-prompt'] });
  assert.deepEqual(splitTree(['feature', 'x', 'films', 'one'], refs, false), { ref: 'feature/x', folder: ['films', 'one'] });
  assert.deepEqual(splitTree(['main', 'one', 'film.html'], refs, true), { ref: 'main', folder: ['one'] });
  assert.deepEqual(splitTree(['v1'], refs, false), { ref: 'v1', folder: [] });
  assert.throws(() => splitTree(['nope', 'x'], refs, false), (e) => e.code === 'ref' && /nope/.test(e.message));
  assert.throws(() => splitTree(['0123abcd', 'x'], refs, false), (e) => e.code === 'ref' && /commit/.test(e.message));
});

/* ── git, against a bare repository on disk (no network) ── */

let scratch, origin, bigBlob;
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' });
before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'of-fetch-'));
  const work = join(scratch, 'work');
  mkdirSync(join(work, 'films', 'one', 'assets'), { recursive: true });
  mkdirSync(join(work, 'films', 'two'), { recursive: true });
  mkdirSync(join(work, 'docs'), { recursive: true });
  writeFileSync(join(work, 'README.md'), '# films\n');
  writeFileSync(join(work, 'films', 'one', 'film.html'), '<!doctype html><title>one</title>');
  writeFileSync(join(work, 'films', 'one', 'assets', 'a.txt'), 'a');
  writeFileSync(join(work, 'films', 'two', 'film.html'), '<!doctype html><title>two</title>');
  writeFileSync(join(work, 'docs', 'notes.md'), 'no film here');
  writeFileSync(join(work, 'big.bin'), randomBytes(512 * 1024));
  writeFileSync(join(work, 'film.html'), '<!doctype html><title>root</title>');
  git(scratch, 'init', '-q', work);
  git(work, 'add', '-A');
  git(work, 'commit', '-qm', 'films');
  git(work, 'branch', 'feature/x');
  bigBlob = git(work, 'rev-parse', 'HEAD:big.bin').trim();
  const bare = join(scratch, 'origin.git');
  git(scratch, 'clone', '-q', '--bare', work, bare);
  /* what github.com allows: partial clones */
  git(bare, 'config', 'uploadpack.allowFilter', 'true');
  origin = pathToFileURL(bare).href;
});

const source = (tree, blob = false) => ({ host: 'github', web: origin, cloneUrl: origin, name: 'origin', tree, blob });
const library = () => mkdtempSync(join(scratch, 'library-'));

test('a folder is a partial clone: only its files download, and only it is checked out', async () => {
  const dir = join(scratch, 'sparse');
  await cloneInto({ cloneUrl: origin, ref: 'main', folder: ['films', 'one'], dir });
  assert.ok(existsSync(join(dir, 'films', 'one', 'film.html')));
  assert.ok(existsSync(join(dir, 'films', 'one', 'assets', 'a.txt')));
  assert.ok(!existsSync(join(dir, 'films', 'two')), 'the folder beside it is not checked out');
  assert.ok(!existsSync(join(dir, 'big.bin')));
  /* the big file outside the folder was never downloaded (listed without fetching it) */
  const missing = git(dir, 'rev-list', '--objects', '--missing=print', 'HEAD').split('\n').filter((l) => l.startsWith('?')).map((l) => l.slice(1));
  assert.ok(missing.includes(bigBlob), 'big.bin stayed on the server');
});

test('a fetched folder lands in the library under its own name, without .git; a second copy gets a new name', async () => {
  const lib = library();
  const progress = [];
  const first = await fetchFilm(source(['main', 'films', 'one']), { library: lib, onProgress: (p) => progress.push(p) });
  assert.equal(first, join(lib, 'one'));
  assert.ok(existsSync(join(first, 'film.html')));
  assert.ok(existsSync(join(first, 'assets', 'a.txt')));
  assert.ok(!existsSync(join(first, '.git')));
  assert.deepEqual([...new Set(progress.map((p) => p.phase))].filter((p) => p !== 'checkout'), ['lookup', 'download', 'copy']);
  /* the bar follows the download of the folder's files: up to 100 once, never back to the start */
  const percents = progress.filter((p) => p.phase === 'download' && p.percent != null).map((p) => p.percent);
  assert.ok(percents.length && percents.at(-1) === 100, `the download says how far it got: ${percents}`);
  assert.deepEqual(percents, [...percents].sort((a, b) => a - b), `it only goes up: ${percents}`);
  const second = await fetchFilm(source(['feature', 'x', 'films', 'one']), { library: lib });
  assert.equal(second, join(lib, 'one 2'), 'a branch with a slash in its name');
  assert.deepEqual(readdirSync(lib).sort(), ['one', 'one 2'], 'nothing else left behind');
});

test('a whole repository is copied without its .git; a file\'s address fetches its folder', async () => {
  const lib = library();
  const whole = await fetchFilm(source(null), { library: lib });
  assert.equal(whole, join(lib, 'origin'));
  assert.ok(existsSync(join(whole, 'film.html')));
  assert.ok(existsSync(join(whole, 'films', 'two', 'film.html')));
  assert.ok(!existsSync(join(whole, '.git')));
  const two = await fetchFilm(source(['main', 'films', 'two', 'film.html'], true), { library: lib });
  assert.equal(two, join(lib, 'two'));
});

test('no film.html, no such folder, no such branch, too big: said plainly, and nothing is left in the library', async () => {
  const lib = library();
  const fails = async (src, code, options = {}) => {
    await assert.rejects(fetchFilm(src, { library: lib, ...options }), (e) => e instanceof FetchError && e.code === code);
    assert.deepEqual(readdirSync(lib), [], `${code}: nothing left`);
  };
  await fails(source(['main', 'docs']), 'no-film');
  await fails(source(['main', 'films', 'three']), 'no-folder');
  await fails(source(['nope', 'films']), 'ref');
  await fails(source(null), 'too-big', { maxBytes: 64 * 1024 });
  await fails({ ...source(null), cloneUrl: pathToFileURL(join(scratch, 'none.git')).href }, 'access');
  const control = new AbortController();
  control.abort();
  await fails(source(null), 'cancelled', { signal: control.signal });
});

test('the job list: a wrong address is refused at once; a job says how it went', async () => {
  const fetches = createFetches({ library: () => join(scratch, 'jobs'), open: async () => ({ id: 'p' }) });
  assert.throws(() => fetches.start('https://example.com/o/r'), (e) => e.code === 'host');
  assert.throws(() => fetches.get('nope'), (e) => e.status === 404);
  /* stopped at once, before anything is asked (no network): it reports how it ended */
  const job = fetches.start('https://github.com/openfilm/examples/tree/main/x');
  assert.equal(job.state, 'running');
  fetches.cancel(job.id);
  for (let i = 0; i < 100 && fetches.get(job.id).state === 'running'; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([fetches.get(job.id).state, fetches.get(job.id).code], ['failed', 'cancelled']);
});

/* ── over https, against a GitHub of our own: its API and its raw files, read from the work tree ── */

const COMMIT = 'c'.repeat(40);
let github;
/* what the fake GitHub was asked; a file named here drops its connection half way the first time it is asked */
const asked = [];
const dropOnce = new Set();
const filesUnder = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name === '.git') return [];
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  return entry.isDirectory() ? filesUnder(join(dir, entry.name), path) : [{ path, type: 'blob', mode: '100644', size: statSync(join(dir, entry.name)).size }];
});
before(async () => {
  const work = join(scratch, 'work');
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    asked.push(url.pathname);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'raw') {
      /* raw/owner/repo/commit/…path */
      const path = parts.slice(4).join('/');
      if (parts[3] !== COMMIT || !existsSync(join(work, path))) { res.writeHead(404).end(); return; }
      const body = readFileSync(join(work, path));
      res.writeHead(200, { 'content-length': body.length });
      if (dropOnce.delete(path)) { res.write(body.subarray(0, body.length >> 1)); setTimeout(() => res.destroy(), 20); return; }
      res.end(body);
      return;
    }
    /* repos/owner/repo/… */
    if (parts[1] === 'private') { res.writeHead(404).end('{}'); return; }
    if (parts[3] === 'commits') {
      const ref = parts.slice(4).join('/');
      if (['HEAD', 'main', 'feature/x'].includes(ref)) res.writeHead(200).end(COMMIT);
      else res.writeHead(422).end('{}');
      return;
    }
    if (parts[3] === 'git' && parts[4] === 'trees') {
      const [commit, folder = ''] = parts.slice(5).join('/').split(':');
      const dir = join(work, folder);
      if (commit !== COMMIT || !existsSync(dir)) { res.writeHead(404).end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ truncated: false, tree: filesUnder(dir) }));
      return;
    }
    res.writeHead(404).end('{}');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const at = `http://127.0.0.1:${server.address().port}`;
  github = { server, hosts: { api: at, raw: `${at}/raw` } };
});
after(() => github?.server.close());

const overHttp = (tree, blob = false, owner = 'o') => ({ ...source(tree, blob), github: { owner, repo: 'r' } });

test('over https: the size is known before the first byte, and the bar only goes up, to 100', async () => {
  const lib = library();
  const seen = [];
  const to = await fetchFilm(overHttp(['main', 'films', 'one']), { library: lib, hosts: github.hosts, onProgress: (p) => seen.push(p) });
  assert.equal(to, join(lib, 'one'));
  assert.equal(readFileSync(join(to, 'film.html'), 'utf8'), '<!doctype html><title>one</title>');
  assert.equal(readFileSync(join(to, 'assets', 'a.txt'), 'utf8'), 'a');
  assert.deepEqual(readdirSync(lib), ['one'], 'nothing else left behind');
  assert.deepEqual([...new Set(seen.map((p) => p.phase))], ['lookup', 'download', 'copy']);
  const downloads = seen.filter((p) => p.phase === 'download');
  const total = statSync(join(to, 'film.html')).size + 1;
  assert.ok(downloads.every((p) => p.total === total), 'the total from the start');
  const percents = downloads.map((p) => p.percent);
  assert.deepEqual(percents, [...percents].sort((a, b) => a - b));
  assert.equal(percents.at(-1), 100);
  assert.equal(seen.at(-1).bytes, total);
});

test('over https: a branch with a slash in its name; the whole repository; a file\'s address means its folder', async () => {
  const lib = library();
  assert.equal(await fetchFilm(overHttp(['feature', 'x', 'films', 'one']), { library: lib, hosts: github.hosts }), join(lib, 'one'));
  const whole = await fetchFilm(overHttp(null), { library: lib, hosts: github.hosts });
  assert.equal(whole, join(lib, 'origin'));
  assert.ok(existsSync(join(whole, 'films', 'two', 'film.html')));
  assert.ok(!existsSync(join(whole, '.git')));
  assert.equal(await fetchFilm(overHttp(['main', 'films', 'two', 'film.html'], true), { library: lib, hosts: github.hosts }), join(lib, 'two'));
});

test('over https: no film, no folder, no branch, too big: said before anything downloads', async () => {
  const lib = library();
  const fails = async (src, code, options = {}) => {
    asked.length = 0;
    await assert.rejects(fetchFilm(src, { library: lib, hosts: github.hosts, ...options }), (e) => e instanceof FetchError && e.code === code);
    assert.deepEqual(readdirSync(lib), [], `${code}: nothing left`);
    assert.ok(!asked.some((path) => path.startsWith('/raw/')), `${code}: no file was downloaded`);
  };
  await fails(overHttp(['main', 'docs']), 'no-film');
  await fails(overHttp(['main', 'films', 'three']), 'no-folder');
  await fails(overHttp(['nope', 'films']), 'ref');
  await fails(overHttp(null), 'too-big', { maxBytes: 64 * 1024 });
});

test('over https: a connection that drops is tried again, and its bytes are not counted twice', async () => {
  const lib = library();
  dropOnce.add('big.bin');
  let last = null;
  const to = await fetchFilm(overHttp(null), { library: lib, hosts: github.hosts, onProgress: (p) => { last = p; } });
  assert.equal(dropOnce.size, 0, 'it did drop');
  assert.ok(readFileSync(join(to, 'big.bin')).equals(readFileSync(join(scratch, 'work', 'big.bin'))));
  assert.equal(last.bytes, last.total);
});

test('a repository GitHub\'s API cannot see (private) is fetched with git instead', async () => {
  const lib = library();
  const to = await fetchFilm(overHttp(['main', 'films', 'one'], false, 'private'), { library: lib, hosts: github.hosts });
  assert.equal(to, join(lib, 'one'));
  assert.ok(existsSync(join(to, 'film.html')));
});

test('over https: cancelled while downloading, it stops and leaves nothing', async () => {
  const lib = library();
  const control = new AbortController();
  await assert.rejects(
    fetchFilm(overHttp(null), { library: lib, hosts: github.hosts, signal: control.signal, onProgress: (p) => { if (p.phase === 'download') control.abort(); } }),
    (e) => e.code === 'cancelled',
  );
  assert.deepEqual(readdirSync(lib), []);
});
