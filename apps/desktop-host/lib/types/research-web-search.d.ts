import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { ResearchProjectBinding } from './research-session-execution.ts';
import type { ResearchToolRpc } from './research-tool-rpc.ts';
/** Scoped shadowing leaves ordinary Sessions and the original web-fetch behavior intact. */
export declare function mountResearchWebSearch(ctx: Context, agent: Agent, binding: ResearchProjectBinding, rpc: ResearchToolRpc, current: () => boolean, owned: (id: string) => boolean): (() => unknown) | undefined;
//# sourceMappingURL=research-web-search.d.ts.map