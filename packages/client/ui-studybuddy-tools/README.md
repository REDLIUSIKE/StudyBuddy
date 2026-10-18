---
description: "Mount the scoped StudyBuddy desktop tool center in Harness and debug its account, native-view and web-only boundaries."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-studybuddy-tools

English | [中文](README.zh.md)

## Summary

Tool Center uses a decorative wrench in navigation. Its browser bundle includes the individual icon rather than the complete icon catalog; entry position and native operations remain unchanged.

Authenticated desktop startup prepares the hidden tool center through the shared idle queue. Returning to its retained view reuses installation detection, while connection and configuration reads stay live. Installation mutations, manual refresh and retry still scan. Logout and account generation changes dispose the retained view and cancel pending preparation.

Open StudyBuddy’s existing tool cards and configuration panel inside Harness. The desktop owns native operations, private installation authorizations and the local view. Account changes dispose the old view, while ordinary panel changes retain it. A web-only host cannot operate local tools.
The Laboratory panel reuses StudyBuddy’s Codex UI localization page in a separate owned document. It has only status, apply and restore operations, shares Tool Center’s verified installation binding, and preserves the original protected recovery receipts. Unsupported versions and running Codex processes remain blocked.

Laboratory now opens through Settings → Laboratory; its sidebar and main-panel entries are removed. The retained native document is visible inside its owning settings dialog and hides beneath another dialog or menu. Leaving for Tool Center or the Skill safety conversation closes Settings before navigating, with the original account-scope checks intact.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Choose this package for the StudyBuddy desktop composition. Keep tool installation, connection and recovery in the original StudyBuddy services; do not mount a second account or wallet.

```yaml
- id: studybuddy-tools
  name: '@deepseek-ai/dsh-client-ui-studybuddy-tools'
```

The package has no configuration fields. It mounts as a Cordis row, not a profile-installable bundle. The desktop must provide its scoped `studybuddy.tools` carrier; otherwise the panel reports the desktop requirement.

The empty skill-check conversation shows an introduction without fixed example choices. Users enter a skill name or project address in the native composer; later conversational questions remain available.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation ownership — click to expand</summary>

The plugin owns a React-free controller and a presentation lifetime. The controller serializes visibility and geometry updates and releases late acquisitions. The presentation uses shared DOM observers to hide native input layers under foreground menus and dialogs. The desktop verifies packaged bytes before allocating the view.

Sources and recharge navigate to the existing account owner. Notifications carry account generation and a fixed destination, never a Key. The page receives named tool methods only; private installation authorizations remain outside it.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web client composition](../../../docs/subsystems/web-client.md) — client package ownership.
- [Shared primitives](../ui-primitives/README.md) — reusable controls and surface geometry.
- [Tool controller](src/client/tool-center-controller.ts) — scope and disposal boundaries.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders local tool management without assembling provider requests or adding Session context.

#### KV Cache effect

The package changes no model input or token usage. Each original tool and provider owns its request and cache behavior.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Local operation requires the packaged desktop carrier and an authenticated account scope. Pure web rendering is not native-tool availability.
- Protocol fixtures and isolated service tests do not prove production authentication or real-tool installation and connection.
- The internal Harness model catalog and chat handoff belong to the main migration. They must pass joint acceptance separately.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
