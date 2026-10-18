---
description: "Manage owned StudyBuddy AI sources and view truthful native readiness, diagnostics and provider balances."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-studybuddy-account

English | [中文](README.zh.md)

## Summary

Personal-source reads use a separate native queue from long tool operations. Each dispatched source read has a 15-second budget; expiry releases the page without terminating other native work, and late replies keep their original request correlation. Account changes still discard old results.

After authentication, the shared idle queue prepares the profile, saved sources, Models page, first usage pages and read-only recharge data. Settings → Models and My AI → Your models share the account-scoped source controller, editor and save-validation flow. The desktop legacy provider form and default DeepSeek card are no longer registered. Local sources and credentials unblock the list; registrations and readiness enrich it in the background. Startup prepares the source list and directory metadata before the tool center; local rows remain usable while directory metadata loads. The editor reuses only its current account’s unexpired metadata. Source navigation reuses successful presentation reads for 30 seconds and shares pending reads. Manual refresh, source mutations and tool-center navigation request fresh reads; a later read cannot be overwritten by an older one. Scope replacement cancels preparation and clears account data. Native authorization, exact model proofs, price reads and explicit payment actions retain their existing authority.

My AI keeps one row per owned Key and preserves the existing native source operations. Users explicitly choose an exact model and protocol, then save and validate that model once. A configured Key remains separate from a ready built-in source. Source details read cached diagnostics; model diagnostics and provider balance refreshes require explicit actions.

The Models sibling tab opens the original scoped HTTPS guest. Idle preparation loads its directory and prices; opening a card reads owner usage. Tab navigation reuses the prepared guest until the account changes or its login expires. Its cards combine reviewed model introductions and input/output types with current gateway prices and owner usage. Provider logos retain their original colors. Capability ordering uses published Artificial Analysis scores, without inference calls; missing model variants remain unranked. Price ordering compares explicit billing classes and units, while historical amounts remain settlement facts.

The fourth My AI tab, Leaderboards, hosts the existing ranking page through the declared `studybuddy.my-ai.leaderboard` slot. The pages plugin retains its guest, account fences and background preparation. The former Zhilian sidebar entry is removed; same-account community navigation opens this tab through the account-owned `studybuddyMyAi` navigation service.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

The shipped StudyBuddy desktop composition contributes My AI and the single shell balance action. Sources reuse the original ModelProviderList, source editor and source-management operations: rename, deletion, ordering, Key reveal/copy/paste, connectivity, inventories and original-operation recovery. The indicator follows native readiness bound to the current source revision: green for ready, red for failed or missing credentials, amber for pending, and gray for unconfirmed or legacy sources.

V3 discovery checks connectivity and exact manual candidates without inference. The editor has no initial model selection. An explicit save validates only the chosen model, with an output limit of at most 32 tokens and a provider-charge notice. V2 source detection and legacy tool operations retain their existing behavior. A pending save retains its original operation until native confirms it or returns the exact missing-journal result.

Opening source details, signing in and resuming preparation do not call a model or refresh a balance. Diagnostics display actual response identity, visible-text timing and trusted terminal usage; missing values remain unconfirmed. Whole-request output throughput requires actual terminal output counts and a positive measured duration. Provider account balances use authoritative decimal strings and are never added across Keys from the same account.

The shell balance opens the existing recharge dialog. Account total, available and frozen amounts remain exact authoritative money strings. While the client is visible, the account plugin reads its existing summary API every `balanceRefreshIntervalMs` (default 5000, minimum 1000 milliseconds), and when focus or visibility returns. Concurrent reads share one request; account replacement discards the old response. Recharge shows amount selection, payment codes and payment progress without order details. Retained payment tracking and duplicate-payment guards remain active. Personal profile remains the retained, account-isolated HTTPS guest with its approved avatar assets and scoped Harness tokens. The removed profile usage/account-detail sections remain removed.

Once a real WeChat order provides its payment payload, the compact scan view shows the localized WeChat top-up heading, QR code and header close action. An unpaid order offers **Choose another amount**, which cancels that exact order through the existing API. Amount selection becomes available only when the server confirms a terminal state; uncertain or paid orders retain their original tracking. Closing preserves the original order and its background polling; completion still refreshes the authoritative balance. Query failures keep an actionable retry for the same order, and mock orders retain their explicit test presentation. Amount selection, coupons and invitation views remain available before payment-code entry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[The source Controller](src/client/source-controller.ts) rejects stale account, draft and source-revision responses. [The public business adapter](src/client/business-api.ts) exposes fixed methods without login tokens, private grants or admission tickets. Electron Main owns private consumer preparation and exact SDK validation; native owns source, grant, balance and terminal authority. Renderer purpose fields do not confer request trust.

[Source diagnostics](src/client/SourceDiagnostics.tsx) combine cached native facts with Main-observed timings. Source readiness requires the current source revision and original owned operation; configured or discovered facts cannot publish a model. Session selection and explicit default persistence belong to [the model selector](../ui-model-selection/README.md).

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Explicit source diagnostics

#### What the model sees

The user's explicit save or `runNativeBuiltinDiagnostic` action sends only its short prompt to the selected exact source through Main's protected adapter. Account, profile, source inventory and balance views do not add Session context.

#### Token effect

A V3 explicit validation or diagnostic limits generated output to at most 32 tokens and may incur provider charges. Discovery, detail reads and preparation recovery do not send inference requests; displayed usage comes from actual terminal facts.

#### KV Cache effect

Account and source-management views do not alter the durable conversation prefix. Explicit diagnostics are independent requests and do not append their prompts to a conversation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Neutral provider presets are editor choices, not model admission. Only current exact manual authority and actual native validation publish a built-in source. Actual provider and production gateway checks require separate evidence; local component tests use synthetic authorities and intercepted transport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
