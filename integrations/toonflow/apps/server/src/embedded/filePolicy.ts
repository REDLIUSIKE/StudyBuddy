import { lstat, readFile } from "@toonflow/file";
import { relative, resolve } from "node:path";
import { isWithin, resolveWorkspacePath } from "@/utils/workspace/files";
import { listConnections } from "@/utils/mcp/control";
import type { AgentFileCoordinator } from "@/agent/tools";

/** Every installed tool receives the same domain file coordinator. */
export function fileCoordinator(directory: string): AgentFileCoordinator {
  return { async beforeWrite(paths, content, kind) {
    for (const target of paths) {
      const admitted = await resolveWorkspacePath(directory, relative(directory, target), true);
      if (kind === "mkdir") continue;
      const binding = resolve(directory, ".studybuddy-native.json");
      if (isWithin(admitted.path, binding)) throw new Error("AIGC_BINDING_WRITE_DENIED");
      for (const { state } of listConnections()) {
        if (state.directory !== directory) continue;
        const document = state.document;
        const selection = document && typeof document === "object" && "selection" in document ? document.selection : undefined;
        const locations = [state.canvasId];
        const resources = document && typeof document === "object" && "openResources" in document && Array.isArray(document.openResources) ? document.openResources : [];
        for (const resource of resources) {
          if (!resource || typeof resource !== "object") continue;
          if ("filePath" in resource && typeof resource.filePath === "string") locations.push(resource.filePath);
          if ("canvasPath" in resource && typeof resource.canvasPath === "string") locations.push(resource.canvasPath);
        }
        if (selection && typeof selection === "object") {
          if ("filePath" in selection && typeof selection.filePath === "string") locations.push(selection.filePath);
          if ("canvasPath" in selection && typeof selection.canvasPath === "string") locations.push(selection.canvasPath);
        }
        for (const location of locations) {
          if (!location) continue;
          const opened = await resolveWorkspacePath(directory, relative(directory, resolve(directory, location)), true);
          if (isWithin(admitted.path, opened.path)) throw new Error("AIGC_OPEN_FILE_REQUIRES_EDITOR_CONTROL");
        }
      }
      if (!/\.json$/i.test(target)) continue;
      const containsCanvas = (value: string | Uint8Array) => /"toonflowCanvas"\s*:\s*true\b/.test(typeof value === "string" ? value : new TextDecoder().decode(value));
      if (content !== undefined && containsCanvas(content)) throw new Error("AIGC_CANVAS_WRITE_REQUIRES_CONTROL");
      const info = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return undefined; });
      if (info?.isFile() && containsCanvas(await readFile(target))) throw new Error("AIGC_CANVAS_WRITE_REQUIRES_CONTROL");
    }
  } };
}
