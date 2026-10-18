/**
 * Computer use through the in-process Cua Driver native SDK and its own tools.
 * @module @deepseek-ai/dsh-experimental-computer-use-cua-driver-native
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
/** Cordis plugin identity for the native Cua Driver provider. */
export declare const name = "experimental-computer-use-cua-driver-native";
/** Services required before the native runtime can publish tools. */
export declare const inject: string[];
/** The native provider uses the installed SDK's same-process defaults. */
export declare const Config: Schema<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
/**
 * Own one native runtime and expose its catalog through the MCP result adapter.
 * Startup failures roll back every registration. Unload removes tools, aborts
 * calls and image admission, awaits settlement and SDK shutdown, then releases computer use.
 * @param ctx - context providing the exclusive registration and tool services.
 * @returns after native import, runtime creation, and tool discovery complete.
 */
export declare function apply(ctx: Context): Promise<void>;
//# sourceMappingURL=index.d.ts.map