import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("@studybuddy/contracts runtime package", () => {
  it("can be imported by plain Node.js without a TypeScript loader", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          'import("@studybuddy/contracts")',
          ".then((contracts) => {",
          '  process.stdout.write(typeof contracts.parseDeviceMutationRequest);',
          "})",
        ].join("\n"),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("function");
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(result.stderr).not.toContain("ERR_UNKNOWN_FILE_EXTENSION");
  });
});
