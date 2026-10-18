const guards = new WeakMap();
export function installResearchBudgetGuard(ctx, guard) { if (guards.has(ctx))
    throw Error('HARNESS_RESEARCH_BUDGET_ALREADY_INSTALLED'); guards.set(ctx, guard); return () => { if (guards.get(ctx) === guard)
    guards.delete(ctx); }; }
export async function assertResearchModelBudget(ctx, request) { await guards.get(ctx)?.(request); }
//# sourceMappingURL=research-budget-guard.js.map