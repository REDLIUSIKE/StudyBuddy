import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";
import { lstat, readFile, readdir, writeAtomic } from "@toonflow/file";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export async function captureBuildInput(directory: string) {
  const names = execFileSync("git", ["-C", directory, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", windowsHide: true }).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const name of names) {
    const path = join(directory, name);
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (!info) continue;
    if (!info.isFile()) throw new Error("AIGC_BUILD_PATH_DENIED");
    hash.update(name.split(sep).join("/")).update("\0").update(await readFile(path)).update("\0");
  }
  return { schemaVersion: 1, sourceDigest: hash.digest("hex"), lockDigest: digest(await readFile(join(directory, "bun.lock"))),
    bunVersion: Bun.version, bunSha256: digest(await readFile(process.execPath)), platform: process.platform, arch: process.arch };
}
export async function completeBuild(directory: string, input: Awaited<ReturnType<typeof captureBuildInput>>) {
  if (JSON.stringify(await captureBuildInput(directory)) !== JSON.stringify(input)) throw new Error("AIGC_BUILD_INPUT_CHANGED");
  const walk = async (prefix = ""): Promise<{ path: string; size: number; sha256: string }[]> => {
    const rows: { path: string; size: number; sha256: string }[] = [];
    for (const entry of await readdir(join(directory, "build", prefix), { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (path === "studyBuddyBuild.json") continue;
      if (entry.isDirectory()) rows.push(...await walk(path + "/"));
      else if (entry.isFile()) { const bytes = await readFile(join(directory, "build", path)); rows.push({ path, size: bytes.length, sha256: digest(bytes) }); }
      else throw new Error("AIGC_BUILD_PATH_DENIED");
    }
    return rows.sort((a, b) => a.path.localeCompare(b.path));
  };
  await writeAtomic(join(directory, "build/studyBuddyBuild.json"), JSON.stringify({ ...input, files: await walk() }, null, 2) + "\n");
}
