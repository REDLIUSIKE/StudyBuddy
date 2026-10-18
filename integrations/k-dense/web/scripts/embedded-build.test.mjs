import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist-embedded");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = name => readFileSync(path.join(output, name));
const publicFiles = [
  "brand/kdense-logo.png", "brand/kdense-logo-dark.png", "brand/studybuddy-wordmark.png",
  "dict/en_US.aff", "dict/en_US.dic", "office/runtime.html", "office/runtime.js",
  "office/thread.js", "office/zeta.js", "office/ZETAJS-LICENSE.txt",
];

test("the production HTML resolves only built same-origin assets", () => {
  assert.ok(existsSync(path.join(output, "index.html")), "Static index.html has not been built");
  const html = read("index.html").toString();
  assert.match(html, /StudyBuddy 研究工作台/);
  assert.doesNotMatch(html, /\/src\/|\/_next\//);
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(urls.some(url => /^\/assets\/.+\.js$/.test(url)), "Missing production browser entry");
  for (const url of urls) {
    assert.ok(url.startsWith("/assets/"), `Unexpected external browser dependency ${url}`);
    assert.ok(existsSync(path.join(output, url.slice(1))), `Missing HTML asset ${url}`);
  }
});

test("Office bridges and dictionaries retain their original resource bytes", () => {
  for (const name of publicFiles) assert.equal(hash(read(name)), hash(readFileSync(path.join(root, "public", name))), name);
});

test("PDF and spellchecking retain emitted Workers and fonts without Next runtime", () => {
  const files = readdirSync(path.join(output, "assets"));
  assert.ok(files.some(name => /^pdf\.worker\.min-.+\.mjs$/.test(name)), "Missing PDF worker");
  assert.ok(files.some(name => /^spellcheck\.worker-.+\.js$/.test(name)), "Missing spelling worker");
  const fonts = JSON.parse(readFileSync(path.join(root, "src/assets/fonts/provenance.json"), "utf8"));
  for (const font of fonts.fonts) {
    assert.ok(files.some(name => name.endsWith(".woff2") && hash(read(`assets/${name}`)) === font.sha256), `Missing original font ${font.file}`);
  }
  for (const name of files.filter(file => /\.(js|mjs|css)$/.test(file))) {
    const text = read(`assets/${name}`).toString();
    assert.doesNotMatch(text, /\/_next\/|next\/dynamic|next\/font|sourceMappingURL=/, name);
    for (const [, url] of text.matchAll(/url\((?:"|')?(\/assets\/[^)'"\s]+)(?:"|')?\)/g)) {
      assert.ok(existsSync(path.join(output, url.slice(1))), `Missing CSS asset ${url}`);
    }
  }
  assert.ok(!files.some(name => /\.map$/.test(name)), "Source maps must stay outside the production frontend");
  assert.match(read("licenses/geist-OFL.txt").toString(), /SIL OPEN FONT LICENSE/);
  assert.ok(read("licenses/bundled-dependencies.md").length > 0);
  assert.match(read("licenses/typo-js-BSD.txt").toString(), /Copyright \(c\) 2011, Christopher Finke/);
  assert.equal(hash(read("licenses/en-US-dictionary.txt")), hash(readFileSync(path.join(root, "node_modules/typo-js/dictionaries/en_US/README.md"))));
});

test("build identity binds current source inputs and the complete emitted inventory", () => {
  const proof = JSON.parse(readFileSync(path.join(root, "dist-embedded.build.json"), "utf8"));
  assert.equal(proof.kind, "studybuddy-research-web-build");
  assert.equal(proof.inputBase, "web");
  assert.equal(proof.sourceDigestKind, "inputs-json");
  assert.equal(proof.entry, "index.html");
  assert.equal(proof.profile, "studybuddy");
  assert.ok(proof.inputs.some(file => file.path === "src/embedded-main.tsx"));
  for (const input of proof.inputs) assert.equal(hash(readFileSync(path.resolve(root, input.path))), input.sha256, `Stale source ${input.path}`);
  for (const file of proof.files) {
    const bytes = read(file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(hash(bytes), file.sha256, file.path);
  }
  const actualFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(file => {
    assert.ok(!file.isSymbolicLink(), `Linked output ${file.name}`);
    const fullPath = path.join(directory, file.name);
    return file.isDirectory() ? actualFiles(fullPath) : [path.relative(output, fullPath).replaceAll("\\", "/")];
  });
  assert.deepEqual(actualFiles(output).sort(), proof.files.map(file => file.path).sort());
  assert.ok(!proof.modules.some(id => /(?:^|\/)node_modules\/(?:next|@next)(?:\/|$)|src\/app\/(?:page|layout)\.tsx/.test(id)), "Standalone/Next code entered the static closure");
});

test("hidden source maps remain in a separate byte-verified debug archive", () => {
  const proof = JSON.parse(readFileSync(path.join(root, "dist-embedded.build.json"), "utf8"));
  assert.equal(proof.debug?.directory, "dist-embedded.debug");
  const debug = path.join(root, proof.debug.directory);
  assert.ok(proof.debug.files.length > 0, "The debug archive must contain real source maps");
  let entrySource = false, spellingSource = false;
  for (const file of proof.debug.files) {
    assert.ok(file.path.endsWith(".map"), `Unexpected debug artifact ${file.path}`);
    const bytes = readFileSync(path.join(debug, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(hash(bytes), file.sha256, file.path);
    const map = JSON.parse(bytes);
    assert.equal(map.version, 3, file.path);
    assert.ok(map.sources.length > 0, `Missing original sources in ${file.path}`);
    assert.ok(map.sourcesContent.some(source => typeof source === "string" && source.length > 0), `Missing source content in ${file.path}`);
    entrySource ||= map.sources.some(source => source.endsWith("/src/embedded-main.tsx"));
    spellingSource ||= map.sources.some(source => source.endsWith("/src/lib/latex/spellcheck.worker.ts"));
  }
  assert.ok(entrySource, "Missing embedded entry source map");
  assert.ok(spellingSource, "Missing spelling Worker source map");
  const actual = directory => readdirSync(directory, { withFileTypes: true }).flatMap(file => {
    assert.ok(!file.isSymbolicLink(), `Linked debug output ${file.name}`);
    const fullPath = path.join(directory, file.name);
    return file.isDirectory() ? actual(fullPath) : [path.relative(debug, fullPath).replaceAll("\\", "/")];
  });
  assert.deepEqual(actual(debug).sort(), proof.debug.files.map(file => file.path).sort());
  assert.ok(!proof.files.some(file => file.path.endsWith(".map")), "Debug files entered the production inventory");
});

test("actual main, Worker and native tool bytes participate in the build input proof", () => {
  const proof = JSON.parse(readFileSync(path.join(root, "dist-embedded.build.json"), "utf8"));
  assert.ok(proof.inputCoverage, "Missing actual dependency-byte coverage");
  const recorded = new Map(proof.inputs.map(file => [file.path, file]));
  assert.equal(proof.sourceDigest, hash(JSON.stringify(proof.inputs)));
  for (const module of [...proof.inputCoverage.mainModules, ...proof.inputCoverage.workerModules]) {
    assert.ok(recorded.has(module), `Module bytes not bound: ${module}`);
  }
  assert.ok(proof.inputCoverage.workerModules.includes("node_modules/typo-js/typo.js"), "Missing Worker-only dependency bytes");
  for (const name of ["vite", "rolldown", "@vitejs/plugin-react", "@tailwindcss/postcss", "postcss", "tailwindcss", "react", "react-dom"]) {
    const tool = proof.inputCoverage.toolchainPackages.find(pkg => pkg.name === name);
    assert.ok(tool, `Missing tool package ${name}`);
    assert.ok(proof.inputs.some(file => file.path.startsWith(`${tool.path}/`) && /\.(?:js|mjs|cjs|node)$/.test(file.path)), `Tool bytecode not bound: ${name}`);
  }
  for (const native of [/node_modules\/@rolldown\/binding-[^/]+\/.+\.node$/, /node_modules\/@tailwindcss\/oxide-[^/]+\/.+\.node$/, /node_modules\/lightningcss-[^/]+\/.+\.node$/]) {
    assert.ok(proof.inputs.some(file => native.test(file.path)), `Missing native build tool ${native}`);
  }
  assert.ok(proof.inputs.some(file => /node_modules\/katex\/dist\/fonts\/.+\.woff2$/.test(file.path)), "Missing raw CSS font bytes");
});
