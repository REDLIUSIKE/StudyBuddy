---
description: "StudyBuddy brand occupants for sidebar and conversation hero slots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

## Summary

StudyBuddy uses its existing green 硅宝 mascot and adapted wordmark in every build profile. The package fills independent sidebar mark and name slots and the conversation hero mark slot. It has no runtime state and does not affect model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The shipped browser roster mounts this plugin. `DSH_CLIENT_BUILD_PROFILE` does not gate the StudyBuddy occupants.

### Choosing the profile

Local and official builds render the same StudyBuddy identity.

### Replacing the brand

Other deployments replace the slot occupants with their own package. This plugin provides no configuration setting.

<a id="understand-the-implementation"></a>
## Understand the implementation

The expanded sidebar displays one complete 160 × 36 px wordmark with its integrated B mascot. The mark occupant returns no content when the shell supplies `wide: true`; the collapsed rail and conversation hero retain the standalone mascot. The [sidebar shell](../ui-sidebar/README.md#use-this-package) gives brand seats 36 px and the brand button 38 px of height; its Windows row remains 40 px, preserving the New Session position. Transparent wordmark resources provide 1x, 2x and 3x density choices without cropping the artwork.

<a id="further-exploration"></a>
## Further Exploration

- [Sidebar shell](../ui-sidebar/README.md) — slot ownership and navigation behavior.
- [Hero shell](../ui-conversation/README.md) — conversation brand presentation.

<a id="model-experience"></a>
## Model Experience

No model-visible content, token changes, or cache effects.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The wordmark is an existing-brand bitmap adaptation. Containers must preserve its full visible artwork when changing dimensions.

<a id="dev-note"></a>
### Dev Note

Slot lifecycle tests and the actual desktop clip inspection cover this presentation.
