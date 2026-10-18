/** Lock-pinned pi-subagents 0.74.0 algorithms, without its extension/agent loop.
 * scripted-workflow owns an eval Worker that needs the real acorn CJS file;
 * build-embedded.mjs materializes that reviewed parser closure explicitly. */
export { runWorkflowScript, validateWorkflowScript, type WorkflowScriptChildResult, type WorkflowScriptResult } from '../../node_modules/pi-subagents/src/workflows/scripted-workflow.js';
export { buildStructuredWorkflowScript } from '../../node_modules/pi-subagents/src/workflows/structured-workflow-scripts.js';
export { normalizeWorkflowHostCommandParams } from '../../node_modules/pi-subagents/src/workflows/host-command.js';
/** Exact pure defaults from pi-subagents 0.74.0 agents/agents.js. Discovery,
 * external CLI adapters and extension setup are deliberately not loaded. */
export const defaultSystemPromptMode = (name: string): 'append' | 'replace' => name === 'delegate' ? 'append' : 'replace';
export const defaultInheritProjectContext = (name: string): boolean => name === 'delegate';
export const defaultInheritSkills = (): boolean => false;
