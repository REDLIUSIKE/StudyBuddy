import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";
import { BuildInputLedger, moduleInputsPlugin } from "./embedded-inputs.mjs";

const temporary = [];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "studybuddy-web-inputs-"));
  temporary.push(directory);
  const root = path.join(directory, "web");
  const write = (relative, content) => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  const pkg = (name, files = {}, metadata = {}) => {
    const prefix = `node_modules/${name}/`;
    write(`${prefix}package.json`, JSON.stringify({ name, version: "1.0.0", main: "index.js", ...metadata }));
    write(`${prefix}index.js`, "export const value = 1;");
    for (const [file, content] of Object.entries(files)) write(`${prefix}${file}`, content);
    return path.join(root, prefix);
  };
  write("package-lock.json", '{"lockfileVersion":3}');
  write("src/main.ts", 'import "main-dep";');
  write("src/worker.ts", 'import "worker-dep";');
  pkg("main-dep", { "dist/package.json": '{"type":"module"}', "dist/main.js": "export const nested = 1;" });
  pkg("worker-dep");
  pkg("tool", {}, { dependencies: { "tool-child": "1.0.0" }, optionalDependencies: { "native-tool": "1.0.0", "not-installed": "1.0.0" } });
  pkg("tool-child", { "loader.mjs": "export default 1;" });
  pkg("native-tool", { "binding.node": Buffer.from([0, 1, 2, 3]) });
  return { directory, root, write, pkg };
}
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("studybuddy-web-inputs-"));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true, force: true });
  }
});

function bindFixture(f) {
  const ledger = new BuildInputLedger(f.root);
  ledger.recordFiles([path.join(f.root, "package-lock.json")]);
  ledger.recordToolchain(["tool"]);
  const main = moduleInputsPlugin(ledger, "main"), worker = moduleInputsPlugin(ledger, "worker");
  main.resolveId.handler("main-dep", path.join(f.root, "src/main.ts"));
  main.load.handler(path.join(f.root, "node_modules/main-dep/dist/main.js"));
  worker.resolveId.handler("worker-dep", path.join(f.root, "src/worker.ts"));
  worker.load.handler(`${path.join(f.root, "node_modules/worker-dep/index.js")}?worker`);
  return ledger;
}

test("main and Worker share raw dependency bytes, including metadata and native tool files", () => {
  const f = fixture(), ledger = bindFixture(f);
  ledger.assertUnchanged();
  const inputs = ledger.inputs();
  for (const relative of ["node_modules/main-dep/dist/main.js", "node_modules/main-dep/package.json", "node_modules/worker-dep/index.js", "node_modules/tool-child/loader.mjs", "node_modules/native-tool/binding.node"]) {
    const input = inputs.find(file => file.path === relative);
    assert.ok(input, `Missing actual dependency ${relative}`);
    assert.equal(input.sha256, hash(readFileSync(path.join(f.root, relative))));
  }
  assert.ok(ledger.coverage().workerModules.includes("node_modules/worker-dep/index.js"));
  assert.ok(ledger.coverage().toolchainPackages.some(pkg => pkg.name === "native-tool"));
});

for (const [label, relative, content] of [
  ["main module", "node_modules/main-dep/dist/main.js", "export const nested = 2;"],
  ["Worker dependency", "node_modules/worker-dep/index.js", "export const value = 2;"],
  ["native tool", "node_modules/native-tool/binding.node", Buffer.from([0, 1, 2, 4])],
  ["tool loader", "node_modules/tool-child/loader.mjs", "export default 2;"],
]) test(`rejects changed ${label} bytes while lock/version remain unchanged`, () => {
  const f = fixture(), ledger = bindFixture(f);
  const before = ledger.inputs().find(file => file.path === relative);
  const lock = readFileSync(path.join(f.root, "package-lock.json"));
  f.write(relative, content);
  assert.deepEqual(readFileSync(path.join(f.root, "package-lock.json")), lock);
  assert.throws(() => ledger.assertUnchanged(), /Build input changed/);
  assert.deepEqual(ledger.inputs().find(file => file.path === relative), before, "Changed bytes must not be adopted");
});

