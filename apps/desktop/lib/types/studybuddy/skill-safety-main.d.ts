/** One lazy Main composition; credentials stay in the existing native consumers. */
import type { AigcTextChoice, AigcTextConsumer, AigcPlatformConsumer } from './aigc-types.ts';
import type { ToolViewLease, SkillSafetyLabsMethod } from '@studybuddy/contracts';
import type { SkillSafetySessionRef } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import type { SkillSafetyWireInvocation } from '@deepseek-ai/dsh-skill-safety-assistant/wire';
import type { DesktopHostProcess } from '../host-process.ts';
import type { StudyBuddyAuth, StudyBuddyFetch } from './services.ts';
import { type SkillsRuntime } from './skill-native-client.ts';
/** Match a live native selection to exactly one current admitted gateway choice.
 * @param selection - Read from the real live Host, not model/tool arguments.
 * @param choices - Fresh existing private native catalog.
 * @returns Exact matching authority, never a default or a funding fallback. */
export declare function resolveSkillSafetyChoice(selection: {
    provider: string;
    model: string;
}, choices: readonly AigcTextChoice[]): AigcTextChoice | undefined;
type Host = Pick<DesktopHostProcess, 'builtinContext' | 'skillSafetyCommand'>;
/** Native composition inputs; no public method accepts a source path or credential. */
export interface SkillSafetyMainOptions {
    auth: Pick<StudyBuddyAuth, 'scope' | 'withSession'>;
    host(): Host | undefined;
    userDataDirectory: string;
    runtimeDirectory: string;
    releaseFile: string;
    harnessHome(): string;
    version: string;
    nativeRuntime: SkillsRuntime;
    consumer: AigcTextConsumer;
    platform: AigcPlatformConsumer;
    fetch: StudyBuddyFetch;
}
/** Own one lazy resource/controller composition and only feature-admitted native Sessions.
 * Native reads serialize credential-bound pipe replacement; a failed operation is not replayed. */
export declare class SkillSafetyMain {
    private readonly options;
    private owned;
    private readonly admitted;
    private readonly pending;
    private native;
    private nativeTail;
    private loading;
    private resources;
    private resourceLoading;
    private readonly manualCalls;
    private revoking;
    private disposed;
    constructor(options: SkillSafetyMainOptions);
    private isCurrent;
    private nativeCall;
    private choice;
    private model;
    private resourceOwner;
    /** Labs-only fixed resource operations; owner is checked by the native frame bridge. */
    manual(owner: ToolViewLease, method: SkillSafetyLabsMethod, args: unknown[]): Promise<unknown>;
    /** Release only waiters initiated by this exact native page lease. */
    releaseManual(owner: ToolViewLease): void;
    private load;
    /** Open one feature-managed native Session without downloading or calling a model. */
    begin(requestId: string): Promise<SkillSafetySessionRef>;
    /** Handle only strict private Host calls and await native cancellation before replying. */
    handle(input: SkillSafetyWireInvocation, signal: AbortSignal): Promise<unknown>;
    /** Revoke account actions immediately, then await all owned private/native work. */
    revoke(): Promise<void>;
    /** Close the feature's optional downloader and native pipes, preserving cache and user data. */
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=skill-safety-main.d.ts.map