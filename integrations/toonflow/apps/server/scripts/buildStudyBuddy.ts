import { $ } from "bun";
import { cp, lstat, mkdir, readdir, realpath, rm } from "@toonflow/file";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { captureBuildInput, completeBuild } from "./studyBuddyBuildIdentity";
import generateRouter from "../src/core";
import buildNodeDomain from "./buildNodeDomain";

const projectDirectory = await realpath(resolve(import.meta.dirname, "../../.."));
await generateRouter();
const buildInput = await captureBuildInput(projectDirectory);
for (const name of ["build", "build/nodes", "build/tools", "build/ext", "build/skills", "build/providers", "build/server", "build/web", "build/node_modules", "build/mcp", "build/bin", "build/notices"]) {
  const path = resolve(projectDirectory, name);
  const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
  if (stat?.isSymbolicLink()) throw new Error("AIGC_BUILD_PATH_DENIED");
  if (stat) {
    const offset = relative(projectDirectory, await realpath(path));
    if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) throw new Error("AIGC_BUILD_PATH_DENIED");
  }
}
// Clear only the verified build tree; the native runtime owns the application process.
await rm(resolve(projectDirectory, "build"), { recursive: true, force: true });
const environment = { ...process.env, VITE_STUDYBUDDY_EMBEDDED: "1", VITE_STUDYBUDDY_NATIVE_AIGC: "1", NODE_ENV: "production" };
for (const group of ["nodes", "tools", "ext"]) {
  const directory = resolve(projectDirectory, "packages", group);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    await $`${process.execPath} run build`.cwd(resolve(directory, entry.name)).env(environment);
  }
}
await $`${process.execPath} run build`.cwd(resolve(projectDirectory, "apps/web")).env(environment);
await cp(resolve(projectDirectory, "packages/skills"), resolve(projectDirectory, "build/skills"), { recursive: true });
await mkdir(resolve(projectDirectory, "build/notices"), { recursive: true });
await cp(resolve(projectDirectory, "LICENSE"), resolve(projectDirectory, "build/notices/toonflowLicense.txt"));
await buildNodeDomain(projectDirectory);
await completeBuild(projectDirectory, buildInput);
