/** Normalize a browser recording locally; MiniMax's ASR file contract does not list WebM. */
export function dictationWav(audio: Pick<AudioBuffer, "sampleRate" | "length" | "numberOfChannels" | "getChannelData">): ArrayBuffer {
  if (audio.sampleRate !== 16000 || audio.numberOfChannels !== 1 || !Number.isSafeInteger(audio.length) || audio.length <= 0 || audio.length > 16000 * 500)
    throw Error("录音需为不超过 500 秒的单声道音频。");
  const samples = audio.getChannelData(0), bytes = new ArrayBuffer(44 + audio.length * 2), view = new DataView(bytes);
  const write = (offset: number, text: string) => { for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index)); };
  write(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); write(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, audio.length * 2, true);
  for (let index = 0; index < audio.length; index++) {
    const sample = samples[index];
    if (!Number.isFinite(sample)) throw Error("录音包含无效音频数据。");
    const value = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
export async function normalizeDictationAudio(blob: Blob): Promise<Blob> {
  if (!blob.size || blob.size > 50_000_000) throw Error("录音不能为空，且不能超过 50 MB。");
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > 500) throw Error("录音不能超过 500 秒。");
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000), source = offline.createBufferSource();
    source.buffer = decoded; source.connect(offline.destination); source.start();
    return new Blob([dictationWav(await offline.startRendering())], { type: "audio/wav" });
  } finally { await decoder.close(); }
}
