// The original routes, SDK and helpers remain one unchanged standalone graph.
// Its .env and Pi singletons are evaluated only after profile admission.
export function loadStandaloneServer() {
  return import("../standalone.ts");
}
