const settings = { id: 'settings', width: 762, height: 500, kind: 'snapshot', load: () => import("./guide-images/photo-settings.js") };
/** Numbered locations correspond to each chapter's three localized explanations. */
export const researchGuideFigures = {
    overview: { id: 'overview', width: 1536, height: 1024, kind: 'diagram', load: () => import("./guide-images/illustration-overview.js"), bottomMarkers: true, points: [{ x: 40, y: 48 }, { x: 40, y: 87 }, { x: 75, y: 94 }] },
    projects: { id: 'files', width: 225, height: 170, kind: 'snapshot', load: () => import("./guide-images/photo-files.js"), points: [{ x: 48, y: 32 }, { x: 44, y: 62 }, { x: 23.5, y: 32 }] },
    conversation: { id: 'conversation', width: 452, height: 105, kind: 'snapshot', load: () => import("./guide-images/photo-conversation.js"), bottomMarkers: true, points: [{ x: 35, y: 39 }, { x: 73, y: 92 }, { x: 5.5, y: 92 }] },
    workflows: { id: 'workflows', width: 536, height: 505, kind: 'snapshot', load: () => import("./guide-images/photo-workflows.js"), points: [{ x: 93, y: 21 }, { x: 40, y: 20 }, { x: 91, y: 44 }] },
    'skills-specialists': { id: 'roles', width: 1536, height: 1024, kind: 'diagram', load: () => import("./guide-images/illustration-roles.js"), bottomMarkers: true, points: [{ x: 11, y: 63 }, { x: 60, y: 36 }, { x: 52, y: 93 }] },
    records: { id: 'records', width: 1536, height: 1024, kind: 'diagram', load: () => import("./guide-images/illustration-records.js"), points: [{ x: 20, y: 87 }, { x: 53, y: 78 }, { x: 84, y: 83 }] },
    services: { id: 'services', width: 536, height: 289, kind: 'snapshot', load: () => import("./guide-images/photo-services.js"), points: [{ x: 9, y: 78 }, { x: 9, y: 91 }, { x: 9, y: 65 }] },
    'settings-billing': { ...settings, points: [{ x: 22, y: 28 }, { x: 22, y: 90 }, { x: 22, y: 53.6 }], detail: { id: 'budget', width: 504, height: 111, kind: 'snapshot', load: () => import("./guide-images/photo-budget.js") } },
    advanced: { ...settings, id: 'advanced-settings', points: [{ x: 18.5, y: 64.6 }, { x: 22, y: 58.6 }, { x: 22, y: 40 }] },
};
//# sourceMappingURL=research-guide-figures.js.map