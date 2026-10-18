/** Test-scoped Remote mock and lazy client boot, owned by native Vitest fixtures. */
import { type TestAPI } from 'vitest';
import { RemoteMock, type MockedRemote } from '@deepseek-ai/dsh-remote-mock';
import type { AssemblyPlan } from './roster.ts';
import { TestClient, type TestClientOptions } from './test-client.ts';
/** Per-test controls; configure the mock before awaiting `start()`. */
export interface ClientTestFixtures {
    /** Fresh mock with the assembly's default responses already loaded. */
    mock: RemoteMock;
    /** Namespace proxy backed by the same native mocks used by the Connection carrier. */
    remote: MockedRemote;
    /** Await the one client owned by this test; rejects after the fixture closes. */
    start: () => Promise<TestClient>;
}
/**
 * Extend Vitest with a fresh mock and a lazy, automatically disposed client. Repeated `start()` calls share one
 * promise. Await it to observe startup failures; cleanup waits for startup but does not rethrow its rejection.
 * Missing mock responses still fail teardown even when no client was started. Page globals remain environment-owned.
 * @param plan - roster and replacement modules, shared as configuration rather than as a running client.
 * @param options - mount and readiness settings passed to `TestClient.start`.
 * @returns Vitest's test function with test-scoped `mock` and `start` fixtures.
 */
export declare function createClientTest(plan: AssemblyPlan, options?: TestClientOptions): TestAPI<ClientTestFixtures>;
//# sourceMappingURL=vitest.d.ts.map