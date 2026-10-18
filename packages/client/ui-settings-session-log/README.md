---
description: "Retired StudyBuddy Session-log preference companion."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-session-log

English | [中文](README.zh.md)

## Summary

StudyBuddy removes the Session-log upload switch and its notices. This browser package remains as an inert compatibility entry for old profiles.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

No new composition mounts this companion. Loading an existing entry adds no General settings row and cannot enable upload.

<a id="understand-the-implementation"></a>
## Understand the implementation

The client entry has no injected services, slot contributions, or configuration writes. The [retired Host package](../../session/session-log-deepseek/README.md) also registers no upload field.

<a id="further-exploration"></a>
## Further Exploration

- [Settings forms](../ui-settings/README.md) — other accepted Host settings.
- [Local Session storage](../../../docs/session-format-status.md) — existing record compatibility.

<a id="model-experience"></a>
## Model Experience

None; this inert browser entry contributes no model-visible content.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The workspace identity remains to load old profiles safely; it provides no user-facing preference.

<a id="dev-note"></a>
### Dev Note

A browser slot regression verifies that loading and disposing the companion creates no settings or overlay contributions.
