export type EmbeddedRoute =
  | { kind: "workspace" }
  | { kind: "office"; path: string; projectId: string }
  | { kind: "invalid-office" }
  | { kind: "not-found" };

/** Only the existing two embedded pages are application routes. */
export function embeddedRoute(location: Pick<Location, "pathname" | "search">): EmbeddedRoute {
  if (location.pathname === "/") return { kind: "workspace" };
  if (location.pathname !== "/office") return { kind: "not-found" };
  const query = new URLSearchParams(location.search);
  const paths = query.getAll("path"), projects = query.getAll("project");
  // Next's searchParams rejected repeated parameters (arrays); retain that
  // behavior. Project membership and sandbox paths remain API-owned checks.
  if (paths.length !== 1 || projects.length !== 1 || !paths[0] || !projects[0] || !/\.(docx|pptx|xlsx)$/i.test(paths[0])) {
    return { kind: "invalid-office" };
  }
  return { kind: "office", path: paths[0], projectId: projects[0] };
}
