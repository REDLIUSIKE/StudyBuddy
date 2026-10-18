import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};
const portable = (root, file) => path.relative(root, file).replaceAll("\\", "/");

/** Physical input bytes are captured once, never refreshed to accept drift. */
export class BuildInputLedger {
  /** @param {string} root @param {{additionalFiles?: string[]}} [options] */
  constructor(root, { additionalFiles = [] } = {}) {
    this.root = path.resolve(root);
    this.additionalFiles = new Set(additionalFiles.map(file => path.resolve(file)));
    this.records = new Map();
    this.packages = new Map();
    this.toolchainVisited = new Set();
    this.styleVisited = new Set();
    this.assetRequestsVisited = new Set();
    this.moduleFiles = { main: new Set(), worker: new Set() };
  }

  physical(file) {
    const absolute = path.resolve(file);
    if (!inside(this.root, absolute) && !this.additionalFiles.has(absolute)) throw new Error(`Build input is outside the approved web root: ${absolute}`);
    const base = inside(this.root, absolute) ? this.root : path.dirname(this.root);
    let cursor = base;
    for (const segment of ["", ...path.relative(base, absolute).split(path.sep)]) {
      if (segment) cursor = path.join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Build input is linked: ${cursor}`);
    }
    if (!lstatSync(absolute).isFile()) throw new Error(`Build input is not a file: ${absolute}`);
    const real = realpathSync.native(absolute);
    if (!inside(this.root, real) && !this.additionalFiles.has(real)) throw new Error(`Build input resolves outside the approved web root: ${absolute}`);
    return real;
  }

  recordFile(file) {
    const real = this.physical(file), bytes = readFileSync(real);
    const record = { path: portable(this.root, real), bytes: bytes.length, sha256: sha256(bytes) };
    const previous = this.records.get(real);
    if (previous && (previous.bytes !== record.bytes || previous.sha256 !== record.sha256)) throw new Error(`Build input changed: ${record.path}`);
    if (!previous) this.records.set(real, record);
    return real;
  }

  recordFiles(files) { for (const file of files) this.recordFile(file); }

  packageFiles(directory) {
    if (lstatSync(directory).isSymbolicLink()) throw new Error(`Build package is linked: ${directory}`);
    return readdirSync(directory).sort().flatMap(name => {
      if (name === "node_modules" || name === ".git") return [];
      const file = path.join(directory, name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`Build input is linked: ${file}`);
      return stat.isDirectory() ? this.packageFiles(file) : stat.isFile() ? [file] : [];
    });
  }

  findPackage(name, from = this.root) {
    let cursor = path.resolve(from);
    while (inside(this.root, cursor)) {
      const candidate = path.join(cursor, "node_modules", name, "package.json");
      if (existsSync(candidate)) {
        this.physical(candidate);
        return path.dirname(candidate);
      }
      if (cursor === this.root) break;
      cursor = path.dirname(cursor);
    }
    throw new Error(`Missing build package ${name} from ${portable(this.root, from) || "."}`);
  }

  owningPackage(file) {
    if (!portable(this.root, file).split("/").includes("node_modules")) return null;
    let directory = path.dirname(file);
    while (inside(this.root, directory) && directory !== this.root) {
      const manifest = path.join(directory, "package.json");
      if (existsSync(manifest)) {
        this.physical(manifest);
        // Nested {type:'module'} markers do not own the npm package.
        if (typeof JSON.parse(readFileSync(manifest, "utf8")).name === "string") return directory;
      }
      directory = path.dirname(directory);
    }
    throw new Error(`Dependency has no owning package: ${portable(this.root, file)}`);
  }

  recordPackage(directory, group) {
    let record = this.packages.get(directory);
    if (!record) {
      const files = this.packageFiles(directory);
      this.recordFiles(files);
      const metadata = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
      record = { name: metadata.name, files, groups: new Set(), metadata };
      this.packages.set(directory, record);
    }
    record.groups.add(group);
    return record;
  }

  recordToolchain(names, from = this.root) {
    for (const name of names) {
      const directory = this.findPackage(name, from);
      const record = this.recordPackage(directory, "toolchain");
      if (this.toolchainVisited.has(directory)) continue;
      this.toolchainVisited.add(directory);
      const optional = record.metadata.optionalDependencies ?? {};
      for (const dependency of Object.keys({ ...record.metadata.dependencies, ...optional }).sort()) {
        try { this.findPackage(dependency, directory); }
        catch (error) {
          if (!(dependency in optional) || !String(error.message).startsWith("Missing build package ")) throw error;
          continue;
        }
        this.recordToolchain([dependency], directory);
      }
    }
  }

  moduleFile(id) {
    if (typeof id !== "string" || id.includes("\0") || id.startsWith("virtual:") || id.startsWith("/@")) return null;
    const clean = id.split("?")[0].split("#")[0];
    const file = clean.startsWith("file:") ? fileURLToPath(clean) : clean;
    return path.isAbsolute(file) ? file : null;
  }

  packageName(request) {
    if (!request || /^(?:\.|\/|#|\w+:|@\/)/.test(request)) return null;
    const parts = request.split("/");
    return request.startsWith("@") ? parts.length >= 2 ? parts.slice(0, 2).join("/") : null : parts[0];
  }

  recordRequest(request, importer) {
    // Browser:false mappings such as typo-js's fs are Vite's responsibility;
    // builtin implementation bytes are bound by the shared Node identity.
    if (request.includes("\0") || isBuiltin(request)) return;
    const name = this.packageName(request.split("?")[0].split("#")[0]);
    if (!name) return;
    const parent = this.moduleFile(importer);
    const directory = this.findPackage(name, parent ? path.dirname(parent) : this.root);
    this.recordPackage(directory, "browser");
  }

  recordModule(id, target) {
    const file = this.moduleFile(id);
    if (!file) return;
    const real = this.recordFile(file);
    const owner = this.owningPackage(real);
    if (owner) this.recordPackage(owner, "browser");
    this.moduleFiles[target].add(portable(this.root, real));
    if (real.endsWith(".css")) this.recordStyles([real]);
    if (/\.[cm]?[jt]sx?$/.test(real) && !this.assetRequestsVisited.has(real)) {
      this.assetRequestsVisited.add(real);
      const source = readFileSync(real, "utf8");
      for (const [, request] of source.matchAll(/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) {
        const clean = request.split("?")[0].split("#")[0];
        if (/^(?:https?:|data:|\/\/)/.test(clean)) continue;
        if (this.packageName(clean)) this.recordRequest(clean, real);
        else {
          const asset = path.resolve(path.dirname(real), clean);
          if (existsSync(asset)) this.recordFile(asset);
        }
      }
    }
  }

  styleExport(value) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return null;
    for (const key of ["style", "default", "import", "require"]) {
      const result = this.styleExport(value[key]);
      if (result) return result;
    }
    return null;
  }

  recordStyles(files) {
    for (const file of files) {
      const real = this.recordFile(file);
      if (this.styleVisited.has(real)) continue;
      this.styleVisited.add(real);
      const css = readFileSync(real, "utf8");
      const requests = new Set([
        ...[...css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map(match => match[1]),
        ...[...css.matchAll(/url\(\s*["']?([^'"\s)]+)["']?\s*\)/g)].map(match => match[1]),
      ]);
      for (let request of requests) {
        if (/^(?:data:|https?:|\/\/|#|var\()/i.test(request)) continue;
        request = decodeURIComponent(request.split("?")[0].split("#")[0]);
        let resolved;
        const name = this.packageName(request);
        const relative = path.resolve(path.dirname(real), request);
        if (!request.startsWith("/") && !request.startsWith("@/") && existsSync(relative)) resolved = relative;
        else if (name) {
          const directory = this.findPackage(name, path.dirname(real));
          const { metadata } = this.recordPackage(directory, "browser");
          const subpath = request.slice(name.length);
          const exported = this.styleExport(metadata.exports?.[subpath ? `.${subpath}` : "."]);
          resolved = path.resolve(directory, exported ?? (subpath ? `.${subpath}` : metadata.style ?? "index.css"));
        } else if (request.startsWith("@/")) resolved = path.join(this.root, "src", request.slice(2));
        else if (request.startsWith("/")) {
          const source = path.join(this.root, request.slice(1));
          resolved = existsSync(source) ? source : path.join(this.root, "public", request.slice(1));
        } else resolved = path.resolve(path.dirname(real), request);
        if (!existsSync(resolved)) throw new Error(`Missing CSS build input ${request} from ${portable(this.root, real)}`);
        this.recordFile(resolved);
        if (resolved.endsWith(".css")) this.recordStyles([resolved]);
      }
    }
  }

  assertTracked(ids) {
    for (const id of ids) {
      const file = this.moduleFile(id);
      if (!file) continue;
      if (!existsSync(file) || lstatSync(file).isDirectory()) throw new Error(`Untracked build input is missing or not a file: ${portable(this.root, file)}`);
      const real = this.physical(file);
      if (!this.records.has(real)) throw new Error(`Untracked build input was consumed: ${portable(this.root, real)}`);
    }
  }

  assertUnchanged() {
    for (const [file, record] of this.records) {
      const real = this.physical(file), bytes = readFileSync(real);
      if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`Build input changed: ${record.path}`);
    }
    for (const [directory, record] of this.packages) {
      if (JSON.stringify(record.files) !== JSON.stringify(this.packageFiles(directory))) throw new Error(`Build package inventory changed: ${portable(this.root, directory)}`);
    }
  }

  /** @returns {{path: string, bytes: number, sha256: string}[]} */
  inputs() { return [...this.records.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0); }

  coverage() {
    const packages = group => [...this.packages].filter(([, record]) => record.groups.has(group))
      .map(([directory, record]) => ({ name: record.name, path: portable(this.root, directory) }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return { mainModules: [...this.moduleFiles.main].sort(), workerModules: [...this.moduleFiles.worker].sort(), browserPackages: packages("browser"), toolchainPackages: packages("toolchain") };
  }
}

/** @returns {import('vite').Plugin} */
export function moduleInputsPlugin(ledger, target) {
  return {
    name: `studybuddy-${target}-input-bytes`, enforce: "pre",
    resolveId: { order: "pre", handler(request, importer) { ledger.recordRequest(request, importer); return null; } },
    load: { order: "pre", handler(id) { ledger.recordModule(id, target); return null; } },
    transform: { order: "pre", handler(_code, id) { ledger.recordModule(id, target); return null; } },
    buildEnd(error) { if (!error) ledger.assertTracked(this.getModuleIds()); },
  };
}
