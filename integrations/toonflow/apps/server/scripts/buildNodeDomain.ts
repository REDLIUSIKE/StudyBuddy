import { cp, lstat, mkdir, readFile, realpath, writeAtomic } from "@toonflow/file";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse } from "@babel/parser";
import { createHash } from "node:crypto";
import fg from "fast-glob";
import { build } from "esbuild";

/** Build only domain handlers; the standalone agent application is not an input. */
export default async function buildNodeDomain(projectDirectory: string) {
  const server = join(projectDirectory, "apps/server"), root = join(server, "src");
  const output = join(projectDirectory, "build/server");
  const sdk = dirname(Bun.resolveSync("@earendil-works/pi-coding-agent", server));
  const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
  const photonSource = 'let loaded;export function loadPhoton(){return loaded??=import("@silvia-odwyer/photon-node");}';
  const photonLoader = { name: "nativePhotonLoader", setup(build: import("esbuild").PluginBuild) {
    build.onResolve({ filter: /^\.\/photon\.js$/ }, args => args.importer.startsWith(sdk) ? { path: "photon", namespace: "nativePhoton" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "nativePhoton" }, () => ({ contents: photonSource, loader: "js" as const, resolveDir: sdk }));
  } };
  const sdkExports = [
    ["defineTool", "core/extensions/types.js"], ["parseFrontmatter", "utils/frontmatter.js"],
    ["loadSkills, loadSkillsFromDir", "core/skills.js"],
    ["createReadToolDefinition", "core/tools/read.js"], ["createWriteToolDefinition", "core/tools/write.js"],
    ["createEditToolDefinition", "core/tools/edit.js"], ["createLsToolDefinition", "core/tools/ls.js"],
    ["detectSupportedImageMimeTypeFromFile", "utils/mime.js"],
  ].map(([names, path]) => `export {${names}} from ${JSON.stringify(join(sdk, path!))};`).join("\n");
  const retainedRoutes = (await fg("routes/**/*.ts", { cwd: root })).sort().filter(path => {
    const route = path.replaceAll("\\", "/").slice(7, -3);
    return /^(?:assets|browser|ext|ffmpeg|nodes|skills|tools|workspaces)\//.test(route)
      || /^mcp\/control\/(?:events|state|result)$/.test(route)
      || /^settings\/(?:get|save|systemPrompt|personalization\/(?:get|save))$/.test(route)
      || /^ai\/(?:models|media\/(?:generate|models|resume|tasks))$/.test(route)
      || /^singleAgent\/(?:create|run|control|toolResult)$/.test(route)
      || route === "agent/mentionSource"
      || route === "studyBuddy/info";
  });
  const imports = retainedRoutes.map((path, index) => `import route${index} from ${JSON.stringify(join(root, path))};`);
  const uses = retainedRoutes.map((path, index) => `app.use(${JSON.stringify("/api/" + path.slice(7, -3).replace(/\/index$/, "").replace(/^singleAgent\//, "native/temporary/").replace(/^agent\/mentionSource$/, "native/referenceSource"))},route${index});`);
  const router = `${imports.join("\n")}\nexport default function router(app){${uses.join("\n")}}`;
  const inputs = new Map<string, string>();
  const result = await build({ absWorkingDir: projectDirectory, entryPoints: [join(root, "embedded/domain.ts")], outfile: join(output, "domain.js"), platform: "node", target: "node24", format: "esm", minify: true,
    bundle: true, metafile: true, tsconfig: join(server, "tsconfig.json"),
    banner: { js: 'import {createRequire as nativeRequire} from "node:module";const require=nativeRequire(import.meta.url);' },
    sourcemap: "external", external: ["zod", "sharp", "@silvia-odwyer/photon-node"],
    define: { "process.env.STUDYBUDDY_EMBEDDED": '"1"', "process.env.STUDYBUDDY_NATIVE_AIGC": '"1"', "process.env.NODE_ENV": '"production"',
      "process.platform": JSON.stringify(process.platform), "process.arch": JSON.stringify(process.arch) },
    plugins: [photonLoader, { name: "nativeAigcClosure", setup(build) {
      build.onResolve({ filter: /^@\/embedded\/router$/ }, () => ({ path: "router", namespace: "nativeAigc" }));
      build.onResolve({ filter: /^@earendil-works\/pi-coding-agent$/ }, () => ({ path: "sdk", namespace: "nativeAigc" }));
      build.onResolve({ filter: /^@\/utils$/ }, () => ({ path: join(root, "embedded/utils.ts") }));
      build.onResolve({ filter: /^@toonflow\/file\/bun$/ }, () => ({ path: join(projectDirectory, "packages/file/src/node.ts") }));
      build.onLoad({ filter: /.*/, namespace: "nativeAigc" }, args => ({ contents: args.path === "router" ? router : sdkExports, loader: "js", resolveDir: server }));
      build.onLoad({ filter: /\.ts$/ }, async args => {
        if (/[\\/]node_modules[\\/]/.test(args.path)) return;
        const source = await readFile(args.path, "utf8"); inputs.set(args.path, source);
        const replacements: { start: number; end: number }[] = [];
        const visit = (node: unknown): void => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) { node.forEach(visit); return; }
          const item = node as Record<string, unknown>;
          const object = item.object as Record<string, unknown> | undefined;
          const property = item.property as Record<string, unknown> | undefined;
          if (item.type === "MemberExpression" && object?.type === "Identifier" && object.name === "Bun" && property?.name !== "plugin") replacements.push({ start: Number(object.start), end: Number(object.end) });
          for (const [key, child] of Object.entries(item)) if (!["loc", "start", "end", "comments", "tokens"].includes(key)) visit(child);
        };
        if (!source.includes("Bun.")) return;
        visit(parse(source, { sourceType: "module", plugins: ["typescript"] }));
        if (!replacements.length) return;
        let contents = source;
        for (const replacement of replacements.sort((a, b) => b.start - a.start)) contents = contents.slice(0, replacement.start) + "nodeRuntime" + contents.slice(replacement.end);
        return { contents: `import {nodeRuntime} from ${JSON.stringify(join(root, "embedded/runtime.ts"))};\n${contents}`, loader: "ts", resolveDir: dirname(args.path) };
      });
    } }],
  });
  const forbidden = Object.keys(result.metafile.inputs).filter(path => /[/\\]agent[/\\](?:runtime[/\\]index|index)\.ts$|[/\\]core[/\\](?:agent-session|session-manager)\.js$|[/\\]pi-agent-core[/\\]/.test(path));
  if (forbidden.length) throw new Error("AIGC_OLD_AGENT_IN_CLOSURE: " + forbidden.join(", "));
  await build({ entryPoints: [join(root, "embedded/toolZod.ts")], outfile: join(output, "toolZod.js"), bundle: true, platform: "node", target: "node24", format: "esm", minify: true, external: ["zod"] });
  const worker = await build({ absWorkingDir: projectDirectory, entryPoints: [join(sdk, "utils/image-resize-worker.js")], outfile: join(output, "image-resize-worker.js"), bundle: true, platform: "node", target: "node24", format: "esm", minify: true, metafile: true,
    external: ["@silvia-odwyer/photon-node"], plugins: [photonLoader] });
  // Sharp's native optional dependency is copied only for this exact build platform.
  const copied = new Set<string>();
  const copyPackage = async (name: string, parent: string): Promise<void> => {
    if (copied.has(name)) return;
    const metadataPath = Bun.resolveSync(name + "/package.json", parent);
    const directory = await realpath(dirname(metadataPath));
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    const destination = join(projectDirectory, "build/node_modules", name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(directory, destination, { recursive: true, dereference: true }); copied.add(name);
    for (const dependency of Object.keys(metadata.dependencies ?? {})) await copyPackage(dependency, directory);
    for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) {
      if (!dependency.startsWith("@img/sharp-") || !dependency.endsWith(`-${process.platform}-${process.arch}`)) continue;
      await copyPackage(dependency, directory);
    }
  };
  await copyPackage("sharp", server);
  await copyPackage("zod", server);
  await copyPackage("@silvia-odwyer/photon-node", sdk);
  await mkdir(join(projectDirectory, "build/notices"), { recursive: true });
  for (const name of ["piToolHelpersLicense.txt", "piToolHelpersSource.json", "zigHashLicense.txt", "ffmpegLicense.txt", "ffmpegReadme.txt"]) await cp(join(root, "embedded/notices", name), join(projectDirectory, "build/notices", name));
  await writeAtomic(join(output, "package.json"), '{"private":true,"type":"module"}\n');
  const sourceRows = await Promise.all([...new Set([...Object.keys(result.metafile.inputs), ...Object.keys(worker.metafile.inputs)])].sort().map(async path => {
    const source = path === "nativeAigc:router" ? router : path === "nativeAigc:sdk" ? sdkExports : path === "nativePhoton:photon" ? photonSource : await readFile(resolve(projectDirectory, path));
    return { path: path.split(sep).join("/"), size: Buffer.byteLength(source), sha256: hash(source) };
  }));
  await writeAtomic(join(output, "domainClosure.json"), JSON.stringify({ schemaVersion: 1, entry: "server/domain.js", routes: retainedRoutes,
    sourceFiles: [...inputs.keys()].map(path => relative(projectDirectory, path).split(sep).join("/")).sort(), inputs: sourceRows,
    domainSha256: hash(await readFile(join(output, "domain.js"))), workerSha256: hash(await readFile(join(output, "image-resize-worker.js"))), nativePackages: [...copied].sort() }, null, 2) + "\n");
}
