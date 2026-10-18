/** Original fixed growth-image export: bounded PNG, user-selected path, no overwrite. */
import { open, mkdtemp, rm } from 'node:fs/promises';
import { linkSync } from 'node:fs';
import { dirname, extname, join, resolve, basename } from 'node:path';
const maximum = 10 * 1024 * 1024;
const canonicalVersion = (version) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(version);
/** Custom navigation is a narrow action, never a caller-controlled download URL or filename. */
export function parseGrowthSaveUrl(value) {
    if (!URL.canParse(value))
        return null;
    const url = new URL(value), version = url.searchParams.get('version'), queries = [...url.searchParams];
    return url.protocol === 'studybuddy:' && url.hostname === 'personal-profile' && !url.username && !url.password && !url.port && url.pathname === '/save-growth' && !url.hash && queries.length === 1 && queries[0]?.[0] === 'version' && version !== null && canonicalVersion(version) ? version : null;
}
/** The authoritative backend already validates access and the requested activity snapshot. */
export async function downloadGrowthPng(version, accessToken, fetcher) {
    if (!canonicalVersion(version) || !accessToken || accessToken.length > 4096)
        throw new Error('PROFILE_GROWTH_INVALID');
    const response = await fetcher('https://guijitongzhuo.com/api/v1/my-ai/activity/growth-image', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: 'Bearer ' + accessToken, Accept: 'image/png', 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshotVersion: version }) });
    if (!response.ok)
        throw new Error(response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'PROFILE_GROWTH_FAILED');
    const length = response.headers.get('content-length');
    if (response.headers.get('content-type') !== 'image/png' || length !== null && (!/^\d+$/.test(length) || Number(length) > maximum) || !response.body)
        throw new Error('PROFILE_GROWTH_INVALID');
    const reader = response.body.getReader(), chunks = [];
    let total = 0;
    try {
        for (;;) {
            const result = await reader.read();
            if (result.done)
                break;
            total += result.value.length;
            if (total > maximum)
                throw new Error('PROFILE_GROWTH_INVALID');
            chunks.push(result.value);
        }
    }
    finally {
        await reader.cancel();
        reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, total);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== 1080 || bytes.readUInt32BE(20) !== 1440)
        throw new Error('PROFILE_GROWTH_INVALID');
    return bytes;
}
/** Stage and fsync first; synchronous no-clobber commit cannot interleave an account replacement. */
export async function persistGrowthPng(target, bytes, stillOwner) {
    if (!extname(target))
        target += '.png';
    if (extname(target).toLowerCase() !== '.png')
        throw new Error('PROFILE_GROWTH_PATH_INVALID');
    target = resolve(target);
    const parent = dirname(target), temporary = await mkdtemp(join(parent, '.studybuddy-token-growth-')), staged = join(temporary, 'growth.png');
    try {
        const file = await open(staged, 'wx');
        try {
            await file.writeFile(bytes);
            await file.sync();
        }
        finally {
            await file.close();
        }
        if (!stillOwner())
            throw new Error('ACCOUNT_SCOPE_CHANGED');
        linkSync(staged, target);
    }
    finally {
        if (dirname(resolve(temporary)) !== parent || !basename(temporary).startsWith('.studybuddy-token-growth-'))
            throw new Error('PROFILE_GROWTH_PATH_INVALID');
        await rm(temporary, { recursive: true, force: true });
    }
}
//# sourceMappingURL=growth-image.js.map