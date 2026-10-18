/** Session commands whose activation policy is explicit at each Remote method. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, ModelSelection as AgentModelSelection } from '@deepseek-ai/dsh-agent';
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import { ApiSessionAgentController } from './agent.ts';
import type { SessionAttachmentRequest, SessionAttachmentValue, SessionCancelRequest, SessionCancelValue, SessionCreateRequest, SessionCreateValue, SessionForkRequest, SessionForkValue, SessionPromptRequest, SessionPromptValue, SessionRenameRequest, SessionRenameValue, SessionSelectModelRequest, SessionSelectModelValue, SessionUpdateQueueRequest, SessionUpdateQueueValue } from './types.ts';
/** Exact selected route and owner offered to an optional Host image-tool intake. */
export interface SessionImageToolIntake {
    readonly agent: Agent;
    readonly selection: AgentModelSelection;
    readonly model: LlmResolvedModelInfo;
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        /**
         * A Host image-tool owner may admit a text route's images as locally
         * persisted, durably marked references. True never declares native image
         * capability; absent/false preserves the route's ordinary image denial.
         */
        'session/image-tool-intake'(input: SessionImageToolIntake, next: () => Promise<boolean>): Promise<boolean>;
    }
}
/** Implements Session business commands delegated by the Session Controller Remote service. */
export declare class SessionCommandController {
    private readonly ctx;
    private readonly agents;
    private readonly defaultCwd;
    /**
     * @param ctx - Host context carrying Agent, model, attachment, title, and Workspace services.
     * @param agents - sole owner of create, resume, and Session-local model selection.
     * @param defaultCwd - project directory used when create names neither a Workspace nor a cwd.
     */
    constructor(ctx: Context, agents: ApiSessionAgentController, defaultCwd: string);
    /**
     * Create or idempotently adopt one ordinary Session.
     * @param request - requested identity, location, and Agent preset.
     * @returns the Session identity and resolved preset when configured.
     */
    create(request: SessionCreateRequest): Promise<SessionCreateValue>;
    /**
     * Validate and install one Session-local model selection; save the default in the background.
     * @param request - Session identity and requested model selection.
     * @returns the normalized selection installed for the Session, without waiting for default persistence.
     */
    selectModel(request: SessionSelectModelRequest): Promise<SessionSelectModelValue>;
    /**
     * Normalize and append a user-owned Session title.
     * @param request - Session identity and proposed title.
     * @returns the accepted title and durable event sequence.
     */
    rename(request: SessionRenameRequest): Promise<SessionRenameValue>;
    /**
     * Create a new ordinary Session from an exact event prefix. An explicit
     * `atSeq` is the inclusive cut; an omitted value selects the latest
     * completed-turn prefix. An open cut receives synthetic fork closers.
     * @param request - source Session and optional exact event boundary.
     * @returns the new Session identity.
     */
    fork(request: SessionForkRequest): Promise<SessionForkValue>;
    /**
     * Reject empty content, then admit one prompt after Agent and attachment validation.
     * @param request - Session identity, prompt content, source metadata, and delivery mode.
     * @returns acknowledgement that the Agent accepted the prompt.
     */
    prompt(request: SessionPromptRequest): Promise<SessionPromptValue>;
    private requireModel;
    /**
     * Read one durable image after proving the Session log references it.
     * @param request - Session and attachment identities used for authorization.
     * @returns the durable attachment reference and base64-encoded bytes.
     */
    attachment(request: SessionAttachmentRequest): Promise<SessionAttachmentValue>;
    /**
     * Mutate one pending Inbox occurrence, restoring an ordinary cold Agent when needed.
     * @param request - Session, queue item, and requested mutation.
     * @returns acknowledgement that the queue mutation was applied.
     */
    updateQueue(request: SessionUpdateQueueRequest): Promise<SessionUpdateQueueValue>;
    /**
     * Cancel one live ordinary Agent while retaining pending inbox work.
     * @param request - Session whose active Agent turn is cancelled.
     * @returns acknowledgement that cancellation was requested.
     */
    cancel(request: SessionCancelRequest): SessionCancelValue;
    private resolveAgent;
    private rejectCreation;
    private readSessionState;
    private forkWorkspace;
}
//# sourceMappingURL=commands.d.ts.map