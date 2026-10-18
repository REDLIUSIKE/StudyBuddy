/**
 * Tool-name aliases between Claude Code's built-in tool names, which a mod's
 * matchers and `e.tool` use, and the harness tool names the registry knows.
 * @module
 */
/** Claude Code tool name → harness tool name, for the built-in tools both products ship. */
export declare const DEFAULT_TOOL_ALIASES: Readonly<Record<string, string>>;
/** Two-way tool-name translation. */
export interface ToolNameAliases {
    /** The name a mod sees for a harness tool: its Claude Code alias, or the harness name itself. */
    toMod(harnessName: string): string;
    /** The harness tool a mod named: the alias target, or the name itself. */
    toHarness(modName: string): string;
}
/**
 * Build the translation from the built-in table plus deployment overrides.
 * @param overrides - Claude Code name → harness name entries that extend or replace the defaults.
 * @returns the two-way translation.
 */
export declare function createToolNameAliases(overrides?: Readonly<Record<string, string>>): ToolNameAliases;
//# sourceMappingURL=tool-names.d.ts.map