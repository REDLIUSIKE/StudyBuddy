---
description: "Route native-owned exact StudyBuddy model grants into trusted Harness conversations."
kind: "package-library"
---

# @deepseek-ai/dsh-llm-studybuddy-builtin

English | [中文](README.zh.md)

## Summary

StudyBuddy conversations can use the exact model a user has explicitly validated with an owned Key. Pending sources stay configured without becoming selectable. Each Key retains its own source, credential, connection and funding identity. This private library requires native admission and durable conversation audit; it reads no ambient credentials and chooses no default model.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Desktop Host composes this library through its private Main control. It has no profile install command. [The entry module](src/index.ts) exports the catalog owner and exact SDK converter; [the Host composition](../../../apps/desktop-host/src/studybuddy-builtin-models.ts) supplies the real account and Host generations, trusted initiator, native receipt and durable audit sink.

Run `pnpm exec vitest run apps/desktop-host/tests/studybuddy-builtin-models.spec.ts apps/desktop-host/tests/studybuddy-builtin-wire.spec.ts apps/desktop-host/tests/studybuddy-builtin-control.spec.ts` from the workspace. These tests use the real registry, three SDK protocol converters, AgentRegistry and Session persistence while intercepting all network requests.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[The directory](src/studybuddy-builtin-models.ts) installs each source atomically, returns its actual keyless readback and publishes only native-confirmed exact models. A failed candidate retains the previous installed snapshot. Revoke closes future admission; account and Host generations reject older material. Request preparation and direct streams enforce the same exact membership.

Conversation dispatch requires the Agent-loop marker, a current real initiator and Session, native frozen admission, and a flushed keyless audit event before transport. Caller-supplied purpose grants no authority. Protected Main validation can access an installed pending source without publishing it. [The wire converter](src/studybuddy-builtin-wire.ts) uses the granted protocol, endpoint and credential and rejects redirects. DeepSeek Chat sends `max_tokens`; Kimi Chat sends `max_completion_tokens`. Both omit unsupported store and reasoning configuration and preserve provider reasoning history, using native provider authority even behind a private gateway. Provider reasoning and sampling defaults remain unconfigured because the grant has no exact option authority. [The terminal observer](src/studybuddy-builtin-terminal.ts) records bounded raw provider facts; normalized SDK zeros do not create usage authority.

Gateway and local direct dispatch require a null request receipt in the exact frozen admission. Gateway requests send the reusable Key, request UUID and purpose. Historical status receipts remain readable and never authorize another dispatch.

[The platform directory](src/studybuddy-platform-models.ts) separately registers `studybuddy-platform` from a leased, manually reviewed Harness Chat catalog. It retains the existing native v2 platform wallet and activation authority. Main owns protected issuance recovery and verifies the exact active account/device/model tuple before dispatch. Platform and personal Key catalogs keep separate revisions. Unknown issuance outcomes retain their nonce; a confirmed cancelled intent or revoked stale binding can be replaced. SDK terminal errors retain their original classification. Client function definitions are forwarded to the exact CNY gateway; server-priced search/audio/tool add-ons remain excluded. Models without verified function calling receive text-only requests.

Refreshing the platform directory preserves an already admitted request's frozen model and usage facts. Prepared calls using a superseded catalog require fresh admission. Account revocation or Host replacement still fences every chunk of an earlier request.

Reviewed `image_in` capabilities govern both advertised modalities and the actual Pi request profile. Image-capable routes send locally verified attachments as standard image content blocks. Text routes retain text-only native capabilities. `imageToolModels()` exposes only current exact vision route identities for explicit image-tool delegation; it grants no credential or inference authority.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [LLM adapter registry](../llm/README.md)
- [SDK protocol conversion](../llm-pi-ai/README.md)
- [Private consumer upgrade](../../../docs/upgrade-guide/v0.2.1-alpha.2/studybuddy-builtin-consumer/guide.md)
- [Required request audit event](../../../docs/persistence-changes/2026-10-11-studybuddy-builtin-request.md)

-----

<a id="model-experience"></a>
## Model Experience

### Exact conversation requests

#### What the model sees

The granted exact model receives `GenerateOptions.messages`, attachments and permitted tools through the selected protocol converter. Private catalog, credential and admission metadata add no prompt text.

#### Token effect

Ordinary conversation inputs and generated outputs determine token use. Conversation and platform streams publish usage only from complete raw terminal aggregate counts, including explicit zero values; missing or inconsistent counts remain absent. Cache counts are disjoint from uncached input, and reasoning is a subset of output. Explicit validation sends the user's short prompt with an output limit of at most 32 tokens; missing raw terminal counts remain unknown.

#### KV Cache effect

Private routing and audit metadata do not change the rendered conversation prefix. A different source, model or protocol uses its own provider cache behavior.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Auxiliary title and compaction calls have no trusted built-in admission. Caller-selected reasoning or sampling options require additional exact authority and currently fail closed. Platform admission covers reviewed Chat and native image input; other modalities and separately charged provider tools require additional transport evidence. Actual provider and production gateway validation require separate native evidence; local tests use synthetic authorities and intercepted transport. Showing a model in the directory does not prove a live paid conversation with every model.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
