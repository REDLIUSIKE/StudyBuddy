/**
 * ffmpeg and ffprobe: Studio and `openfilm` need them for video pictures, sound and every export. The installer brings
 * its own (scripts/release.mjs puts them in the app's resources, `runtime/ffmpeg`, with their license), so the app
 * works without a download. A build without them (from source) downloads them once into its data folder when the
 * computer has none on its PATH. Both come from the ffmpeg-static project's release (static builds, GPL-3.0, as
 * published there), each checked against the sha256 pinned here. The folder is on the PATH Studio and the agents get
 * from the start, so they find the programs the moment they land, without a restart.
 *
 * Reads no Electron module, so `node --test` can use it.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const RELEASE = 'b6.1.1';
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`;
/**
 * The pinned builds: `<program>-<platform>-<arch>.gz` and its sha256 (as the release publishes it), and the FFmpeg
 * version each is (as `ffmpeg -version` says), whose source goes beside it for its GPL.
 */
const BUILDS = Object.freeze({
  'darwin-arm64': {
    version: '6.0',
    ffmpeg: '8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa',
    ffprobe: 'd986a8ec7b030899fe66a8a288ed809a3543338705a3ce178cfb85869c5d80be',
  },
  'darwin-x64': {
    version: '6.1.1',
    ffmpeg: '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106',
    ffprobe: 'd4da574d6e2e197bd259b47d69cf262df9e312af24ad960444f6d806d3d4c186',
  },
  'win32-x64': {
    version: '6.1.1',
    ffmpeg: '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',
    ffprobe: 'f309e6223ad89d2fe54bccd420a7709b66fd27540674e92309578ed491a43c8d',
  },
});

/** A download that brings nothing for this long has stalled: it is stopped and tried again. */
const STALL_MS = 30_000;
const TRIES = 3;

const exe = (name, platform = process.platform) => (platform === 'win32' ? `${name}.exe` : name);

/** The folder the downloaded programs go in (on the PATH of Studio and the agents, whether they are there yet or not). */
export const ffmpegDir = (dataDir) => join(dataDir, 'runtime', `ffmpeg-${RELEASE}`);

/** Whether a folder holds both programs (the installer's, or a download that finished). */
export const ffmpegIn = (dir, platform = process.platform) => ['ffmpeg', 'ffprobe'].every((n) => existsSync(join(dir, exe(n, platform))));

/** Whether both programs run from this PATH. */
export function ffmpegOnPath(path) {
  return ['ffmpeg', 'ffprobe'].every((bin) => {
    const r = spawnSync(bin, ['-version'], { stdio: 'ignore', env: { ...process.env, PATH: path }, windowsHide: true });
    return !r.error && r.status === 0;
  });
}

/** Whether this machine has a build to download. */
export const ffmpegDownloadable = (platform = process.platform, arch = process.arch) => Object.hasOwn(BUILDS, `${platform}-${arch}`);

let downloading = null;

/**
 * Download both programs into `ffmpegDir(dataDir)` (once; a download in progress is shared). `onProgress(0..1)`.
 * @param {string} dataDir @param {{ onProgress?: (fraction: number) => void, fetch?: typeof fetch }} [options]
 */
export function ensureFfmpeg(dataDir, { onProgress = () => {}, fetch: fetchImpl = fetch } = {}) {
  const dir = ffmpegDir(dataDir);
  if (ffmpegIn(dir)) return Promise.resolve(dir);
  downloading ??= fetchFfmpeg(dir, { onProgress, fetch: fetchImpl }).finally(() => { downloading = null; });
  return downloading;
}

/**
 * Download one platform's build into `dir`: both programs, and with `license`, its LICENSE, its README and where its
 * source is (what the installer ships beside them). A download that stalls is tried again.
 * @param {string} dir
 * @param {{ platform?: string, arch?: string, license?: boolean, onProgress?: (fraction: number) => void, fetch?: typeof fetch, stallMs?: number }} [options]
 */
export async function fetchFfmpeg(dir, { platform = process.platform, arch = process.arch, license = false, onProgress = () => {}, fetch: fetchImpl = fetch, stallMs = STALL_MS } = {}) {
  const key = `${platform}-${arch}`;
  const build = BUILDS[key];
  if (!build) throw new Error(`There is no ffmpeg to download for ${key}: install it from ffmpeg.org.`);
  mkdirSync(dir, { recursive: true });
  const names = /** @type {const} */ (['ffmpeg', 'ffprobe']);
  const got = { ffmpeg: 0, ffprobe: 0 };
  const total = { ffmpeg: 0, ffprobe: 0 };
  const tell = () => {
    const all = total.ffmpeg + total.ffprobe;
    if (all) onProgress(Math.min(0.99, (got.ffmpeg + got.ffprobe) / all));
  };
  await Promise.all(names.map(async (name) => {
    const target = join(dir, exe(name, platform));
    if (existsSync(target)) return;
    const gz = await retried(() => {
      got[name] = 0;
      return download(`${BASE}/${name}-${key}.gz`, fetchImpl, stallMs, (size) => { total[name] = size; }, (n) => { got[name] += n; tell(); });
    });
    if (createHash('sha256').update(gz).digest('hex') !== build[name]) throw new Error(`The ${name} download did not match its checksum; nothing was kept.`);
    const part = `${target}.part`;
    writeFileSync(part, gunzipSync(gz));
    chmodSync(part, 0o755);
    renameSync(part, target);
  }));
  if (license) {
    for (const [from, to] of [[`${key}.LICENSE`, 'LICENSE'], [`${key}.README`, 'README']]) {
      writeFileSync(join(dir, to), await retried(() => download(`${BASE}/${from}`, fetchImpl, stallMs)));
    }
    writeFileSync(join(dir, 'SOURCE'), `FFmpeg ${build.version}, the static build of ffmpeg-static ${RELEASE} (${BASE}).\n`
      + `Its source: https://ffmpeg.org/releases/ffmpeg-${build.version}.tar.xz\n`);
  }
  onProgress(1);
  return dir;
}

/** One file's bytes; one that stops coming for `stallMs` is an error. */
async function download(url, fetchImpl, stallMs, onSize = () => {}, onBytes = () => {}) {
  const stop = new AbortController();
  let timer = setTimeout(() => stop.abort(), stallMs);
  const alive = () => { clearTimeout(timer); timer = setTimeout(() => stop.abort(), stallMs); };
  try {
    const res = await fetchImpl(url, { signal: stop.signal });
    if (!res.ok || !res.body) throw new Error(`Downloading ${url.split('/').pop()} failed (${res.status}).`);
    onSize(Number(res.headers.get('content-length')) || 0);
    const chunks = [];
    for await (const chunk of res.body) {
      alive();
      chunks.push(chunk);
      onBytes(chunk.length);
    }
    return Buffer.concat(chunks);
  } catch (e) {
    if (stop.signal.aborted) throw new Error(`Downloading ${url.split('/').pop()} stalled.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function retried(attempt) {
  for (let i = 1; ; i++) {
    try { return await attempt(); } catch (e) { if (i >= TRIES) throw e; }
  }
}
