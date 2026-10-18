/** Node-side Session preparation for browser Preview data overlays. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { isSessionFormatJsonObject, parseSessionFormatLogFilename, sessionFormatLogFilename } from '@deepseek-ai/dsh-session-format';
import { createSessionFormatCatalogWithChildren, historicalSessionFormatCatalog, sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog';
import { historicalChildCatalogSource } from '@deepseek-ai/dsh-session-format-v3-to-v4';
import { packVfsOverlay } from "./pack.js";
/**
 * Pack Preview data with strictly validated current Session successors prepared in Node.
 * Committed source bytes remain in the overlay; only the newest canonical raw generation
 * of each Session is restored. Future, malformed, and unsupported selected data refuse the pack.
 * @param trees - Ordered source trees under the Preview's home and workspace mounts.
 * @returns Deterministic overlay containing unchanged inputs and final current successors.
 */
export function packPreviewFixture(trees) {
    const original = packVfsOverlay(trees);
    const successors = new Map();
    const sources = selectedSessions(original.files).map((source) => {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(source.bytes);
        if (!text.endsWith('\n'))
            throw new Error(`preview fixture: ${source.path} has a torn physical tail`);
        const [headerLine = '', ...rows] = text.slice(0, -1).split('\n');
        const header = JSON.parse(headerLine);
        if (!isSessionFormatJsonObject(header) || header['version'] !== source.version || header['id'] !== source.id) {
            throw new Error(`preview fixture: ${source.path} disagrees with its Session header`);
        }
        const catalog = source.version <= 3 ? historicalSessionFormatCatalog : sessionFormatCatalog;
        const restore = catalog.createRestore(header, { recovery: 'strict', validation: 'current' });
        const events = rows.map(row => JSON.parse(row));
        for (const event of events)
            restore.decodeRow(event);
        return { ...source, header, events, artifact: restore.finish() };
    });
    for (const source of sources) {
        if (source.version === sessionFormatCatalog.currentVersion)
            continue;
        const children = sources.filter(child => posix.dirname(child.directory) === posix.dirname(source.directory)
            && child.artifact.header.parentSession === source.id && child.artifact.header.origin === 'subagent')
            .map(child => ({ ...historicalChildCatalogSource(child.artifact), sourcePath: child.path }));
        const restore = createSessionFormatCatalogWithChildren(children).createRestore(source.header, { recovery: 'strict', validation: 'current' });
        for (const event of source.events)
            restore.decodeRow(event);
        const artifact = restore.finish();
        const encodedHeader = sessionFormatCatalog.encodeCurrentHeader(artifact.header, artifact.inheritedEventCount);
        const encodedEvents = artifact.events.map(event => sessionFormatCatalog.encodeCurrentEvent(event));
        const verification = sessionFormatCatalog.createRestore(encodedHeader, { recovery: 'strict', validation: 'current' });
        for (const event of encodedEvents)
            verification.decodeRow(event);
        verification.finish();
        successors.set(posix.join(source.directory, sessionFormatLogFilename(sessionFormatCatalog.currentVersion)), [encodedHeader, ...encodedEvents].map(row => JSON.stringify(row) + '\n').join(''));
    }
    if (successors.size === 0)
        return original;
    const directory = mkdtempSync(join(tmpdir(), 'dsh-preview-sessions-'));
    try {
        for (const [imagePath, content] of successors) {
            const path = join(directory, imagePath.slice('home/sessions/'.length));
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, content, { flag: 'wx' });
        }
        return packVfsOverlay([...trees, { mount: 'home/sessions', directory }]);
    }
    finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
function selectedSessions(files) {
    const selected = new Map();
    for (const [path, bytes] of Object.entries(files)) {
        const match = /^home\/sessions\/[^/]+\/([^/]+)\/(session(?:\..*)?\.jsonl(?:\.zstd)?)$/u.exec(path);
        if (match === null)
            continue;
        const version = parseSessionFormatLogFilename(match[2]);
        if (version === undefined)
            throw new Error(`preview fixture: ${path} must name a canonical raw Session generation`);
        const directory = posix.dirname(path);
        const previous = selected.get(directory);
        if (previous === undefined || previous.version < version) {
            selected.set(directory, { path, directory, id: match[1], version, bytes });
        }
    }
    return [...selected.values()];
}
//# sourceMappingURL=preview.js.map