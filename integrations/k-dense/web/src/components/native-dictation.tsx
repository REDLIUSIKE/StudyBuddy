"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SpeechInput } from "./ai-elements/speech-input";
import { apiFetch } from "@/lib/projects";
import { normalizeDictationAudio } from "@/lib/dictation-audio";
import { nativeResearchRequest } from "@/lib/research-host";

/** Dictation fills the current native draft; it never submits a chat turn. */
export function NativeDictation({ projectId, sessionId, visible }: { projectId: string; sessionId?: string; visible: boolean }) {
  const [guestVisible, setGuestVisible] = useState(true);
  const epoch = useRef(0), active = useRef(visible), controller = useRef<AbortController | undefined>(undefined);
  active.current = visible && guestVisible;
  useEffect(() => () => { epoch.current++; controller.current?.abort(); }, [projectId, sessionId, visible, guestVisible]);
  useEffect(() => {
    const suspend = () => { active.current = false; epoch.current++; controller.current?.abort(); setGuestVisible(false); };
    const resume = () => { active.current = visible; setGuestVisible(true); };
    window.addEventListener("studybuddy:embedded-suspend", suspend);
    window.addEventListener("studybuddy:embedded-resume", resume);
    return () => {
      window.removeEventListener("studybuddy:embedded-suspend", suspend);
      window.removeEventListener("studybuddy:embedded-resume", resume);
    };
  }, [visible]);
  const transcribe = useCallback(async (blob: Blob) => {
    const generation = epoch.current, abort = new AbortController();
    controller.current = abort;
    const assert = () => { abort.signal.throwIfAborted(); if (!active.current || epoch.current !== generation || !sessionId) throw Error("当前研究对话已切换，请重新录音。"); };
    try {
      assert(); const audio = await normalizeDictationAudio(blob); assert();
      const requestId = crypto.randomUUID(), body = new FormData(); body.append("audio", audio, "dictation.wav");
      const response = await apiFetch("/speech/transcribe", { method: "POST", body, signal: abort.signal,
        headers: { "X-StudyBuddy-Speech-Request-Id": requestId } }, projectId);
      const result = await response.json().catch(() => null) as { requestId?: unknown; modelId?: unknown; text?: unknown; duration?: unknown; detail?: unknown } | null;
      assert();
      if (!response.ok) throw Error(response.status === 402 && result?.detail === "RESEARCH_BUDGET_REACHED"
        ? "已达到项目人民币支出上限，请调整项目预算后再录音。"
        : "语音转写暂不可用。已提交的录音不会自动重复识别。");
      if (!result || result.requestId !== requestId || result.modelId !== "asr-1.0" || typeof result.text !== "string" || !result.text.trim() ||
        typeof result.duration !== "number" || !Number.isFinite(result.duration) || result.duration <= 0 || result.duration > 500) throw Error("语音结果暂无法确认，请勿自动重复识别。");
      await nativeResearchRequest({ kind: "draft", projectId, text: result.text.trim(), references: [] }); assert();
      return result.text.trim();
    } finally { if (controller.current === abort) controller.current = undefined; }
  }, [projectId, sessionId]);
  return <SpeechInput recordedOnly maxRecordingSeconds={500} disabled={!visible || !guestVisible || !sessionId} onAudioRecorded={transcribe}
    size="sm" variant="outline" aria-label="按住录音，松开后填入研究对话" title="按住录音，松开后转写为当前研究对话草稿；不自动发送"
    onSpeechError={message => { if (active.current) toast.error(message); }} />;
}
