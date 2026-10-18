/** Default DeepSeek model catalog. */
import { DEFAULT_CONTEXT_WINDOW } from "./defaults.js";
/** Advisory official model entries; deployments may replace the catalog. */
export const DEFAULT_MODELS = [
    {
        id: 'deepseek-flash',
        name: 'DeepSeek-V4.1-Flash',
        contextWindow: DEFAULT_CONTEXT_WINDOW,
        inputModalities: ['text', 'image'],
        systemPromptUpdate: 'in-history',
        toolUpdate: 'addition-only',
    },
    {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek-V4-Pro',
        description: 'Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.',
        contextWindow: DEFAULT_CONTEXT_WINDOW,
    },
];
//# sourceMappingURL=models.js.map