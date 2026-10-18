// Pure file-format adapter from MIT-licensed Pi 1.0.0. See pinned-sources.json.
import { parse } from "yaml";
const stripBom = value => value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
const normalizeNewlines = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const extractFrontmatter = (content) => {
    const normalized = normalizeNewlines(stripBom(content));
    if (!normalized.startsWith("---")) {
        return { yamlString: null, body: normalized };
    }
    const endIndex = normalized.indexOf("\n---", 3);
    if (endIndex === -1) {
        return { yamlString: null, body: normalized };
    }
    return {
        yamlString: normalized.slice(4, endIndex),
        body: normalized.slice(endIndex + 4).trim(),
    };
};
export const parseFrontmatter = (content) => {
    const { yamlString, body } = extractFrontmatter(content);
    if (!yamlString) {
        return { frontmatter: {}, body };
    }
    const parsed = parse(yamlString);
    return { frontmatter: (parsed ?? {}), body };
};
export const stripFrontmatter = (content) => parseFrontmatter(content).body;
