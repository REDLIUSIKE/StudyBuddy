/** Private native actor/IPC owner. No renderer or model can bind an account. */
import type { Context } from '@deepseek-ai/cordis';
import type { SkillSafetyHostControl } from '@deepseek-ai/dsh-skill-safety-assistant/provider';
export interface NativeSkillSafetyHostControl extends SkillSafetyHostControl {
    command(action: string, data: unknown): Promise<unknown>;
    result(data: unknown): void;
}
/** Install the private native provider; never create a model turn at startup.
 * @param ctx - Original native Host.
 * @param send - Existing private child-process IPC.
 * @param hostGeneration - Existing fixed live Host identity.
 * @returns The closed Host control. */
export declare function installSkillSafetyHostControl(ctx: Context, send: (message: object) => Promise<void>, hostGeneration: string): NativeSkillSafetyHostControl;
//# sourceMappingURL=studybuddy-skill-safety.d.ts.map