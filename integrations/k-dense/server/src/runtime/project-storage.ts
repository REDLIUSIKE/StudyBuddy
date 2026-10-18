/** Managed storage keeps the original layout under one explicitly admitted account root. */
import fs from "node:fs";
import path from "node:path";
import { PROJECTS_ROOT } from "../config.ts";
import * as projects from "../projects.ts";

/** Refuse Windows junctions and symlinks in an existing path or ancestor. */
export function assertResearchPath(value: string): void {
  let current = path.resolve(value);
  for (;;) {
    let info: fs.Stats | undefined;
    try { info = fs.lstatSync(current); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (info?.isSymbolicLink()) throw Object.assign(Error("RESEARCH_PATH_DENIED"), { statusCode: 403 });
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

/** All registry access is scoped to this process's original admitted account root. */
export class EmbeddedProjectStorage {
  constructor(readonly root: string) {
    if (!path.isAbsolute(root) || path.resolve(root) !== PROJECTS_ROOT) throw Error("RESEARCH_PROJECT_ROOT_MISMATCH");
    assertResearchPath(root);
    fs.mkdirSync(root, { recursive: true });
  }
  requireId(value: unknown): string {
    if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) || ["new", "index", "archive"].includes(value))
      throw Object.assign(Error("RESEARCH_PROJECT_INVALID"), { statusCode: 403 });
    assertResearchPath(path.join(this.root, value));
    if (!projects.getProject(value)) throw Object.assign(Error("RESEARCH_PROJECT_NOT_FOUND"), { statusCode: 404 });
    return value;
  }
  list() {
    assertResearchPath(path.join(this.root, "index.json"));
    for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Object.assign(Error("RESEARCH_PATH_DENIED"), { statusCode: 403 });
      if (entry.isDirectory()) assertResearchPath(path.join(this.root, entry.name, "project.json"));
    }
    return projects.listProjects();
  }
  get(id: string) { this.requireId(id); return projects.getProject(id)!; }
  create(input: Parameters<typeof projects.createProject>[0]) {
    this.list();
    if (input.projectId) {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.projectId)) throw Error("RESEARCH_PROJECT_INVALID");
      assertResearchPath(path.join(this.root, input.projectId));
    }
    return projects.createProject(input);
  }
  update(id: string, patch: Parameters<typeof projects.updateProject>[1]) {
    this.requireId(id); return projects.updateProject(id, patch);
  }
  delete(id: string) { this.requireId(id); return projects.deleteProject(id); }
}
