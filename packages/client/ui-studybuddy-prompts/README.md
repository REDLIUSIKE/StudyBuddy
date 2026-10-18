---
description: "Save private prompts, copy their complete text and explicitly publish saved versions to the prompt square."
kind: "package-reference"
---

# StudyBuddy prompt manager

English | [中文](README.zh.md)

## Summary

Users can save reusable prompts, copy their complete text and explicitly publish saved versions to the prompt square. The independent right panel keeps the current main page visible.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

The [web-app composition](../../bundle/web-app/cordis.patch.yml) mounts the client plugin without configuration fields. The toolbar entry opens My prompts or Prompt square; card actions edit private records or publish the saved version. Failed copies never show success feedback.

## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This plugin contributes the global header utility and the account-scoped right-panel library. Clicking a card copies its full plain-text body; editing updates private records and uploading explicitly freezes the saved revision into the shared square. The existing right column retains Session previews while the prompt panel is open.

The [controller](src/client/controller.ts) discards stale account responses, retains completed mutations when older lists arrive and advances square pagination only after success. [The view store](src/client/view-store.ts) owns local editing and feedback; [the panel](src/client/PromptPanel.tsx) scrolls only its own content to a returned publication. Electron provides the authenticated transport.

</details>

## Model Experience

None, as the prompt library copies text without automatically injecting Session context or dispatching provider requests.

#### KV Cache effect

None; the user owns any later paste into a separate conversation.

## Known Limitations and Deferred Work

- The authenticated desktop account API is required. Each account can save 500 prompts; titles are limited to 120 UTF-16 code units and bodies to 64 KiB UTF-8. The square loads 50 records per page. Deletion, moderation and browser-only authentication are outside this initial feature.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Runtime acceptance and deployment evidence live in [the dated receipt](../../../output/prompt-management-design-20261013/completion.md).

</details>
