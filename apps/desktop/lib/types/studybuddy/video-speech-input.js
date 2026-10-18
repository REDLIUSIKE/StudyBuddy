import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { assertVideoPath } from "./video-path.js";
const invalid = () => { throw Error('VIDEO_SPEECH_INPUT_INVALID'); };
/** Read a bounded, verified WAV prepared by the admitted video domain; no file bytes cross IPC. */
export async function readVideoSpeech(root, input, maxBytes, maxSeconds, signal) {
    if (Object.keys(input).some(key => !['audioPath', 'bytes', 'sha256'].includes(key)) || typeof input.audioPath !== 'string' || !/^\.film\/studybuddy-speech\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.wav$/.test(input.audioPath) || typeof input.bytes !== 'number' || !Number.isSafeInteger(input.bytes) || input.bytes < 46 || input.bytes > maxBytes || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256))
        return invalid();
    const file = join(root, input.audioPath);
    signal.throwIfAborted();
    await assertVideoPath(file);
    const target = await realpath(file), offset = relative(await realpath(root), target);
    if (isAbsolute(offset) || offset === '..' || offset.startsWith('../') || offset.startsWith('..\\'))
        return invalid();
    const handle = await open(target, 'r');
    try {
        const before = await handle.stat();
        if (!before.isFile() || before.size !== input.bytes)
            return invalid();
        const audio = Buffer.alloc(input.bytes);
        let position = 0;
        while (position < audio.length) {
            signal.throwIfAborted();
            const part = await handle.read(audio, position, audio.length - position, position);
            if (!part.bytesRead)
                return invalid();
            position += part.bytesRead;
        }
        const after = await handle.stat();
        await assertVideoPath(file);
        signal.throwIfAborted();
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || createHash('sha256').update(audio).digest('hex') !== input.sha256 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.readUInt32LE(4) !== audio.length - 8 || audio.toString('ascii', 8, 12) !== 'WAVE')
            return invalid();
        let format = false, data = false;
        for (let at = 12; at < audio.length;) {
            if (at + 8 > audio.length)
                return invalid();
            const kind = audio.toString('ascii', at, at + 4), size = audio.readUInt32LE(at + 4), end = at + 8 + size;
            if (end > audio.length)
                return invalid();
            if (kind === 'fmt ') {
                if (format || size < 16 || audio.readUInt16LE(at + 8) !== 1 || audio.readUInt16LE(at + 10) !== 1 || audio.readUInt32LE(at + 12) !== 16000 || audio.readUInt32LE(at + 16) !== 32000 || audio.readUInt16LE(at + 20) !== 2 || audio.readUInt16LE(at + 22) !== 16)
                    return invalid();
                format = true;
            }
            if (kind === 'data') {
                if (data || !size || size % 2 || size / 32000 > maxSeconds)
                    return invalid();
                data = true;
            }
            at = end + (size % 2);
        }
        if (!format || !data)
            return invalid();
        return audio;
    }
    finally {
        await handle.close();
    }
}
//# sourceMappingURL=video-speech-input.js.map