import messages from "@/data/research-messages.zh-CN.json";
import workflowMessages from "@/data/workflows.zh-CN.json";
import errorMessages from "@/data/research-errors.zh-CN.json";
import workflowExamples from "@/data/workflow-examples.zh-CN.json";
import { runtimeProfile } from "./runtime-profile";

/** Translate only authored interface copy, never model IDs, paths, logs or user content. */
export function researchText(source: string, values: readonly unknown[] = []): string {
  const text = runtimeProfile() === "studybuddy"
    ? (messages as Record<string, string>)[source] ?? source
    : source;
  const entities: Record<string, string> = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", nbsp: "\u00a0", mdash: "—", ndash: "–", hellip: "…" };
  const decoded = text.replace(/&([a-z]+);/g, (token, key: string) => entities[key] ?? token)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (token, code: string) => {
      const value = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return value <= 0x10ffff ? String.fromCodePoint(value) : token;
    });
  return decoded.replace(/\{(\d+)\}/g, (token, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : token,
  );
}

const errorPatterns = Object.entries(errorMessages).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translation]) => {
  const indices: number[] = [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\\\{(\d+)\\\}/g, (_token, index: string) => { indices.push(Number(index)); return "([\\s\\S]*?)"; });
  return { regex: new RegExp(`^${pattern}$`), indices, translation };
});

/** Local interface failures only. Execution logs and unknown external diagnostics stay verbatim. */
export function researchError(value: unknown): string {
  const original = value instanceof Error ? value.message : String(value ?? "");
  if (runtimeProfile() !== "studybuddy" || !original) return original;
  const source = original.startsWith("Error: ") ? original.slice(7) : original;
  const exact = (errorMessages as Record<string, string>)[source];
  if (exact) return /^[A-Z][A-Z0-9_]+$/.test(source) ? `${exact}（${source}）` : exact;
  for (const entry of errorPatterns) {
    const match = entry.regex.exec(source);
    if (match) {
      const values: string[] = [];
      entry.indices.forEach((index, position) => { values[index] = match[position + 1]; });
      return entry.translation.replace(/\{(\d+)\}/g, (token, index: string) => values[Number(index)] ?? token);
    }
  }
  return researchText(source) !== source ? researchText(source) : original;
}

export function researchLocale(): string | undefined {
  return runtimeProfile() === "studybuddy" ? "zh-CN" : undefined;
}

/** Only built-in role labels are interface copy; specialist names remain verbatim. */
export function researchRoleLabel(role: string): string {
  if (role === "agent") return researchText("Kady (lead)");
  if (role === "you") return researchText("You");
  return role;
}

export function workflowCopy(workflow: { id: string; name: string; description: string }) {
  if (runtimeProfile() !== "studybuddy") return workflow;
  const translated = (workflowMessages as Record<string, { name: string; description: string }>)[workflow.id];
  return translated ?? workflow;
}

/** Placeholder labels are presentation only; parameter keys and original prompts are retained. */
export function workflowFieldLabel(label: string): string {
  if (runtimeProfile() !== "studybuddy") return label;
  const direct = researchText(label);
  if (direct !== label) return direct;
  const start = label.indexOf(" (");
  if (start < 0) return researchText(label);
  const name = label.slice(0, start) === "System" ? "系统" : researchText(label.slice(0, start));
  const originalExample = label.slice(start + 2, label.endsWith(")") ? -1 : undefined);
  const example = ((workflowExamples as Record<string, string>)[originalExample] ?? originalExample)
    .replace(/\boptional\b/g, "可选")
    .replace(/\be\.g\.,?/g, "例如")
    .replace(/\bdefault:\s*/g, "默认：")
    .replace(/\betc\./g, "等");
  return `${name}（${researchText(example)}）`;
}
