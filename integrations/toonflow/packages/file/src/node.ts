import { createReadStream as nativeReadStream, statSync } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import type { PathLike } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { acquireFileAccess, withFileAccess } from "./access.ts";

type FileContent = string | Blob | ArrayBufferLike | NodeJS.TypedArray | (string | Blob | ArrayBuffer | Uint8Array<ArrayBuffer>)[];
type WriteOptions = { mode?: number; createPath?: boolean };
const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", json: "application/json", txt: "text/plain", md: "text/markdown", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", pdf: "application/pdf" };

function pathValue(value: string | URL | ArrayBufferLike | ArrayBufferView): PathLike {
  if (typeof value === "string" || value instanceof URL) return value;
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(new Uint8Array(value));
}

/** A genuine Blob with lazy file reads; HTTP bodies can stream large media without a full copy. */
class managedFile extends Blob {
  constructor(readonly path: PathLike, readonly begin = 0, readonly end?: number, options?: BlobPropertyBag) {
    super([], { type: options?.type ?? mimeTypes[String(path).split(".").at(-1)?.toLowerCase() ?? ""] ?? "" });
  }
  override get size() {
    try { return Math.max(0, Math.min(statSync(this.path).size, this.end ?? Infinity) - this.begin); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; }
  }
  async exists() {
    return withFileAccess([this.path], "read", async () => {
      try { await access(this.path); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    });
  }
  async readBytes() { return (await readFile(this.path)).subarray(this.begin, this.end); }
  override async arrayBuffer(): Promise<ArrayBuffer> { return withFileAccess([this.path], "read", async () => Uint8Array.from(await this.readBytes()).buffer); }
  async bytes(): Promise<Uint8Array<ArrayBuffer>> { return new Uint8Array(await this.arrayBuffer()); }
  override async text(): Promise<string> { return new TextDecoder().decode(await this.arrayBuffer()); }
  async json(): Promise<unknown> { return JSON.parse(await this.text()); }
  slice(begin = 0, end = this.size, contentType = "") {
    const size = this.size;
    const from = Math.min(size, begin < 0 ? Math.max(0, size + begin) : Math.max(0, begin));
    const to = Math.min(size, end < 0 ? Math.max(0, size + end) : Math.max(0, end));
    return new managedFile(this.path, this.begin + from, this.begin + Math.max(from, to), { type: contentType });
  }
  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    const path = this.path, begin = this.begin, end = this.end;
    let release: (() => void) | undefined;
    let reader: { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(reason?: unknown): Promise<void> } | undefined;
    const cancellation = new AbortController();
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        try {
          release = await acquireFileAccess([path], "read", cancellation.signal);
          if (cancellation.signal.aborted) { release(); return; }
          if (end !== undefined && end <= begin) { release(); controller.close(); return; }
          const source = nativeReadStream(path, { start: begin, ...(end === undefined ? {} : { end: end - 1 }) });
          reader = Readable.toWeb(source).getReader();
        } catch (error) { release?.(); if (!cancellation.signal.aborted) controller.error(error); }
      },
      async pull(controller) {
        if (!reader) return;
        try {
          const next = await reader.read();
          if (next.done) { release?.(); controller.close(); }
          else if (next.value) controller.enqueue(Uint8Array.from(next.value));
        } catch (error) { release?.(); controller.error(error); }
      },
      async cancel(reason) {
        cancellation.abort(reason);
        try { await reader?.cancel(reason); } finally { release?.(); }
      },
    });
  }
  write(content: FileContent, options?: WriteOptions) { return write(this, content, options); }
  async delete() { return withFileAccess([this.path], "write", () => unlink(this.path)); }
  async unlink() { return this.delete(); }
  writer(): never { throw new TypeError("Use @toonflow/file createWriteStream for stream writes"); }
}

export function file(path: string | URL | ArrayBufferLike | Uint8Array, options?: BlobPropertyBag) {
  return new managedFile(pathValue(path), 0, undefined, options);
}

export async function write(destination: string | URL | ArrayBufferLike | NodeJS.TypedArray | managedFile, content: FileContent, options?: WriteOptions): Promise<number> {
  if (content instanceof Response || content instanceof Request || content instanceof ReadableStream) throw new TypeError("Use createWriteStream and pipeline for stream writes");
  const path = destination instanceof managedFile ? destination.path : pathValue(destination);
  const paths = content instanceof managedFile ? [path, content.path] : [path];
  return withFileAccess(paths, "write", async () => {
    const bytes = typeof content === "string" ? Buffer.from(content)
      : content instanceof managedFile ? await content.readBytes()
      : content instanceof Blob ? Buffer.from(await content.arrayBuffer())
      : Array.isArray(content) ? Buffer.from(await new Blob(content).arrayBuffer())
      : ArrayBuffer.isView(content) ? Buffer.from(content.buffer, content.byteOffset, content.byteLength)
      : Buffer.from(new Uint8Array(content));
    if (options?.createPath !== false) await mkdir(dirname(path instanceof URL ? fileURLToPath(path) : path.toString()), { recursive: true });
    await writeFile(path, bytes, { mode: options?.mode });
    return bytes.byteLength;
  });
}
