import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeDictation } from "./native-dictation";
import { apiFetch } from "@/lib/projects";
import { nativeResearchRequest } from "@/lib/research-host";

const spies = vi.hoisted(() => ({ props: {} as any, errors: vi.fn() }));
vi.mock("./ai-elements/speech-input", () => ({ SpeechInput: (props: any) => {
  spies.props = props; return <button disabled={props.disabled} onClick={() => { void props.onAudioRecorded(new Blob(["recording"])).catch((error: unknown) => props.onSpeechError(error instanceof Error ? error.message : String(error))); }}>录音</button>;
} }));
vi.mock("@/lib/projects", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/dictation-audio", () => ({ normalizeDictationAudio: vi.fn(async () => new Blob(["normalized"], { type: "audio/wav" })) }));
vi.mock("@/lib/research-host", () => ({ nativeResearchRequest: vi.fn(async () => null) }));
vi.mock("sonner", () => ({ toast: { error: spies.errors } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function response(requestId: string) { return new Response(JSON.stringify({ requestId, modelId: "asr-1.0", text: "研究草稿", duration: 0.5 })); }
it("forces local recording and fills the native draft once without submitting a chat", async () => {
  vi.mocked(apiFetch).mockImplementationOnce(async (_path, init) => response((init?.headers as Record<string, string>)["X-StudyBuddy-Speech-Request-Id"]));
  render(<NativeDictation projectId="study" sessionId="session-original" visible />);
  expect(spies.props.recordedOnly).toBe(true); expect(spies.props.maxRecordingSeconds).toBe(500);
  fireEvent.click(screen.getByRole("button", { name: "录音" }));
  await waitFor(() => expect(nativeResearchRequest).toHaveBeenCalledWith({ kind: "draft", projectId: "study", text: "研究草稿", references: [] }));
  expect(apiFetch).toHaveBeenCalledOnce(); expect(nativeResearchRequest).toHaveBeenCalledOnce();
  const call = vi.mocked(apiFetch).mock.calls[0]; expect(call[0]).toBe("/speech/transcribe"); expect(call[2]).toBe("study");
});
it("suppresses an old recording after switching the native chat and does not retry", async () => {
  let finish!: (value: Response) => void, requestId = "";
  vi.mocked(apiFetch).mockImplementationOnce((_path, init) => { requestId = (init?.headers as Record<string, string>)["X-StudyBuddy-Speech-Request-Id"]; return new Promise(resolve => { finish = resolve; }); });
  const view = render(<NativeDictation projectId="study" sessionId="session-first" visible />);
  fireEvent.click(screen.getByRole("button", { name: "录音" })); await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
  view.rerender(<NativeDictation projectId="study" sessionId="session-second" visible />); finish(response(requestId));
  await waitFor(() => expect(spies.errors).toHaveBeenCalled()); expect(nativeResearchRequest).not.toHaveBeenCalled(); expect(apiFetch).toHaveBeenCalledOnce();
});
it("keeps hidden workbenches disabled and preserves uncertain provider failures without resubmitting", async () => {
  const view = render(<NativeDictation projectId="study" sessionId="session-original" visible={false} />);
  expect(screen.getByRole("button", { name: "录音" })).toBeDisabled();
  view.rerender(<NativeDictation projectId="study" sessionId="session-original" visible />);
  vi.mocked(apiFetch).mockRejectedValueOnce(Error("transport unknown")); fireEvent.click(screen.getByRole("button", { name: "录音" }));
  await waitFor(() => expect(spies.errors).toHaveBeenCalled()); expect(apiFetch).toHaveBeenCalledOnce(); expect(nativeResearchRequest).not.toHaveBeenCalled();
});
it("explains the original project CNY cap without filling or resubmitting a draft", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ detail: "RESEARCH_BUDGET_REACHED" }), { status: 402 }));
  render(<NativeDictation projectId="study" sessionId="session-original" visible />);
  fireEvent.click(screen.getByRole("button", { name: "录音" }));
  await waitFor(() => expect(spies.errors).toHaveBeenCalledWith("已达到项目人民币支出上限，请调整项目预算后再录音。"));
  expect(apiFetch).toHaveBeenCalledOnce(); expect(nativeResearchRequest).not.toHaveBeenCalled();
});
it("stops and fences an in-flight recording when the shared shell suspends the guest", async () => {
  let finish!: (value: Response) => void, requestId = "";
  vi.mocked(apiFetch).mockImplementationOnce((_path, init) => { requestId = (init?.headers as Record<string, string>)["X-StudyBuddy-Speech-Request-Id"]; return new Promise(resolve => { finish = resolve; }); });
  render(<NativeDictation projectId="study" sessionId="session-original" visible />);
  fireEvent.click(screen.getByRole("button", { name: "录音" })); await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
  act(() => { window.dispatchEvent(new Event("studybuddy:embedded-suspend")); });
  expect(screen.getByRole("button", { name: "录音" })).toBeDisabled();
  expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => { finish(response(requestId)); });
  expect(nativeResearchRequest).not.toHaveBeenCalled(); expect(spies.errors).not.toHaveBeenCalled();
  act(() => { window.dispatchEvent(new Event("studybuddy:embedded-resume")); });
  expect(screen.getByRole("button", { name: "录音" })).not.toBeDisabled();
});
