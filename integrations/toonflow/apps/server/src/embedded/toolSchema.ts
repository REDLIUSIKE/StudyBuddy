import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { createHash } from "node:crypto";

const options = { strict: false, strictSchema: true, allErrors: true, ownProperties: true, addUsedSchema: false, allowUnionTypes: true };
const legacy = new Ajv(options), modern = new Ajv2020(options);
addFormats(legacy); addFormats(modern);
const validators = new Map<string, ValidateFunction>();

/** Raw schemas stay authoritative; no JSON Schema keyword is dropped for native tool presentation. */
export function toolSchema(value: unknown): { sha256: string; validate(input: unknown): void } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Reflect.get(value, "type") !== "object") throw new Error("AIGC_PLUGIN_SCHEMA_INVALID");
  const source = JSON.stringify(value), sha256 = createHash("sha256").update(source).digest("hex");
  let validator = validators.get(sha256);
  if (!validator) {
    const dialect: unknown = Reflect.get(value, "$schema");
    const compiler = dialect === undefined || dialect === "http://json-schema.org/draft-07/schema#" || dialect === "https://json-schema.org/draft-07/schema#" ? legacy
      : dialect === "https://json-schema.org/draft/2020-12/schema" ? modern : undefined;
    if (!compiler) throw new Error("AIGC_PLUGIN_SCHEMA_DIALECT_UNSUPPORTED");
    validator = compiler.compile(JSON.parse(source)); validators.set(sha256, validator);
  }
  const validate = validator;
  return { sha256, validate(input) { if (!validate(input)) throw new Error("AIGC_TOOL_ARGUMENTS_INVALID"); } };
}
