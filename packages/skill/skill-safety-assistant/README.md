---
description: "Dispatch closed skill safety requests to an owned native provider and read session guidance without starting a model turn. Use this reference when composing or testing StudyBuddy skill checks."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-safety-assistant

English | [中文](README.zh.md)

## Summary

Consumers can send find, scan and install requests to one composed local provider. They can read session guidance without starting a model turn. An unavailable or revoked provider returns a structured failure instead of a fabricated result. This package does not download, scan, or install skills by itself.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

Compose the default service export and register an owned provider before sending requests. The [service tests](tests/service.spec.ts) exercise this path with native Session references and reversible Cordis registrations.

The service forwards the actual calling Agent, actor and cancellation signal. The provider validates the live root; tool arguments cannot substitute an account or Agent identity. Request, job, candidate, artifact, intent, report and operation IDs are distinct branded values; [types.ts](src/types.ts) owns their definitions and keyless results. The receiving client owns localized failure text.

The service has no configuration fields. Provider unload removes the registration, cancels its calls, and waits for pending execution to settle. A late result cannot become success after unload. Presentation is read-only and does not authorize an action.

The `./tools` preset entry supplies four native operations and retains native clarification. Its scoped prompt-assembly filter exposes only these five tools to the model; a preset-level empty restriction would also hide the preset's own contributions from its descendants. A monotonic preset guard rejects other executions independently of schema presentation. Ordinary chats outside this preset are unchanged.

-----

<a id="understand-the-implementation"></a>

## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service captures one provider registration for each call. It combines caller cancellation with that registration's lifetime and checks the registration again after the asynchronous result. The provider owns live-root and account admission; filesystem and scanner operations do not belong in the service definition. The desktop [journal](../../../apps/desktop/src/studybuddy/skill-safety-journal.ts) retains immutable effect receipts separately from the native conversation log. Uncertain effects cannot be replayed from a pending record; the journal does not track conversational stages or questions.

The desktop [Main owner](../../../apps/desktop/src/studybuddy/skill-safety-main.ts) serializes native source reads and uses the current private account credential before each operation. Credential refresh replaces the old pipe without changing account admission. Pipe failure remains visible; only a later explicit request starts a replacement, without replaying the failed operation. Revocation awaits queued reads and pipe exit.

</details>

-----

<a id="further-exploration"></a>

## Further Exploration

- [Architecture](../../../docs/architecture.md) — plugin composition and capability roles.
- [Skills](../../../docs/subsystems/skills.md) — active skill discovery and loading.
- [Native questions](../../interaction/tool-ask-user/README.md) — ordinary human answers, not model-generated authorization.

-----

<a id="model-experience"></a>

## Model Experience

### No direct model context

#### What the model sees

Neither `execute()` nor `presentation()` registers a model tool or prompt text. A consumer owns any rendering of returned records and must retain model-visible inputs and results in the native session log.

#### Token effect

The service itself adds no request tokens and makes no inference request. Provider and consumer operations own any model usage.

#### KV Cache effect

The service does not rewrite model history or a prompt prefix. Changes to a consumer's rendered records remain that consumer's context responsibility.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The service requires a private native provider; it is not an installation permission source.

- Missing or revoked providers reject calls with a stable failure code. There is no alternate provider or model fallback.
- A scanner verdict, installation decision, and filesystem receipt must come from their owning executors. A model-written agreement is not a trusted human decision.
- This package's contract and tests do not qualify a scanner release, live model route, Windows resource bundle, or complete Labs workflow.

<a id="dev-note"></a>

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
