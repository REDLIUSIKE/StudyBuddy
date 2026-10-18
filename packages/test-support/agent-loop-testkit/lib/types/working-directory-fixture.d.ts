/** Directory collaborator for consumer-only tests with structural Agent stubs. */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Supply fixed directory values without filesystem checks or durable changes.
 * @param ctx - context owning this test collaborator.
 * @param defaultDirectory - fallback for fixtures without a Session directory.
 */
export declare function provideWorkingDirectoryFixture(ctx: Context, defaultDirectory?: string): void;
//# sourceMappingURL=working-directory-fixture.d.ts.map