import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { BuildInputLedger, moduleInputsPlugin } from "./scripts/embedded-inputs.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "dist-embedded");
const debugOutput = path.join(root, "dist-embedded.debug");
const inputLedger = new BuildInputLedger(root, { additionalFiles: [path.join(root, "../server/package.json")] });
const toolchainRoots = ["vite", "rolldown", "@vitejs/plugin-react", "@tailwindcss/postcss", "tailwindcss", "postcss", "react", "react-dom"];
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const publicFiles = [
  "brand/kdense-logo.png", "brand/kdense-logo-dark.png", "brand/studybuddy-wordmark.png",
  "dict/en_US.aff", "dict/en_US.dic", "office/runtime.html", "office/runtime.js",
  "office/thread.js", "office/zeta.js", "office/ZETAJS-LICENSE.txt",
];
const versionBytes = readFileSync(path.join(root, "../server/package.json"));
const appVersion = (JSON.parse(versionBytes.toString()) as { version: string }).version;

function filesIn(directory: string, source = false): string[] {
  return readdirSync(directory).sort().flatMap(name => {
    if (source && (new Set(["node_modules", ".next", ".git", "dist-embedded", "dist-embedded.debug", "coverage", "build", "out"]).has(name)
      || name === "dist-embedded.build.json" || name === "next-env.d.ts" || name.endsWith(".tsbuildinfo") || name.endsWith(".log") || name.startsWith(".env"))) return [];
    const file = path.join(directory, name), stat = lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Embedded build input is linked: ${file}`);
    return stat.isDirectory() ? filesIn(file, source) : stat.isFile() ? [file] : [];
  });
}

function snapshot() {
  const files = [
    // Tailwind scans source candidates beyond src/. Bind the ordinary web
    // source tree too, while excluding generated output and credential files.
    ...filesIn(root, true), path.join(root, "../server/package.json"),
  ].sort();
  return files.map(file => {
    const bytes = readFileSync(file);
    return { path: path.relative(root, file).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) };
  });
}

function embeddedResources(): Plugin {
  let inputs: ReturnType<typeof snapshot>;
  let modules: string[] = [];
  return {
    name: "studybuddy-embedded-resources",
    enforce: "post",
    buildStart() {
      inputs = snapshot();
      inputLedger.recordFiles(inputs.map(input => path.resolve(root, input.path)));
      inputLedger.recordStyles(inputs.filter(input => input.path.endsWith(".css")).map(input => path.resolve(root, input.path)));
      // Include actual loader JS and installed native bindings, not merely
      // package versions. Runtime packages are bound before first resolution.
      inputLedger.recordToolchain(toolchainRoots);
      if (sha256(versionBytes) !== inputs.find(input => input.path === "../server/package.json")?.sha256) {
        this.error("Research version input changed while configuring the static build");
      }
      const fonts = JSON.parse(readFileSync(path.join(root, "src/assets/fonts/provenance.json"), "utf8")) as {
        fonts: { file: string; bytes: number; sha256: string }[]; licenseSha256: string;
      };
      for (const font of fonts.fonts) {
        const bytes = readFileSync(path.join(root, "src/assets/fonts", font.file));
        if (bytes.length !== font.bytes || sha256(bytes) !== font.sha256) this.error(`Original research font changed: ${font.file}`);
      }
      if (sha256(readFileSync(path.join(root, "src/assets/fonts/OFL.txt"))) !== fonts.licenseSha256) this.error("Research font license changed");
    },
    generateBundle(_options, bundle) {
      const html = bundle["embedded.html"];
      if (!html || html.type !== "asset") this.error("Missing embedded HTML entry");
      delete bundle["embedded.html"];
      this.emitFile({ type: "asset", fileName: "index.html", source: html.source });
      modules = [...new Set(Object.values(bundle).flatMap(item => item.type === "chunk" ? Object.keys(item.modules) : []))]
        .map(id => path.relative(root, id.split("?")[0]).replaceAll("\\", "/")).sort();
      if (modules.some(id => /(?:^|\/)node_modules\/(?:next|@next)(?:\/|$)|src\/app\/(?:page|layout)\.tsx/.test(id))) {
        this.error("Standalone Next code entered the embedded frontend closure");
      }
      for (const fileName of publicFiles) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(path.join(root, "public", fileName)) });
      }
      this.emitFile({ type: "asset", fileName: "licenses/geist-OFL.txt", source: readFileSync(path.join(root, "src/assets/fonts/OFL.txt")) });
      // Vite's main-bundle notice omits packages used only by a Worker.
      for (const name of ["typo-js-BSD.txt", "en-US-dictionary.txt"]) {
        this.emitFile({ type: "asset", fileName: `licenses/${name}`, source: readFileSync(path.join(root, "src/assets/licenses", name)) });
      }
    },
    writeBundle() {
      if (JSON.stringify(inputs) !== JSON.stringify(snapshot())) this.error("Research frontend source changed during build; discard the stale output");
      inputLedger.assertTracked(this.getModuleIds());
      inputLedger.assertUnchanged();
      // Hidden maps have no runtime URL. Archive them before the production
      // inventory so source content cannot enter the materialized frontend.
      const maps = filesIn(output).filter(file => file.endsWith(".map"));
      if (!maps.length) this.error("Missing research frontend debug source maps");
      if (path.dirname(debugOutput) !== root || path.basename(debugOutput) !== "dist-embedded.debug") this.error("Invalid research debug directory");
      if (existsSync(debugOutput)) {
        if (lstatSync(debugOutput).isSymbolicLink() || !lstatSync(debugOutput).isDirectory()) this.error("Research debug directory must be a local directory");
        const previous = filesIn(debugOutput);
        if (previous.some(file => !file.endsWith(".map"))) this.error("Unexpected file in research debug directory; preserve it for review");
        // Only previously generated map files are replaced; never recursively
        // remove an inferred path or follow links out of this sibling directory.
        for (const file of previous) unlinkSync(file);
      }
      for (const file of maps) {
        const relative = path.relative(output, file);
        const destination = path.resolve(debugOutput, relative);
        if (relative.startsWith("..") || path.isAbsolute(relative) || !destination.startsWith(`${debugOutput}${path.sep}`)) this.error("Research source map escaped its debug directory");
        mkdirSync(path.dirname(destination), { recursive: true });
        renameSync(file, destination);
      }
      const debugFiles = filesIn(debugOutput).map(file => {
        const bytes = readFileSync(file);
        return { path: path.relative(debugOutput, file).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) };
      });
      const files = filesIn(output).map(file => {
        const bytes = readFileSync(file);
        return { path: path.relative(output, file).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) };
      });
      inputLedger.assertUnchanged();
      const actualInputs = inputLedger.inputs();
      writeFileSync(path.join(root, "dist-embedded.build.json"), `${JSON.stringify({
        schemaVersion: 1, kind: "studybuddy-research-web-build", inputBase: "web", sourceDigestKind: "inputs-json",
        entry: "index.html", profile: "studybuddy", nodeVersion: process.version,
        sourceDigest: sha256(JSON.stringify(actualInputs)), inputs: actualInputs, modules, files,
        inputCoverage: {
          policy: "Web source/public/config plus first-resolved main/Worker owning package file trees; complete installed toolchain dependency/optional-native package trees; no late input adoption",
          toolchainRoots, ...inputLedger.coverage(),
        },
        debug: { directory: "dist-embedded.debug", files: debugFiles },
      }, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  root,
  publicDir: false,
  plugins: [moduleInputsPlugin(inputLedger, "main"), react(), embeddedResources()],
  resolve: { alias: { "@": path.join(root, "src") } },
  define: {
    "process.env.NEXT_PUBLIC_RESEARCH_PROFILE": JSON.stringify("studybuddy"),
    "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(appVersion),
    "process.env.NEXT_PUBLIC_ADK_API_URL": "undefined",
  },
  build: {
    outDir: output,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: "hidden",
    license: { fileName: "licenses/bundled-dependencies.md" },
    rollupOptions: { input: path.join(root, "embedded.html") },
  },
  worker: { format: "es", plugins: () => [moduleInputsPlugin(inputLedger, "worker")] },
});
