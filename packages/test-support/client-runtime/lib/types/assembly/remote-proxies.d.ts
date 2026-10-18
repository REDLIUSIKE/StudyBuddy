import type { RemoteMock } from '@deepseek-ai/dsh-remote-mock';
import type { ClientPluginModule } from './roster.ts';
/** The assembly row the proxies stand in for; its generated clients exist only in built `lib/`. */
export declare const REMOTES_PACKAGE = "@deepseek-ai/dsh-api-remotes";
/**
 * Namespaces to provide: every `remote.<ns>` a roster module injects, plus the
 * namespace of every endpoint the mock has a rule for.
 * @param modules - loaded roster modules.
 * @param mock - the spec's mock.
 * @returns sorted namespace names.
 */
export declare function remoteNamespacesOf(modules: Iterable<ClientPluginModule>, mock: RemoteMock): readonly string[];
/**
 * Plugin providing the namespace proxies; `TestClient.start` mounts it before the Loader rows.
 * @param namespaces - namespaces to provide.
 * @param mock - the spec's mock, asked for each endpoint's mode.
 * @returns the plugin.
 */
export declare function remoteProxiesPlugin(namespaces: readonly string[], mock: RemoteMock): ClientPluginModule;
//# sourceMappingURL=remote-proxies.d.ts.map