import ffmpeg from "@renmu/fluent-ffmpeg";
import { lstatSync, realpathSync, statSync } from "@toonflow/file";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { spawn, type ChildProcess } from "node:child_process";

type FfmpegInternals = ffmpeg.FfmpegCommand & {
  options: ffmpeg.FfmpegCommandOptions;
  _inputs: { source: string | Readable }[];
  _outputs: { target?: string | NodeJS.WritableStream }[];
  _currentOutput?: FfmpegInternals["_outputs"][number];
  _spawnFfmpeg(...args: unknown[]): unknown;
  _getFfprobePath(callback: (error: Error | null, path: string) => void): void;
};

const require = createRequire(import.meta.url);
const native = ffmpeg.prototype as FfmpegInternals;

/** 原生 fluent 工厂；文件路径相对工作区解析，不修改库的全局原型。 */
export function createFfmpeg(directory: string, { restricted = false, onProcess, signal }: {
  restricted?: boolean; onProcess?: (child: ChildProcess) => void; signal?: AbortSignal;
} = {}): typeof ffmpeg {
  const root = realpathSync(directory);
  if (!statSync(root).isDirectory()) throw new Error("FFmpeg 工作区必须是目录");

  function assertWithin(path: string) {
    const offset = relative(root, path);
    if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
      throw Object.assign(new Error("FFmpeg 只能操作当前工作区内的文件"), { status: 403 });
    }
  }

  function resolvePath(path: string, folder = false): string {
    if (!path || /[\x00-\x1f]/.test(path) || (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path))) {
      throw new Error("FFmpeg 文件路径无效，不能使用协议或设备路径");
    }
    const target = resolve(root, path);
    if (restricted && !folder && /%/.test(path)) denyOperation();
    assertWithin(target);
    if (process.platform === "win32" && target.slice(parse(target).root.length).split(/[\\/]/).some(part =>
      /[:<>"|?*]|[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new Error("FFmpeg 文件路径无效");
    }
    let parent = target;
    while (true) {
      try {
        const actual = resolve(realpathSync(parent), relative(parent, target));
        assertWithin(actual);
        if (!folder && actual === root) throw new Error("FFmpeg 文件路径不能是工作区根目录");
        return actual;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        // 悬空链接不能当作普通的待创建文件，缺失父目录则继续检查最近的已有祖先。
        if (lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("FFmpeg 不能操作悬空符号链接");
        const ancestor = dirname(parent);
        if (ancestor === parent) throw error;
        parent = ancestor;
      }
    }
  }

  function fileArgument<T>(value: T): T {
    if (typeof value === "string") return resolvePath(value) as T;
    if (restricted && value !== undefined) denyOperation();
    if (value && typeof value === "object" && "path" in value) {
      const path = value.path;
      if (typeof path === "string" || Buffer.isBuffer(path)) resolvePath(resolve(String(path)));
    }
    return value;
  }

  function denyOperation(): never {
    throw Object.assign(new Error("AIGC_FFMPEG_OPERATION_DENIED"), { code: "AIGC_FFMPEG_OPERATION_DENIED", status: 403 });
  }
  function inputFormat(path: string): string {
    const formats: Record<string, string> = { ".mp4": "mov", ".mov": "mov", ".m4v": "mov", ".m4a": "mov", ".webm": "matroska", ".mkv": "matroska",
      ".mp3": "mp3", ".wav": "wav", ".flac": "flac", ".ogg": "ogg", ".png": "png_pipe", ".jpg": "jpeg_pipe", ".jpeg": "jpeg_pipe", ".webp": "webp_pipe" };
    return formats[extname(path).toLowerCase()] ?? denyOperation();
  }
  function admitFilter(value: string) {
    const names = new Set(["scale", "crop", "pad", "fps", "trim", "setpts", "atrim", "asetpts", "concat", "split", "asplit", "transpose", "hflip", "vflip",
      "format", "setsar", "setdar", "settb", "aresample", "volume", "amix", "overlay", "eq", "fade", "afade", "null", "anull"]);
    if (value.length > 16384 || /[^a-zA-Z0-9_\[\]=:;,().+* /\-]/.test(value)) denyOperation();
    for (const segment of value.split(/[;,]/)) {
      const name = segment.trim().replace(/^(?:\[[a-zA-Z0-9_:]+\])+/, "").match(/^([a-zA-Z0-9_]+)(?:=|$)/)?.[1];
      if (!name || !names.has(name)) denyOperation();
    }
  }
  function admitArguments(command: FfmpegInternals, args: string[]): string[] {
    const inputs = new Set(command._inputs.map(input => String(input.source)));
    const outputs = new Set(command._outputs.map(output => String(output.target)));
    const flags = new Set(["-y", "-an", "-vn", "-re"]);
    const values = new Set(["-ss", "-t", "-to", "-r", "-stream_loop", "-loop", "-framerate", "-ar", "-ac", "-ab", "-b:a", "-b:v", "-b", "-q:a", "-q:v", "-aq", "-vcodec", "-acodec", "-c", "-c:v", "-c:a", "-codec:v", "-codec:a", "-frames:v", "-vframes", "-s", "-aspect", "-pix_fmt", "-preset", "-crf", "-threads", "-movflags", "-shortest", "-strict"]);
    const formats = new Set(["mp4", "mov", "matroska", "webm", "mp3", "wav", "flac", "ogg", "image2", "png_pipe", "jpeg_pipe", "webp_pipe"]);
    const result: string[] = [];
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]!;
      if (typeof arg !== "string" || arg.length > 16384) denyOperation();
      if (inputs.has(arg) || outputs.has(arg) || flags.has(arg)) { result.push(arg); continue; }
      const raw = args[++index];
      const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
      if (typeof value !== "string") denyOperation();
      if (arg === "-i") {
        if (!inputs.has(value)) denyOperation();
        result.push("-f", inputFormat(value), "-protocol_whitelist", "file", arg, value); continue;
      }
      if (["-vf", "-af", "-filter:v", "-filter:a", "-filter_complex"].includes(arg)) admitFilter(value);
      else if (arg === "-f") { if (!formats.has(value)) denyOperation(); }
      else if (arg === "-map") { if (!/^(?:\[[a-zA-Z0-9_]+\]|\d+(?::[va](?::\d+)?)?\??)$/.test(value)) denyOperation(); }
      else if (!values.has(arg) || !/^[a-zA-Z0-9_.:+-]+$/.test(value)) denyOperation();
      result.push(arg, value);
    }
    return result;
  }

  function checkFiles(command: FfmpegInternals) {
    command.options.cwd = resolvePath(command.options.cwd ?? root, true);
    for (const input of command._inputs) fileArgument(input.source);
    for (const output of command._outputs) fileArgument(output.target);
  }

  // ACT: 独立版仍沿用可信调用；嵌入版限定参数、无外部 I/O 的滤镜和固定文件解复用器。
  const proto = Object.create(native) as FfmpegInternals;
  proto._spawnFfmpeg = function(...args: unknown[]) {
    const index = args.length === 4 ? 2 : typeof args[1] === "function" && args.length === 3 ? 1 : -1;
    const callback = index < 0 ? undefined : args[index];
    const capture = (child: ChildProcess, ...rest: unknown[]) => {
      onProcess?.(child);
      const cancel = () => { child.kill("SIGKILL"); };
      signal?.addEventListener("abort", cancel, { once: true });
      child.once("close", () => signal?.removeEventListener("abort", cancel));
      if (signal?.aborted) cancel();
      if (typeof callback === "function") Reflect.apply(callback, this, [child, ...rest]);
    };
    if (index < 0) args.splice(args.length - 1, 0, capture); else args[index] = capture;
    return Reflect.apply(native._spawnFfmpeg, this, args);
  };
  proto.input = proto.addInput = proto.mergeAdd = function(source) {
    return native.input.call(this, fileArgument(source));
  };
  proto.output = proto.addOutput = function(target, options) {
    return native.output.call(this, fileArgument(target), options);
  };
  proto.clone = function() {
    // ACT: fluent 2.3.3 已设置输出时 clone.output() 会抛错；用空输出保留原生“不复制输出”的语义。
    const source = Object.create(this) as FfmpegInternals;
    if (this._outputs[0] && "target" in this._outputs[0]) {
      const empty = factory() as FfmpegInternals;
      source._outputs = empty._outputs;
      source._currentOutput = empty._currentOutput;
    }
    return Object.setPrototypeOf(native.clone.call(source), proto);
  };
  proto._getArguments = function() {
    checkFiles(this);
    const args = native._getArguments.call(this);
    return restricted ? admitArguments(this, args) : args;
  };
  proto.ffprobe = function(...args: unknown[]) {
    try {
      checkFiles(this);
      if (restricted) {
        const callback = args.at(-1);
        const first = args[0];
        const config = typeof first === "object" && first && !Array.isArray(first) ? first as { index?: number; options?: unknown[]; json?: boolean } : {};
        if (args.length > 2 || Array.isArray(first) || config.options?.length) denyOperation();
        const index = typeof first === "number" ? first : config.index ?? this._inputs.length - 1;
        const source = this._inputs[index]?.source;
        if (typeof source !== "string") denyOperation();
        const options = ["-f", inputFormat(source), "-protocol_whitelist", "file"];
        this._getFfprobePath((error: Error | null, path: string) => {
          if (error || signal?.aborted) { if (typeof callback === "function") callback(error ?? signal?.reason); return; }
          const child = spawn(path, ["-show_streams", "-show_format", "-of", "json", ...options, source], { cwd: root, windowsHide: true });
          onProcess?.(child);
          let output = "", failure: Error | undefined;
          const cancel = () => { child.kill("SIGKILL"); };
          signal?.addEventListener("abort", cancel, { once: true });
          if (signal?.aborted) cancel();
          child.stdout.on("data", bytes => { output += String(bytes); if (output.length > 8388608) { failure = new Error("FFprobe response too large"); cancel(); } });
          child.stderr.resume();
          child.on("error", error => { failure = error; });
          child.once("close", code => {
            signal?.removeEventListener("abort", cancel);
            if (typeof callback !== "function") return;
            if (failure || code || signal?.aborted) { callback(failure ?? new Error("FFprobe cancelled or failed")); return; }
            try { callback(null, JSON.parse(output)); } catch (error) { callback(error); }
          });
        });
        return;
      }
    }
    catch (error) {
      const callback = args.at(-1);
      if (typeof callback !== "function") throw error;
      callback(error);
      return;
    }
    Reflect.apply(native.ffprobe, this, args);
  };
  proto.screenshots = proto.screenshot = proto.takeScreenshots = proto.thumbnail = proto.thumbnails = function(config, folder) {
    const settings = typeof config === "number" ? { count: config } : { ...config };
    settings.folder = resolvePath(settings.folder ?? folder ?? root, true);
    resolvePath(join(settings.folder, settings.filename || "tn.png"));
    return native.screenshots.call(this, settings);
  };
  proto.concat = proto.concatenate = proto.mergeToFile = function(target, options?: string | { end?: boolean }) {
    return Reflect.apply(native.concat, this, [fileArgument(target), options]);
  };
  proto.preset = proto.usingPreset = function(preset) {
    if (restricted && typeof preset === "string") denyOperation();
    if (typeof preset === "string") {
      this.options.presets = resolvePath(this.options.presets ?? this.options.preset ?? root, true);
      const path = resolvePath(join(this.options.presets, preset));
      resolvePath(require.resolve(path));
    }
    return native.preset.call(this, preset);
  };

  const factory = function(input?: string | Readable | ffmpeg.FfmpegCommandOptions, options?: ffmpeg.FfmpegCommandOptions) {
    const settings = typeof input === "object" && input && !("readable" in input)
      ? { ...input } : { ...options, source: input as string | Readable | undefined };
    settings.cwd = resolvePath(settings.cwd ?? root, true);
    return Reflect.construct(ffmpeg, [settings], factory);
  } as typeof ffmpeg;
  Object.setPrototypeOf(factory, ffmpeg);
  factory.prototype = proto;
  factory.ffprobe = function(file: string, ...args: unknown[]) {
    const command = factory(file);
    Reflect.apply(command.ffprobe, command, args);
  };
  for (const name of ["availableFilters", "getAvailableFilters", "availableCodecs", "getAvailableCodecs", "availableEncoders", "getAvailableEncoders", "availableFormats", "getAvailableFormats"] as const) {
    Reflect.set(factory, name, (...args: unknown[]) => { const command = factory(); return Reflect.apply(command[name], command, args); });
  }
  return factory;
}
