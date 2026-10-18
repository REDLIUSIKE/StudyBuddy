import { randomUUID } from 'node:crypto';
import { toNamespacedPath } from 'node:path';
import { brandString } from '@deepseek-ai/dsh-brand';
import { z } from 'zod';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
export class SkillSafetyScanner {
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * Scan checked bytes with the packaged upstream and current selected model, never rules-only fallback.
     * @param actor - Current account/session; checked before and after every awaited side effect.
     * @param id - Private snapshot identity, not a caller path.
     * @param signal - Turn/disposal cancellation; transport owns actual process settlement.
     * @returns Original inert findings with coverage/risk eligibility kept separate.
     */
    async runSkillScan(actor, id, signal, expectedModelIdentity) {
        const check = () => { if (signal.aborted)
            throw new SkillSafetyError('SKILL_SAFETY_CANCELLED'); if (!this.options.isCurrent(actor))
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'); };
        check();
        const artifact = await this.options.readArtifact(actor, id);
        check();
        const resources = await this.options.verifyResources(signal);
        check();
        const modelIdentity = await this.options.modelIdentity(actor);
        check();
        if (expectedModelIdentity !== undefined && modelIdentity !== expectedModelIdentity)
            throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED');
        const analysis = randomUUID();
        const result = scanResult.safeParse(await this.options.worker({ executable: resources.executable, args: resources.args, cwd: resources.cwd,
            input: { directory: artifact.directory, model: modelIdentity }, signal, judge: async (request, callId) => {
                check();
                if (await this.options.modelIdentity(actor) !== modelIdentity)
                    throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED');
                check();
                const response = await this.options.judge(actor, analysis + ':' + callId, request, signal);
                check();
                return response;
            } }));
        check();
        if (!result.success)
            throw new SkillSafetyError('SKILL_SAFETY_RESPONSE_INVALID');
        const raw = result.data;
        const current = await this.options.readArtifact(actor, id);
        check();
        if (current.view.digest !== artifact.view.digest)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        const findings = raw.findings.map(original => ({ ruleId: original.rule_id, severity: original.severity.toLowerCase(),
            originalSeverity: original.severity, title: redact(original.title, artifact.directory), evidence: redact(original.snippet ?? original.description, artifact.directory),
            ...(original.file_path ? { relativePath: redact(original.file_path, artifact.directory) } : {}), original: z.record(z.string(), z.unknown()).parse(redactObject(original, artifact.directory)) }));
        const severity = ['none', 'info', 'low', 'medium', 'high', 'critical'];
        const maxSeverity = findings.reduce((value, finding) => severity.indexOf(finding.severity) > severity.indexOf(value) ? finding.severity : value, 'none');
        const failed = !raw.analyzers_used.includes('llm_analyzer') || Boolean(raw.analyzers_failed?.length) || raw.findings.some(finding => finding.rule_id === 'LLM_ANALYSIS_FAILED');
        const partial = raw.findings.some(finding => finding.rule_id === 'LLM_CONTEXT_BUDGET_EXCEEDED');
        const status = failed ? 'failed' : partial ? 'partial' : 'complete';
        return { reportId: brandString(randomUUID()), artifactId: id, artifactDigest: artifact.view.digest,
            scannerIdentity: resources.identity, configDigest: resources.configDigest, modelIdentity, status, findings, maxSeverity,
            eligible: status === 'complete' && maxSeverity !== 'high' && maxSeverity !== 'critical', reviewRequired: maxSeverity === 'medium',
            ...(status !== 'complete' ? { failure: { code: 'SKILL_SAFETY_SCANNER_INCOMPLETE', action: 'retry' } } : {}) };
    }
}
const finding = z.object({ rule_id: z.string().min(1).max(256), severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), title: z.string().max(8192), description: z.string().max(1024 * 1024), snippet: z.string().max(1024 * 1024).nullable().optional(), file_path: z.string().max(32768).nullable().optional() }).passthrough();
const scanResult = z.object({ findings: z.array(finding).max(10000), analyzers_used: z.array(z.string()).max(32), analyzers_failed: z.array(z.unknown()).max(10000).optional() }).passthrough();
function redact(value, directory) {
    return value.split(toNamespacedPath(directory)).join('[snapshot]').split(directory).join('[snapshot]').split(directory.replaceAll('\\', '/')).join('[snapshot]')
        .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[^\s"']+)/g, '[redacted]');
}
function redactObject(value, directory) {
    if (typeof value === 'string')
        return redact(value, directory);
    if (Array.isArray(value))
        return value.map(item => redactObject(item, directory));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(?:api_?key|authorization|access_?token|password|secret)$/i.test(key) ? '[redacted]' : redactObject(item, directory)]));
    return value;
}
//# sourceMappingURL=skill-safety-scanner.js.map