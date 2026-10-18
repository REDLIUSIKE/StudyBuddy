import { expect, it } from "vitest";
import { dictationWav } from "./dictation-audio";

it("writes canonical mono 16 kHz PCM16 WAV and clips each sample without guessing billing usage", () => {
  const samples = Float32Array.from([-2, -1, 0, 0.5, 1, 2]), wav = dictationWav({ sampleRate: 16000, numberOfChannels: 1, length: samples.length, getChannelData: () => samples });
  const header = new DataView(wav), text = new TextDecoder().decode(wav);
  expect(text.slice(0, 4)).toBe("RIFF"); expect(text.slice(8, 16)).toBe("WAVEfmt "); expect(header.getUint32(24, true)).toBe(16000);
  expect(header.getUint32(40, true)).toBe(12);
  expect(Array.from({ length: 6 }, (_, index) => header.getInt16(44 + index * 2, true))).toEqual([-32768, -32768, 0, 16384, 32767, 32767]);
});
it("rejects empty, overlong or invalid normalized audio before preparing any upload", () => {
  const sample = { sampleRate: 16000, numberOfChannels: 1, length: 1, getChannelData: () => Float32Array.from([0]) };
  for (const input of [{ ...sample, length: 0 }, { ...sample, length: 16000 * 500 + 1 }, { ...sample, sampleRate: 48000 }, { ...sample, numberOfChannels: 2 }, { ...sample, getChannelData: () => Float32Array.from([NaN]) }]) expect(() => dictationWav(input)).toThrow();
});
