import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { assertVideoPath } from "./video-path.js";
/** Only actual dialog results or preload-resolved dropped Files reach the private path owner. */
export class VideoNativeFiles {
    options;
    constructor(options) {
        this.options = options;
    }
    async admit(scope, project, kind, paths, check) {
        if (kind !== 'project' && !project)
            throw Error('VIDEO_PROJECT_NOT_SELECTED');
        if (paths.length > 2048 || paths.some(path => typeof path !== 'string' || !isAbsolute(path) || path.length > 4096 || path.includes('\0')))
            throw Error('VIDEO_PATH_PICKER_INVALID');
        const result = [];
        for (let at = 0; at < paths.length; at += 128) {
            check();
            const chosen = paths.slice(at, at + 128);
            result.push(...await this.options.admit(scope, kind === 'project' ? { kind, paths: chosen } : { kind, paths: chosen, scope: project }));
            check();
        }
        return result;
    }
    async pick(scope, project, value, check) {
        check();
        if (!value || typeof value !== 'object' || Array.isArray(value) || !('purpose' in value) || !['project', 'asset', 'export'].includes(String(value.purpose)) || !('folder' in value) || typeof value.folder !== 'boolean' || value.purpose !== 'asset' && !value.folder || Object.keys(value).some(key => !['purpose', 'folder', 'title', 'button', 'at'].includes(key)))
            throw Error('VIDEO_PATH_PICKER_INVALID');
        const fields = {};
        for (const key of ['title', 'button', 'at']) {
            const field = Reflect.get(value, key);
            if (field !== undefined) {
                if (typeof field !== 'string' || field.length > (key === 'at' ? 4096 : 120) || field.includes('\0'))
                    throw Error('VIDEO_PATH_PICKER_INVALID');
                fields[key] = field;
            }
        }
        const kind = value.purpose;
        if (kind !== 'project' && !project)
            throw Error('VIDEO_PROJECT_NOT_SELECTED');
        const selected = await this.options.show({ ...(fields.title ? { title: fields.title } : {}), properties: value.folder ? ['openDirectory'] : ['openFile', 'multiSelections'], ...(fields.button ? { buttonLabel: fields.button } : {}), ...(fields.at ? { defaultPath: fields.at } : {}) });
        check();
        if (selected.canceled)
            return [];
        return this.admit(scope, project, kind, selected.filePaths, check);
    }
    dropped(scope, project, purpose, paths, check) {
        check();
        if (purpose !== 'project' && purpose !== 'asset' || !Array.isArray(paths) || paths.some(path => typeof path !== 'string'))
            throw Error('VIDEO_PATH_PICKER_INVALID');
        return this.admit(scope, project, purpose, paths, check);
    }
}
/** Native user selections are persisted outside projects and separated by the authenticated account. */
export class VideoPathStore {
    directory;
    isCurrent;
    queues = new Map();
    constructor(directory, isCurrent) {
        this.directory = directory;
        this.isCurrent = isCurrent;
    }
    check(scope) { if (!this.isCurrent(scope))
        throw Error('VIDEO_SCOPE_REVOKED'); }
    async read(scope) {
        this.check(scope);
        const file = join(this.directory(scope), 'path-grants.json');
        await assertVideoPath(file);
        let raw;
        try {
            raw = await readFile(file, 'utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
        this.check(scope);
        if (raw.length > 2 * 1024 * 1024)
            throw Error('VIDEO_PATH_STORE_INVALID');
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1 || !('paths' in value) || !Array.isArray(value.paths) || value.paths.length > 2048 || Object.keys(value).sort().join(',') !== 'paths,schemaVersion')
            throw Error('VIDEO_PATH_STORE_INVALID');
        return value.paths.map((entry) => {
            if (!entry || typeof entry !== 'object' || !('kind' in entry) || !['project', 'asset', 'export'].includes(String(entry.kind)) || !('path' in entry) || typeof entry.path !== 'string' || !isAbsolute(entry.path) || entry.path.length > 4096 || entry.path.includes('\0'))
                throw Error('VIDEO_PATH_STORE_INVALID');
            if (entry.kind === 'project') {
                if (Object.keys(entry).sort().join(',') !== 'kind,path')
                    throw Error('VIDEO_PATH_STORE_INVALID');
                return { kind: 'project', path: entry.path };
            }
            if ((entry.kind !== 'asset' && entry.kind !== 'export') || !('projectId' in entry) || typeof entry.projectId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.projectId) || Object.keys(entry).sort().join(',') !== 'kind,path,projectId')
                throw Error('VIDEO_PATH_STORE_INVALID');
            return { kind: entry.kind, path: entry.path, projectId: entry.projectId };
        });
    }
    async canonical(scope, kind, paths) {
        this.check(scope);
        if (!paths.length || paths.length > 128)
            throw Error('VIDEO_PATH_ADMISSION_INVALID');
        const result = [];
        for (const path of paths) {
            if (!isAbsolute(path) || path.includes('\0') || path.length > 4096)
                throw Error('VIDEO_PATH_DENIED');
            const canonical = await realpath(path);
            await assertVideoPath(canonical);
            const info = await lstat(canonical);
            this.check(scope);
            if (kind === 'asset' ? !info.isFile() && !info.isDirectory() : !info.isDirectory())
                throw Error('VIDEO_PATH_DENIED');
            if (!result.includes(canonical))
                result.push(canonical);
        }
        return result;
    }
    async available(scope, kind, paths) {
        const result = [];
        for (const path of paths) {
            try {
                const values = await this.canonical(scope, kind, [path]);
                if (values[0] === path)
                    result.push(path);
            }
            catch (error) {
                this.check(scope);
                if (error instanceof Error && (error.message === 'VIDEO_PATH_DENIED' || 'code' in error && ['ENOENT', 'ENOTDIR', 'EACCES'].includes(String(error.code))))
                    continue;
                throw error;
            }
        }
        this.check(scope);
        return result;
    }
    async commit(scope, kind, paths, projectId) {
        if (kind !== 'project' && (!projectId || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId)))
            throw Error('VIDEO_PATH_ADMISSION_INVALID');
        return this.update(scope, saved => {
            const next = [...saved];
            for (const path of paths)
                if (!next.some(row => row.kind === kind && row.path === path && row.projectId === projectId))
                    next.push({ kind, path, ...(kind !== 'project' ? { projectId: projectId } : {}) });
            return next;
        });
    }
    /** Persist an original domain rename only within the same admitted parent directory. */
    async relocated(scope, workspaceRoot, from, to) {
        if (!isAbsolute(from) || !isAbsolute(to) || dirname(from) !== dirname(to) || from === to)
            throw Error('VIDEO_PATH_ADMISSION_INVALID');
        await assertVideoPath(from);
        const [canonical] = await this.canonical(scope, 'project', [to]);
        if (canonical !== to)
            throw Error('VIDEO_PATH_DENIED');
        await this.update(scope, saved => {
            const within = (root, path) => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep); };
            if (!within(workspaceRoot, from) && !saved.some(entry => entry.kind === 'project' && within(entry.path, from)))
                throw Error('VIDEO_PROJECT_PATH_NOT_ADMITTED');
            return [...saved.filter(entry => entry.kind !== 'project' || entry.path !== from), ...(!saved.some(entry => entry.kind === 'project' && entry.path === to) ? [{ kind: 'project', path: to }] : [])];
        });
    }
    async update(scope, change) {
        this.check(scope);
        const previous = this.queues.get(scope.accountId) ?? Promise.resolve();
        const transaction = previous.catch(() => { }).then(async () => {
            this.check(scope);
            const next = change(await this.read(scope));
            if (next.length > 2048)
                throw Error('VIDEO_PATH_STORE_FULL');
            const file = join(this.directory(scope), 'path-grants.json');
            await assertVideoPath(file);
            await mkdir(dirname(file), { recursive: true });
            await assertVideoPath(file);
            this.check(scope);
            const temporary = file + '.' + randomUUID() + '.tmp';
            try {
                await writeFile(temporary, JSON.stringify({ schemaVersion: 1, paths: next }) + '\n', { flag: 'wx', mode: 0o600 });
                this.check(scope);
                await assertVideoPath(file);
                await rename(temporary, file);
                this.check(scope);
            }
            finally {
                await assertVideoPath(temporary);
                await rm(temporary, { force: true });
            }
        });
        this.queues.set(scope.accountId, transaction);
        try {
            await transaction;
        }
        finally {
            if (this.queues.get(scope.accountId) === transaction)
                this.queues.delete(scope.accountId);
        }
    }
}
//# sourceMappingURL=video-path-store.js.map