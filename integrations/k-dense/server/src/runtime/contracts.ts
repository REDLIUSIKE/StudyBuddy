export type RuntimeProfile = "standalone" | "studybuddy";

export interface RuntimeContext {
  projectId: string;
  sessionRef: string;
  hostBinding?: unknown;
}

export interface ResearchAction {
  operationId: string;
  kind: string;
  input: unknown;
}

export type RuntimeCapabilities = {
  id: string;
  state: "ready" | "unavailable";
  reason?: string;
}[];

export interface ResearchResult {
  kind: "message" | "artifact" | "model" | "job";
  value: unknown;
}

export interface ResearchRun {
  runId: string;
  state: "queued" | "running" | "waiting" | "completed" | "failed" | "unknown";
  result?: ResearchResult;
}

export interface ResearchEvent {
  eventId: string;
  projectId: string;
  sessionRef: string;
  runId: string;
  nativeTurnId?: string;
  nativeStepId?: string;
  toolCallId?: string;
  actor: string;
  kind: string;
  payload: unknown;
}

/** Execution owner; adapters validate each action and its result schema. */
export interface ResearchRuntime {
  capabilities(context: RuntimeContext): Promise<RuntimeCapabilities>;
  submit(context: RuntimeContext, action: ResearchAction, signal: AbortSignal): Promise<ResearchRun>;
  inspect(context: RuntimeContext, runId: string): Promise<ResearchRun>;
  events(context: RuntimeContext, runId: string): AsyncIterable<ResearchEvent>;
  cancel(context: RuntimeContext, runId: string): Promise<ResearchRun>;
  answer(context: RuntimeContext, interactionId: string, answer: unknown): Promise<void>;
}
