import { createRequire } from 'node:module';
import { constants, closeSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, parse, resolve, sep } from 'node:path';
/** Bind the write to directory objects, rather than a path checked before an asynchronous write. */
export async function withCapabilityOutputDirectory(directory, action, nativeModuleAnchor) {
    const require = createRequire(nativeModuleAnchor ?? new URL('../../../package.json', import.meta.url));
    const koffi = require('koffi'), absolute = resolve(directory), child = 'deliverables';
    if (koffi.version !== '3.1.1')
        throw Error('CAPABILITY_NATIVE_BINDING_UNREVIEWED');
    if (process.platform === 'win32') {
        if (!/^[A-Za-z]:\\/.test(absolute))
            throw Error('CAPABILITY_DIRECTORY_DENIED');
        const kernel = koffi.load('kernel32.dll'), create = kernel.func('CreateFileW', 'void *', ['str16', 'uint32', 'uint32', 'void *', 'uint32', 'uint32', 'void *']), info = kernel.func('GetFileInformationByHandle', 'int', ['void *', 'void *']), close = kernel.func('CloseHandle', 'int', ['void *']), lastError = kernel.func('GetLastError', 'uint32', []);
        const handles = [];
        const hold = (path) => {
            // No share-write/delete: another handle cannot replace, rename or set a reparse point on this directory.
            // FILE_LIST_DIRECTORY participates in Windows share-access checks; metadata-only access does not.
            const handle = create(path, 0x81, 1, null, 3, 0x02000000 | 0x00200000, null);
            if (handle === null || koffi.address(handle) === 0xffffffffffffffffn)
                throw Error('CAPABILITY_DIRECTORY_LOCK_FAILED:' + lastError());
            handles.push(handle);
            const metadata = Buffer.alloc(52);
            if (!info(handle, metadata) || (metadata.readUInt32LE(0) & 0x400) !== 0 || (metadata.readUInt32LE(0) & 0x10) === 0)
                throw Error('CAPABILITY_DIRECTORY_DENIED');
        };
        try {
            const root = parse(absolute).root;
            let current = root;
            hold(current);
            for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
                current = join(current, part);
                hold(current);
            }
            const output = join(absolute, child);
            await mkdir(output).catch(error => { if (error.code !== 'EEXIST')
                throw error; });
            hold(output);
            return await action(output);
        }
        finally {
            for (const handle of handles.reverse())
                if (!close(handle))
                    throw Error('CAPABILITY_DIRECTORY_UNLOCK_FAILED');
        }
    }
    if (process.platform !== 'linux' && process.platform !== 'darwin')
        throw Error('CAPABILITY_SECURE_DELIVERY_UNAVAILABLE');
    const library = koffi.load(process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6'), openAt = library.func('openat', 'int', ['int', 'str', 'int', 'uint32']), flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW, handles = [];
    try {
        let current = openSync('/', flags);
        handles.push(current);
        for (const part of absolute.split('/').filter(Boolean)) {
            const next = openAt(current, part, flags, 0);
            if (next < 0)
                throw Error('CAPABILITY_DIRECTORY_DENIED');
            handles.push(next);
            current = next;
        }
        const descriptorPath = (fd) => (process.platform === 'linux' ? '/proc/self/fd/' : '/dev/fd/') + fd;
        await mkdir(join(descriptorPath(current), child)).catch(error => { if (error.code !== 'EEXIST')
            throw error; });
        const output = openAt(current, child, flags, 0);
        if (output < 0)
            throw Error('CAPABILITY_DIRECTORY_DENIED');
        handles.push(output);
        return await action(descriptorPath(output));
    }
    finally {
        for (const handle of handles.reverse())
            closeSync(handle);
    }
}
//# sourceMappingURL=directory-write.js.map