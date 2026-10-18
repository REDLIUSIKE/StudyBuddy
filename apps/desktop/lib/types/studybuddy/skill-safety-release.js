/** Client-shipped immutable download authority; never accept a model/server replacement descriptor. */
import { z } from 'zod';
/** Stable keyless preparation failure; internal causes are never serialized to model/UI results. */
export class SkillScannerResourceError extends Error {
    code;
    constructor(code, cause) {
        super(code, { cause });
        this.code = code;
    }
}
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({ schemaVersion: z.literal(1), target: z.literal('win32-x64'), pythonVersion: z.literal('3.12.14'), scannerVersion: z.literal('2.2.2'),
    archiveUrl: z.string().max(512), archiveSha256: hex, archiveSizeBytes: z.number().int().positive().max(1024 ** 3), manifestSha256: hex,
    extractedSizeBytes: z.number().int().positive().max(1024 ** 3), fileCount: z.number().int().min(4).max(30000) }).strict();
/**
 * Validate one descriptor read from the client-owned file.
 * @param value - Untrusted file JSON, not an inference/tool input.
 * @returns Fixed origin, artifact digest, sizes and runtime identity.
 * @throws For extra fields, unsupported versions or expanded download authority.
 */
export function parseSkillScannerRelease(value) {
    try {
        const release = schema.parse(value);
        if (release.archiveUrl !== 'https://guijitongzhuo.com/studybuddy-releases/labs/skill-scanner/win32-x64/' + release.archiveSha256 + '.zip')
            throw Error();
        return Object.freeze(release);
    }
    catch (error) {
        throw new SkillScannerResourceError('SKILL_SAFETY_RESOURCE_INVALID', error);
    }
}
//# sourceMappingURL=skill-safety-release.js.map