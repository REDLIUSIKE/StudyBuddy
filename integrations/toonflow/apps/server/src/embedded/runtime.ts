import { stripTypeScriptTypes } from "node:module";
import { parse } from "@babel/parser";
import sharp from "sharp";
import type { Sharp, FitEnum, JpegOptions, PngOptions, WebpOptions } from "sharp";
import { File } from "node:buffer";
import { existsSync } from "@toonflow/file";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import { hash } from "./hash";

class transpiler {
  constructor(private readonly options: { loader?: string } = {}) {}
  transformSync(source: string) { return this.options.loader === "ts" ? Reflect.apply(stripTypeScriptTypes, undefined, [source, { mode: "transform" }]) : source; }
  scan(source: string) {
    const module = parse(source, { sourceType: "unambiguous", plugins: this.options.loader === "ts" ? ["typescript"] : [] });
    const exports: string[] = [];
    for (const item of module.program.body) {
      if (item.type === "ExportDefaultDeclaration") exports.push("default");
      if (item.type === "ExportNamedDeclaration") for (const specifier of item.specifiers) exports.push(specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value);
    }
    return { exports };
  }
}

class image {
  private pipeline: Sharp;
  constructor(input: Uint8Array | ArrayBuffer) { this.pipeline = sharp(input instanceof ArrayBuffer ? Buffer.from(input) : input); }
  async metadata() { const result = await this.pipeline.metadata(); if (!result.width || !result.height || !result.format) throw new Error("AIGC_IMAGE_METADATA_INVALID"); return result; }
  resize(width: number, height: number, options: { fit?: keyof FitEnum } = {}) { this.pipeline.resize(width, height, { fit: options.fit ?? "fill" }); return this; }
  jpeg(options?: JpegOptions) { this.pipeline.jpeg(options); return this; }
  png(options?: PngOptions) { this.pipeline.png(options); return this; }
  webp(options?: WebpOptions) { this.pipeline.webp(options); return this; }
  async buffer() { return this.pipeline.toBuffer(); }
}

class archive {
  constructor(private readonly bytes: Uint8Array) {}
  async files() {
    const files = new Map<string, File>(), bytes = this.bytes;
    const field = (start: number, length: number) => Buffer.from(bytes.subarray(start, start + length)).toString("utf8").split("\0", 1)[0]!;
    for (let offset = 0; offset < bytes.length;) {
      if (bytes.subarray(offset, offset + 512).every(byte => byte === 0)) break;
      if (offset + 512 > bytes.length) throw new Error("AIGC_ARCHIVE_INVALID");
      const size = Number.parseInt(field(offset + 124, 12).trim(), 8), kind = bytes[offset + 156];
      if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + Math.ceil(size / 512) * 512 > bytes.length || ![0, 48, 53].includes(kind!)) throw new Error("AIGC_ARCHIVE_INVALID");
      const prefix = field(offset + 257, 6) === "ustar" ? field(offset + 345, 155) : "";
      const name = [prefix, field(offset, 100)].filter(Boolean).join("/");
      if (kind !== 53) { if (files.has(name)) throw new Error("AIGC_ARCHIVE_DUPLICATE"); files.set(name, new File([Uint8Array.from(bytes.subarray(offset + 512, offset + 512 + size))], name)); }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }
}

function order(left: string, right: string): number {
  const split = (value: string) => { const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.*)?$/.exec(value); if (!match) throw new Error("AIGC_VERSION_INVALID"); return match; };
  const a = split(left), b = split(right);
  for (let index = 1; index <= 3; index++) if (BigInt(a[index]!) !== BigInt(b[index]!)) return BigInt(a[index]!) > BigInt(b[index]!) ? 1 : -1;
  if (a[4] === b[4]) return 0;
  if (!a[4] || !b[4]) return a[4] ? -1 : 1;
  const x = a[4].split("."), y = b[4].split(".");
  for (let index = 0; index < Math.max(x.length, y.length); index++) {
    const first = x[index], second = y[index];
    if (first === second) continue;
    if (first === undefined || second === undefined) return first === undefined ? -1 : 1;
    const numericA = /^\d+$/.test(first), numericB = /^\d+$/.test(second);
    if (numericA && numericB) return BigInt(first) > BigInt(second) ? 1 : -1;
    if (numericA !== numericB) return numericA ? -1 : 1;
    return first > second ? 1 : -1;
  }
  return 0;
}

function which(name: string) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const path = join(directory, name); if (existsSync(path)) return path;
  }
  return null;
}

function spawnVersion(args: string[], options: { env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeout?: number }) {
  const child = spawn(args[0]!, args.slice(1), { env: options.env, signal: options.signal, timeout: options.timeout, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  const output: Buffer[] = [];
  child.stdout.on("data", (bytes: Buffer) => { output.push(bytes); });
  const exited = new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("close", code => { resolve(code ?? -1); }); });
  return { stdout: { text: async () => { await exited; return Buffer.concat(output).toString("utf8"); } }, exited };
}

/** Embedded-only build substitutions. This module is never the standalone Bun entry. */
export const nodeRuntime = { Transpiler: transpiler, Image: image, Archive: archive, hash, semver: { order }, which,
  spawn: spawnVersion, sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  escapeHTML: (text: string) => text.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!),
};