test("raw CSS imports, queried font URLs and file URLs bind the original files", () => {
  const f = fixture();
  f.pkg("style-dep", { "theme.css": '@font-face{src:url("fonts/font.woff2?x#font")}', "fonts/font.woff2": "font-v1" }, { style: "theme.css" });
  const css = f.write("src/main.css", '@import "style-dep";a{background:url("./local.svg?url#icon")}');
  f.write("src/local.svg", "<svg/>");
  const ledger = new BuildInputLedger(f.root);
  ledger.recordStyles([css]);
  const plugin = moduleInputsPlugin(ledger, "main");
  plugin.load.handler(`${pathToFileURL(path.join(f.root, "node_modules/main-dep/index.js"))}?commonjs-entry`);
  plugin.load.handler("\0vite/modulepreload-polyfill.js");
  plugin.resolveId.handler("\0vite/modulepreload-polyfill.js");
  ledger.assertUnchanged();
  for (const relative of ["node_modules/style-dep/theme.css", "node_modules/style-dep/fonts/font.woff2", "src/local.svg", "node_modules/main-dep/index.js"]) {
    assert.ok(ledger.inputs().some(file => file.path === relative), `Missing CSS/module input ${relative}`);
  }
  f.write("node_modules/style-dep/fonts/font.woff2", "font-v2");
  assert.throws(() => ledger.assertUnchanged(), /Build input changed/);
});

test("rejects late unbound watch inputs and newly added package files", () => {
  const f = fixture(), ledger = bindFixture(f);
  const late = f.write("src/late.json", "{}");
  assert.throws(() => ledger.assertTracked([late]), /Untracked build input/);
  assert.throws(() => ledger.assertTracked([path.join(f.root, "node_modules/not-present/index.js")]), /Untracked build input/);
  assert.ok(!ledger.inputs().some(file => file.path === "src/late.json"));
  f.write("node_modules/main-dep/late.js", "new bytes");
  assert.throws(() => ledger.assertUnchanged(), /Build package inventory changed/);
});

test("asset-only package URLs bind WASM bytes before a browser transform reads them", () => {
  const f = fixture();
  f.pkg("decoder-bits", { "runtime.wasm": Buffer.from([0, 97, 115, 109]) });
  const source = f.write("src/decoder.ts", 'export const wasm = new URL("decoder-bits/runtime.wasm?url", import.meta.url);');
  const ledger = new BuildInputLedger(f.root);
  moduleInputsPlugin(ledger, "main").load.handler(source);
  assert.ok(ledger.inputs().some(file => file.path === "node_modules/decoder-bits/runtime.wasm"));
  f.write("node_modules/decoder-bits/runtime.wasm", Buffer.from([0, 97, 115, 110]));
  assert.throws(() => ledger.assertUnchanged(), /Build input changed/);
});

test("rejects linked or outside inputs and missing required tools", () => {
  const f = fixture(), ledger = new BuildInputLedger(f.root);
  const linked = path.join(f.root, "node_modules/linked");
  symlinkSync(path.join(f.root, "node_modules/main-dep"), linked, "junction");
  assert.throws(() => ledger.recordModule(path.join(linked, "index.js"), "main"), /linked/i);
  const outside = path.join(f.directory, "outside.js");
  writeFileSync(outside, "outside");
  assert.throws(() => ledger.recordModule(outside, "main"), /outside/i);
  assert.throws(() => ledger.recordToolchain(["missing-tool"]), /Missing build package/);
});

test("an installed optional tool cannot hide a missing required child", () => {
  const f = fixture();
  f.pkg("native-tool", { "binding.node": "native bytes" }, { dependencies: { "missing-required-child": "1.0.0" } });
  const ledger = new BuildInputLedger(f.root);
  assert.throws(() => ledger.recordToolchain(["tool"]), /Missing build package missing-required-child/);
});

test("leaves Node builtin browser mappings to Vite instead of inventing npm inputs", () => {
  const f = fixture(), ledger = bindFixture(f);
  const before = ledger.inputs();
  const worker = moduleInputsPlugin(ledger, "worker");
  assert.equal(worker.resolveId.handler("fs", path.join(f.root, "node_modules/worker-dep/index.js")), null);
  assert.equal(worker.resolveId.handler("fs/promises", path.join(f.root, "src/worker.ts")), null);
  assert.equal(worker.resolveId.handler("node:fs", path.join(f.root, "src/worker.ts")), null);
  assert.deepEqual(ledger.inputs(), before);
  assert.throws(() => worker.resolveId.handler("missing-fs-package", path.join(f.root, "src/worker.ts")), /Missing build package/);
});
