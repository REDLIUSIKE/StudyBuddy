/**
 * Tool-name aliases between Claude Code's built-in tool names, which a mod's
 * matchers and `e.tool` use, and the harness tool names the registry knows.
 * @module
 */
/** Claude Code tool name → harness tool name, for the built-in tools both products ship. */
export const DEFAULT_TOOL_ALIASES = Object.freeze({
    Bash: 'bash',
    Read: 'read',
    Edit: 'edit',
    Write: 'write',
    Glob: 'glob',
    Grep: 'grep',
    WebFetch: 'web_fetch',
    WebSearch: 'web_search',
    Task: 'subagent',
    TodoWrite: 'todo_write',
    AskUserQuestion: 'ask_user_question',
    ExitPlanMode: 'exit_plan_mode',
    Skill: 'skill',
});
/**
 * Build the translation from the built-in table plus deployment overrides.
 * @param overrides - Claude Code name → harness name entries that extend or replace the defaults.
 * @returns the two-way translation.
 */
export function createToolNameAliases(overrides = {}) {
    const forward = new Map(Object.entries({ ...DEFAULT_TOOL_ALIASES, ...overrides }));
    const reverse = new Map();
    for (const [modName, harnessName] of forward)
        reverse.set(harnessName, modName);
    return {
        toMod: harnessName => reverse.get(harnessName) ?? harnessName,
        toHarness: modName => forward.get(modName) ?? modName,
    };
}
//# sourceMappingURL=tool-names.js.map