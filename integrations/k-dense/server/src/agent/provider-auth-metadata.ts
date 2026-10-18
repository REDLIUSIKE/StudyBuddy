import type { Api, Model } from "@earendil-works/pi-ai";
import type { DirectProviderBilling, DirectProviderDefinition } from "./provider-catalog.ts";
/**
 * Pi providers with an OAuth login Kady hosts under Settings → Providers.
 * `openai`, `anthropic`, `xai`, `kimi-coding`, `meta` also take an API key
 * (see `provider-catalog.ts`); `openai-codex`, `github-copilot`, `radius` are
 * OAuth-only in Kady. Pi 0.99 superseded `openai-codex` with Sign in with
 * ChatGPT on the `openai` provider; the legacy login stays so existing tokens
 * and stored `openai-codex/…` refs keep working. `openrouter` is listed so its OAuth login can replace a
 * pasted key, but its models come from the static catalogue, not this route.
 */
export const SUBSCRIPTION_PROVIDER_IDS = [
  "openai",
  "openai-codex",
  "anthropic",
  "github-copilot",
  "xai",
  "kimi-coding",
  "meta",
  "openrouter",
  "radius",
] as const;

export type SubscriptionProviderId = (typeof SUBSCRIPTION_PROVIDER_IDS)[number];
/**
 * `metered_oauth`: per-token extra usage Kady counts as spend. `subscription`:
 * provider-managed plan limits, recorded but not cap-counted. `payg`: the OAuth
 * login only stands in for an API key (OpenRouter, Radius) and bills like one.
 */
export type ProviderBillingMode = "metered_oauth" | "subscription" | "payg";

export interface SubscriptionProviderDefinition {
  id: SubscriptionProviderId;
  name: string;
  accountLabel: string;
  billingMode: ProviderBillingMode;
  billingNote: string;
  /**
   * Whether `/model-providers/models` lists this provider's Pi catalogue once
   * connected. False for OpenRouter, whose picker rows come from
   * `web/src/data/models.json` (and would otherwise appear twice).
   */
  listModels: boolean;
}

export const SUBSCRIPTION_PROVIDERS: readonly SubscriptionProviderDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    accountLabel: "ChatGPT subscription",
    billingMode: "subscription",
    billingNote:
      "Uses provider-managed ChatGPT subscription limits. Kady cannot read remaining quota or overages.",
    listModels: true,
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex (legacy)",
    accountLabel: "ChatGPT Plus/Pro",
    billingMode: "subscription",
    billingNote:
      "Uses provider-managed ChatGPT subscription limits. Kady cannot read remaining quota or overages. Superseded by Sign in with ChatGPT on OpenAI; kept for existing logins.",
    listModels: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    accountLabel: "Claude Pro/Max",
    billingMode: "metered_oauth",
    billingNote:
      "Pi documents third-party Claude subscription use as extra usage billed per token.",
    listModels: true,
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    accountLabel: "GitHub Copilot subscription",
    billingMode: "subscription",
    billingNote:
      "Uses provider-managed Copilot limits. Kady cannot read remaining premium requests or overages.",
    listModels: true,
  },
  {
    id: "xai",
    name: "xAI",
    accountLabel: "SuperGrok or X Premium",
    billingMode: "subscription",
    billingNote:
      "Uses provider-managed xAI subscription limits. Kady cannot read remaining quota or overages.",
    listModels: true,
  },
  {
    id: "kimi-coding",
    name: "Kimi For Coding",
    accountLabel: "Kimi Code subscription",
    billingMode: "subscription",
    billingNote:
      "Uses provider-managed Kimi Code plan limits. Kady cannot read remaining quota or overages.",
    listModels: true,
  },
  {
    id: "meta",
    name: "Meta",
    accountLabel: "Meta (Muse subscription)",
    billingMode: "subscription",
    billingNote:
      "Uses provider-managed Muse subscription limits. Kady cannot read remaining quota or overages.",
    listModels: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    accountLabel: "OpenRouter account (OAuth)",
    billingMode: "payg",
    billingNote:
      "Signing in creates a user-controlled key billed from your OpenRouter credits — an alternative to pasting an API key. Usage is metered and counts toward the project cap exactly like a key.",
    listModels: false,
  },
  {
    id: "radius",
    name: "Radius",
    accountLabel: "Radius gateway account",
    billingMode: "payg",
    billingNote:
      "Radius is a dynamic model gateway; its model list is fetched after sign-in. Pi prices what the gateway reports, and Kady counts it toward the project cap.",
    listModels: true,
  },
] as const;

const PROVIDER_BY_ID = new Map(
  SUBSCRIPTION_PROVIDERS.map((provider) => [provider.id, provider] as const),
);

export function isSubscriptionProvider(value: string): value is SubscriptionProviderId {
  return PROVIDER_BY_ID.has(value as SubscriptionProviderId);
}

export function subscriptionProvider(
  providerId: string,
): SubscriptionProviderDefinition | undefined {
  return PROVIDER_BY_ID.get(providerId as SubscriptionProviderId);
}


export function tierFor(model: Model<Api>): "budget" | "mid" | "high" | "flagship" {
  if (model.cost.output >= 20) return "flagship";
  if (model.cost.output >= 10) return "high";
  if (model.cost.output >= 3) return "mid";
  return "budget";
}

export interface ClientProviderModel {
  id: string;
  label: string;
  provider: string;
  sourceId: SubscriptionProviderId;
  sourceLabel: string;
  tier: "budget" | "mid" | "high" | "flagship";
  context_length: number;
  pricing: { prompt: number; completion: number };
  modality: string;
  description: string;
  reasoning: boolean;
  billingMode: ProviderBillingMode;
  available: true;
}

export function modelForClient(
  model: Model<Api>,
  definition: SubscriptionProviderDefinition,
): ClientProviderModel {
  return {
    id: `${definition.id}/${model.id}`,
    label: model.name,
    provider: definition.name,
    sourceId: definition.id,
    sourceLabel: definition.accountLabel,
    tier: tierFor(model),
    context_length: model.contextWindow,
    pricing: {
      prompt: model.cost.input,
      completion: model.cost.output,
    },
    modality: model.input.includes("image") ? "text+image->text" : "text->text",
    description: `${definition.name} via ${definition.accountLabel}`,
    reasoning: model.reasoning,
    billingMode: definition.billingMode,
    available: true,
  };
}

export interface ClientDirectModel
  extends Omit<ClientProviderModel, "sourceId" | "billingMode"> {
  sourceId: string;
  billingMode: DirectProviderBilling;
}

/**
 * Picker row for a model reached with a direct API key (`provider-catalog.ts`).
 * These providers are deliberately NOT OAuth flows: the key is an env var
 * managed by /credentials. `billingMode` mirrors `billingForProvider` so the
 * picker's cap hint agrees with the ledger — `subscription` for credit/plan
 * providers such as NVIDIA NIM, `payg` for everything Pi prices per token.
 */
export function directModelForClient(
  model: Model<Api>,
  definition: DirectProviderDefinition,
): ClientDirectModel {
  return {
    id: `${definition.id}/${model.id}`,
    label: model.name,
    provider: definition.name,
    sourceId: definition.id,
    sourceLabel: definition.sectionLabel,
    tier: tierFor(model),
    context_length: model.contextWindow,
    pricing: {
      prompt: model.cost.input,
      completion: model.cost.output,
    },
    modality: model.input.includes("image") ? "text+image->text" : "text->text",
    description: definition.description,
    reasoning: model.reasoning,
    billingMode: definition.billingMode,
    available: true,
  };
}
