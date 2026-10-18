import { lstat, mkdir, readFile, writeAtomic } from "@toonflow/file";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { denyLinks } from "@/utils/studyBuddy/policy";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.strictObject({ schemaVersion: z.literal(1), candidate: digest, baselines: z.array(digest), files: z.array(z.strictObject({
  path: z.string().regex(/^(?:nodes\/[a-z][a-zA-Z0-9]*\.umd\.js|tools\/[a-z][a-zA-Z0-9]*\.tool\.js)$/), size: z.number().int().nonnegative(), sha256: digest, acceptedSha256: z.array(digest).min(1),
})) });
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
async function optional(path: string) {
  await denyLinks(path);
  const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  if (!stat) return;
  if (!stat.isFile()) throw new Error("AIGC_BUNDLED_MIGRATION_CONFLICT");
  return readFile(path);
}
/** Update only reviewed bundled bytes. Local plugin edits and extra plugins remain untouched. */
export async function migrateBundledPlugins(dataDirectory: string, resourceDirectory: string) {
  const proof = schema.parse(JSON.parse(await readFile(join(resourceDirectory, "build/bundledMigration.json"), "utf8")));
  if (sha(JSON.stringify(proof.files)) !== proof.candidate || new Set(proof.files.map(row => row.path.toLowerCase())).size !== proof.files.length) throw new Error("AIGC_BUNDLED_MIGRATION_INVALID");
  const changes = [];
  // Complete preflight before the first write or backup. Unknown local versions block activation.
  for (const row of proof.files) {
    const source = await optional(join(resourceDirectory, row.path));
    if (!source || source.length !== row.size || sha(source) !== row.sha256) throw new Error("AIGC_BUNDLED_MIGRATION_INVALID");
    const current = await optional(join(dataDirectory, row.path));
    if (!current || sha(current) === row.sha256) continue;
    if (!row.acceptedSha256.includes(sha(current))) throw new Error("AIGC_BUNDLED_MIGRATION_CONFLICT");
    changes.push({ row, source, current });
  }
  if (!changes.length) return;
  const backup = join(dataDirectory, ".nativeMigration", proof.candidate);
  await denyLinks(backup); await mkdir(backup, { recursive: true });
  for (const { row, current } of changes) {
    const path = join(backup, row.path), saved = await optional(path);
    if (saved && sha(saved) !== sha(current)) throw new Error("AIGC_BUNDLED_BACKUP_CONFLICT");
    if (!saved) { await mkdir(join(path, ".."), { recursive: true }); await writeAtomic(path, current, { exclusive: true }); }
  }
  for (const { row, source, current } of changes) {
    const path = join(dataDirectory, row.path), latest = await optional(path);
    if (!latest || sha(latest) !== sha(current)) throw new Error("AIGC_BUNDLED_MIGRATION_CONFLICT");
    await writeAtomic(path, source);
  }
  await writeAtomic(join(backup, "receipt.json"), JSON.stringify({ schemaVersion: 1, candidate: proof.candidate, files: changes.map(({ row, current }) => ({ path: row.path, previousSha256: sha(current), sha256: row.sha256 })) }, null, 2) + "\n");
}
