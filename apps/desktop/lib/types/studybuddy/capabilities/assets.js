import { createHash } from 'node:crypto';
import { open, stat, readFile, realpath } from 'node:fs/promises';
import { relative, isAbsolute, resolve } from 'node:path';
import { parseHarnessCapabilityResultV1 } from '@studybuddy/contracts';
import { assertVideoPath } from "../video-path.js";
/** Bounded container validation only: archives are never extracted by this bridge. */
function validZip(bytes) {
    if (bytes.length < 22)
        return false;
    for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
        if (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)
            continue;
        const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
        if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0 || bytes.readUInt16LE(end + 8) !== count || start + size !== end)
            return false;
        let offset = start;
        for (let entry = 0; entry < count; entry++) {
            if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
                return false;
            const name = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42), compressed = bytes.readUInt32LE(offset + 20);
            if (offset + 46 + name + extra + comment > end || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28) + compressed > start)
                return false;
            offset += 46 + name + extra + comment;
        }
        return offset === end;
    }
    return false;
}
function verify(bytes, artifact) {
    if (!Buffer.isBuffer(bytes) || bytes.length !== artifact.bytes || bytes.length > 100 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256)
        throw Error('CAPABILITY_CONTENT_INVALID');
    const mime = artifact.mime;
    let caption = false;
    if (mime === 'text/vtt')
        try {
            caption = /^WEBVTT(?:[ \t][^\r\n]*)?(?:\r?\n|$)/.test(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) && !bytes.includes(0);
        }
        catch { /* Invalid UTF-8 is not a caption. */ }
    const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === 'image/webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' : mime === 'video/mp4' ? bytes.toString('ascii', 4, 8) === 'ftyp' : mime === 'audio/wav' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE' : mime === 'audio/mpeg' ? bytes.toString('ascii', 0, 3) === 'ID3' || bytes[0] === 255 && ((bytes[1] ?? 0) & 224) === 224 : mime === 'text/vtt' ? caption : mime === 'application/zip' ? validZip(bytes) : mime === 'text/plain' || mime === 'text/html' || mime === 'application/json';
    if (!valid)
        throw Error('CAPABILITY_CONTENT_INVALID');
}
/** Reads admitted private paths only; rechecks junctions and file identity after the read. */
export async function readCapabilityFile(path, artifact) {
    await assertVideoPath(path);
    const file = await open(path, 'r');
    try {
        const before = await file.stat();
        if (!before.isFile() || before.size !== artifact.bytes || before.size > 100 * 1024 * 1024)
            throw Error('CAPABILITY_CONTENT_INVALID');
        const bytes = await file.readFile(), after = await file.stat();
        await assertVideoPath(path);
        if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.size !== after.size)
            throw Error('CAPABILITY_CONTENT_CHANGED');
        verify(bytes, artifact);
        return bytes;
    }
    finally {
        await file.close();
    }
}
export async function createCapabilityFileArtifact(caller, target, file, mime, roots, schemaRef = 'media-v1') {
    await assertVideoPath(resolve(file));
    const path = await realpath(resolve(file)), canonicalRoots = [];
    for (const root of roots) {
        try {
            await assertVideoPath(resolve(root));
            canonicalRoots.push(await realpath(resolve(root)));
        }
        catch (error) {
            if (!['ENOENT', 'ENOTDIR'].includes(String(error.code)))
                throw error;
        }
    }
    if (!canonicalRoots.some(root => { const back = relative(root, path); return !!back && !isAbsolute(back) && back !== '..' && !back.startsWith('../') && !back.startsWith('..\\'); }))
        throw Error('CAPABILITY_FILE_NOT_ADMITTED');
    await assertVideoPath(path);
    const info = await stat(path);
    if (!info.isFile() || info.size > 100 * 1024 * 1024)
        throw Error('CAPABILITY_CONTENT_INVALID');
    const bytes = await readFile(path), sha256 = createHash('sha256').update(bytes).digest('hex');
    const artifact = { artifactRef: target.moduleId + '-' + createHash('sha256').update(JSON.stringify([caller.scope.accountId, caller.callerSessionId, target, path, sha256])).digest('hex'), moduleId: target.moduleId, schemaRef, originSessionId: caller.callerSessionId, mime, bytes: bytes.length, sha256 };
    await readCapabilityFile(path, artifact);
    return parseHarnessCapabilityResultV1({ data: null, artifacts: [artifact], operationRef: null }).artifacts[0];
}
const owner = (caller) => JSON.stringify([caller.scope, caller.hostGeneration, caller.callerSessionId]);
/** Main keeps source authority and bytes private. Domain import coordinators own names and writes. */
export class CapabilityAssetTransfer {
    options;
    sources = new Map();
    imports = new Map();
    constructor(options) {
        this.options = options;
    }
    register(caller, value, read) {
        this.options.assert(caller);
        const artifact = parseHarnessCapabilityResultV1({ data: null, artifacts: [value], operationRef: null }).artifacts[0];
        if (artifact.originSessionId !== caller.callerSessionId)
            throw Error('CAPABILITY_SOURCE_NOT_AUTHORIZED');
        const id = JSON.stringify([caller.scope.accountId, artifact.artifactRef]), old = this.sources.get(id);
        if (old && JSON.stringify(old.artifact) !== JSON.stringify(artifact))
            throw Error('CAPABILITY_ARTIFACT_CONFLICT');
        this.sources.set(id, { caller: structuredClone(caller), artifact, read, readers: new Set([owner(caller)]) });
    }
    /** Called by trusted project/source admission, never exposed as a model tool. */
    share(sourceCaller, artifactRef, recipient) {
        this.options.assert(sourceCaller);
        this.options.assert(recipient);
        const row = this.sources.get(JSON.stringify([sourceCaller.scope.accountId, artifactRef]));
        if (!row || owner(row.caller) !== owner(sourceCaller) || sourceCaller.scope.accountId !== recipient.scope.accountId)
            throw Error('CAPABILITY_SOURCE_NOT_AUTHORIZED');
        row.readers.add(owner(recipient));
    }
    async import(caller, sourceRef, target, signal = new AbortController().signal) {
        this.options.assert(caller);
        signal.throwIfAborted();
        const source = this.sources.get(JSON.stringify([caller.scope.accountId, sourceRef]));
        if (!source || !source.readers.has(owner(caller)))
            throw Error('CAPABILITY_SOURCE_NOT_AUTHORIZED');
        const id = JSON.stringify([caller.scope, caller.hostGeneration, target, sourceRef, source.artifact.sha256]);
        const existing = this.imports.get(id);
        if (existing) {
            const result = await existing;
            this.options.assert(caller);
            signal.throwIfAborted();
            return structuredClone(result);
        }
        const work = (async () => {
            const bytes = await source.read(signal);
            this.options.assert(caller);
            signal.throwIfAborted();
            verify(bytes, source.artifact);
            const artifact = await this.options.put(caller, target, source.artifact, bytes, signal);
            this.options.assert(caller);
            signal.throwIfAborted();
            if (artifact.moduleId !== target.moduleId || artifact.bytes !== bytes.length || artifact.sha256 !== source.artifact.sha256 || artifact.mime !== source.artifact.mime)
                throw Error('CAPABILITY_IMPORT_INVALID');
            return parseHarnessCapabilityResultV1({ data: null, artifacts: [artifact], operationRef: null }).artifacts[0];
        })();
        this.imports.set(id, work);
        // Keep unknown/failed outcomes: only explicit domain reconciliation may repeat a write.
        return structuredClone(await work);
    }
    async read(caller, ref, signal) {
        this.options.assert(caller);
        signal.throwIfAborted();
        const row = this.sources.get(JSON.stringify([caller.scope.accountId, ref]));
        if (!row || !row.readers.has(owner(caller)))
            throw Error('CAPABILITY_SOURCE_NOT_AUTHORIZED');
        const bytes = await row.read(signal);
        this.options.assert(caller);
        signal.throwIfAborted();
        verify(bytes, row.artifact);
        return { artifact: structuredClone(row.artifact), bytes };
    }
    revoke() { this.sources.clear(); this.imports.clear(); }
}
//# sourceMappingURL=assets.js.map