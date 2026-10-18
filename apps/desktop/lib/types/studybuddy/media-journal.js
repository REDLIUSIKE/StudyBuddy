/** Keyless request ownership, kept in the original product account directory. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { HARNESS_IMAGE_MODELS, HARNESS_VIDEO_MODEL } from '@studybuddy/contracts';
const invalid = () => { throw Error('HARNESS_MEDIA_JOURNAL_INVALID'); };
const uuid = (id) => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
function parse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return invalid();
    const r = value, keys = ['schemaVersion', 'accountId', 'sessionId', 'requestId', 'kind', 'modelId', 'inputHash'];
    if (Object.keys(r).length !== keys.length || Object.keys(r).some(k => !keys.includes(k)) || r.schemaVersion !== 1 ||
        typeof r.accountId !== 'string' || !r.accountId || r.accountId.length > 256 || typeof r.sessionId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(r.sessionId) || typeof r.requestId !== 'string' || !uuid(r.requestId) ||
        typeof r.inputHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.inputHash) ||
        !(r.kind === 'image' && HARNESS_IMAGE_MODELS.includes(r.modelId) || r.kind === 'video' && r.modelId === HARNESS_VIDEO_MODEL))
        return invalid();
    return { schemaVersion: 1, accountId: r.accountId, sessionId: r.sessionId, requestId: r.requestId, kind: r.kind,
        modelId: r.modelId, inputHash: r.inputHash };
}
export class DiskMediaRequestJournal {
    root;
    constructor(root) {
        this.root = root;
    }
    path(account, id) {
        if (!account || account.length > 256 || !uuid(id))
            return invalid();
        return join(this.root, createHash('sha256').update(account).digest('hex'), id + '.json');
    }
    async get(account, id) {
        const target = this.path(account, id);
        try {
            const stat = await lstat(target);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192)
                return invalid();
            const row = parse(JSON.parse(await readFile(target, 'utf8')));
            if (row.accountId !== account || row.requestId !== id)
                return invalid();
            return row;
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
    }
    async claim(value) {
        const row = parse(value), target = this.path(row.accountId, row.requestId), directory = join(this.root, createHash('sha256').update(row.accountId).digest('hex'));
        await mkdir(directory, { recursive: true });
        const stat = await lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            return invalid();
        const temporary = join(directory, randomUUID() + '.pending');
        await writeFile(temporary, JSON.stringify(row) + '\n', { flag: 'wx', mode: 0o600 });
        try {
            // The published filename becomes visible only after every JSON byte was written.
            await link(temporary, target);
            return { row, created: true };
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
        finally {
            await unlink(temporary);
        }
        const old = await this.get(row.accountId, row.requestId);
        if (!old)
            return invalid();
        return { row: old, created: false };
    }
}
//# sourceMappingURL=media-journal.js.map