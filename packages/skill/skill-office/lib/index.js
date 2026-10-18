import { readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { isSea } from "node:sea";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import { parse } from "yaml";
//#region lib/types/index.js
/** Bundled Office workflows and filesystem resources for document authoring and checks. */
const SKILL_NAMES = [
	"office-docx",
	"office-pptx",
	"office-xlsx"
];
/** Validated resource configuration. */
const Config = z.object({
	assetRoot: z.string().min(1),
	node: z.string().min(1),
	cli: z.union([z.string().min(1), z.const(false)])
});
/** Cordis plugin identity. */
const name = "skill-office";
/** Registry used by the bundled provider. */
const inject = ["skills"];
function parseSkill(raw, path) {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
	if (frontmatter?.[1] === void 0) throw new Error(`skill-office: ${path} has no YAML frontmatter`);
	const metadata = parse(frontmatter[1]);
	const description = typeof metadata === "object" && metadata !== null && "description" in metadata ? metadata.description : void 0;
	if (typeof description !== "string" || description.length === 0) throw new Error(`skill-office: ${path} has no description`);
	return {
		description,
		content: raw.slice(frontmatter[0].length).trim()
	};
}
function officeRuntime(config) {
	if (config.cli === false) return "\n\nLibreOffice Kit is disabled in this deployment.";
	if (config.node === void 0 && (isSea() || process.versions.electron !== void 0)) throw new Error("skill-office: packaged applications must supply a standalone Node executable");
	const node = config.node ?? process.execPath;
	let cli = config.cli;
	if (cli === void 0) cli = join(dirname(fileURLToPath(import.meta.resolve("@deepseek-ai/libreoffice-kit/package.json"))), "lib", "cli.js");
	for (const path of [node, cli]) if (!isAbsolute(path) || !statSync(path).isFile()) throw new Error(`skill-office: expected an absolute executable file: ${path}`);
	return `\n\n## Installed LibreOffice Kit\n\nUse these absolute paths for every LibreOffice Kit command. Pass the CLI entry as the first argument to Node.\n\n${JSON.stringify({ libreofficeKit: {
		node,
		cli
	} }, void 0, 2)}`;
}
/**
* Register Office skills with resources readable by the script interpreter.
* @param ctx - Context carrying the skill registry.
* @param config - Optional external assets directory for packaged applications.
*/
function apply(ctx, config = {}) {
	const assetRoot = config.assetRoot ?? fileURLToPath(new URL("../assets/", import.meta.url));
	if (!isAbsolute(assetRoot)) throw new Error("skill-office: assetRoot must be an absolute directory");
	if (!statSync(join(assetRoot, "scripts", "check_office.py")).isFile()) throw new Error("skill-office: assets must contain scripts/check_office.py");
	const runtime = officeRuntime(config);
	const candidates = SKILL_NAMES.map((skillName) => {
		const directory = join(assetRoot, skillName);
		const path = join(directory, "SKILL.md");
		const { description } = parseSkill(readFileSync(path, "utf8"), path);
		return {
			name: skillName,
			description,
			invocation: {
				modelInvocable: true,
				userInvocable: true
			},
			provider: "dsh-office",
			source: "bundled",
			rank: BUNDLED_SKILL_RANK,
			resourceBase: {
				kind: "directory",
				path: directory
			},
			locator: path
		};
	});
	const provider = {
		name: "dsh-office",
		list: () => Promise.resolve(candidates),
		async get(candidate, options) {
			const { rank: _rank, locator, ...summary } = candidate;
			const raw = await readFile(locator, {
				encoding: "utf8",
				signal: options.signal
			});
			return {
				...summary,
				content: parseSkill(raw, locator).content + runtime
			};
		}
	};
	ctx.skills.registerProvider(() => provider);
}
//#endregion
export { Config, apply, inject, name };
