import { defineTool } from '@deepseek-ai/dsh-tools';
import { brandString } from '@deepseek-ai/dsh-brand';
import { SkillSafetyError } from "./errors.js";
import "./index.js";
const requestId = { type: 'string', required: true, description: 'Stable identity for this operation; retain it when reconciling a retry.' };
const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] };
function fields(args, allowed) {
    if (Object.keys(args).some(key => !allowed.includes(key)) || Object.values(args).some(value => typeof value !== 'string' || !value.trim() || value.length > 2048))
        throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
}
async function execute(ctx, command, exec) {
    if (!exec.agent)
        throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
    if (!command.requestId || command.requestId.length > 256)
        throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
    return JSON.stringify(await ctx.skillSafety.execute(exec.agent, command, exec.signal));
}
/**
 * Register feature operations in the dedicated preset's native tool scope.
 * @param ctx - Preset-owned tool and safety services; never ordinary global chat configuration.
 */
export function registerSkillSafetyTools(ctx) {
    ctx.tools.register(defineTool({ name: 'skill_safety_find', description: 'Find real installed or public Skill candidates by name, need, or public GitHub URL.',
        parameters: { requestId, query: { type: 'string', required: true } }, output,
        execute: async (args, exec) => { fields(args, ['requestId', 'query']); return execute(ctx, { kind: 'find', requestId: brandString(args.requestId), query: args.query }, exec); },
    }));
    ctx.tools.register(defineTool({ name: 'skill_safety_prepare_scanner', description: 'Prepare the fixed StudyBuddy scanner resource package and return its verified identity.',
        parameters: { requestId }, output,
        execute: async (args, exec) => { fields(args, ['requestId']); return execute(ctx, { kind: 'prepare-scanner', requestId: brandString(args.requestId) }, exec); },
    }));
    ctx.tools.register(defineTool({ name: 'skill_safety_scan', description: 'Check the selected Skill source and return the original Cisco findings and coverage.',
        parameters: { requestId, jobId: { type: 'string', required: true }, candidateId: { type: 'string', required: true } }, output,
        execute: async (args, exec) => { fields(args, ['requestId', 'jobId', 'candidateId']); return execute(ctx, { kind: 'scan', requestId: brandString(args.requestId), jobId: brandString(args.jobId), candidateId: brandString(args.candidateId) }, exec); },
    }));
    ctx.tools.register(defineTool({ name: 'skill_safety_install', description: 'Request native confirmation to install exactly the source represented by a completed eligible report.',
        parameters: { requestId, reportId: { type: 'string', required: true } }, output,
        execute: async (args, exec) => { fields(args, ['requestId', 'reportId']); return execute(ctx, { kind: 'install', requestId: brandString(args.requestId), reportId: brandString(args.reportId) }, exec); },
    }));
}
/** Activate the dedicated preset's tool contribution. @param ctx - Scoped preset owner. */
export function apply(ctx) {
    registerSkillSafetyTools(ctx);
    ctx.tools.presentAs('native');
    const allowed = new Set(['skill_safety_find', 'skill_safety_prepare_scanner', 'skill_safety_scan', 'skill_safety_install', 'ask_user_question']);
    ctx.tools.guard(execution => allowed.has(execution.name) ? undefined : 'SKILL_SAFETY_COMMAND_INVALID');
    // Assembly precedes pre-step. Filter the actual logged model surface, not the preset's inherited registry.
    ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const assembly = await next();
        const tools = assembly.tools.filter(tool => allowed.has(tool.name));
        if (tools.length !== allowed.size)
            throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE');
        return { ...assembly, tools };
    });
}
export const inject = ['tools', 'skillSafety', 'agents'];
//# sourceMappingURL=tools.js.map