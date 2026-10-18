---
description: "Desktop Host integration and the account-scoped embedded research plugin."
kind: "package-reference"
---

# @deepseek-ai/dsh-desktop-host

English | [中文](README.zh.md)

## Summary

Desktop uses this private package for its existing Host services and native tools. Embedded research loads `lib/research-plugin.js` through Main's sealed `studybuddy-research` profile, using the shared dsh and primary runtime. The plugin starts the compiled research domain and retains Main's private native RPC channel. It does not create another model loop or initialize standalone credentials.

## Table of Contents

- [Research profile](#research-profile)
- [Video profile](#video-profile)
- [Creative capabilities](#creative-capabilities)
- [Lifecycle and failures](#lifecycle-and-failures)
- [Implementation](#implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="research-profile"></a>
## Research profile

[Main](../desktop/src/studybuddy/research-profile.ts) creates and revalidates the resource-specific profile; users do not install it as a bundle. Configuration rejects unknown fields and requires these absolute paths:

| Field | Meaning |
| --- | --- |
| `domainEntry` | Compiled domain module admitted by the resource inventory. |
| `staticDirectory` | Compiled research and Office browser resources. |
| `pythonExecutable` | Python executable from the shared primary runtime. |

The first stdin JSON line supplies only `projectsRoot`, `guestAuthorization` and `toolAuthorization`; the two credentials are lowercase 64-digit hexadecimal strings. Subsequent bytes belong to the existing RPC transport. Credentials never become profile fields or arguments.

<a id="video-profile"></a>
## Video profile

Main loads `lib/video-editing-plugin.js` with the sealed video domain and Studio assets. Private stdin supplies account/workspace roots, project bindings and the verified render runtime. Native dialogs admit project, asset and export paths separately; selected paths stay account-private. The original standalone provider, credential and OS-dialog routes are unavailable in embedded mode.

The product UI removes provider/custom-service setup and uses the current native account catalog. `video_read_guide` reads the StudyBuddy native editing guide or the compatible film/page specification; its text and tool descriptions use StudyBuddy branding. Third-party notices retain original attribution. The two bundled StudyBuddy examples create ordinary editable projects without remote downloads.

After a video folder is renamed, cold admission can find the original Workspace by its exact stored birth path even when the registry's live membership filters the missing old directory. The Session header and Workspace path remain immutable; the native working-directory service records the admitted current path.

The ordinary Host owns project Conversations and `video_*` tools. `video_translate` and the original subtitle button use one persisted native child with the current Conversation model and no tools. Ordered input lines and output remain in the native log; completed requests reuse that result, while incomplete outcomes are not resubmitted. Source times are retained and concurrent manual edits produce a conflict. Native web tools retain their own execution and logging.

Project chat/log exports reuse the existing Session-log exporter, including descendants and referenced attachments. The current native ZIP is staged in project chat metadata and included under the selected export part. Archive streaming is cancellable; metadata junctions are rejected. Availability does not fabricate a precomputed archive size.

TTS uses explicit generated video membership and the existing synchronous speech authority. Both Studio and native tools request real word timestamps and publish the original VTT format beside the audio. Anonymous subtitle downloads use the existing bounded public fetch service; no credential or temporary URL is retained. Account-private audio and project artifact records recover completed bytes and timing after restart. Missing or unaligned timing retains the audio without invented subtitles or automatic paid ASR. Existing manual VTT files win; the original manual subtitle action can explicitly request ASR.

Changing the visible video page releases its view interest. A cross-conversation task retains its separate document interest and actual caller until completion; explicit project closure and account changes still revoke work. Each queued export restores its own project context. Repeated binding acknowledgements preserve an active operation; re-opening waits for the previous close. Account changes reject old close results.

Video project Sessions use the reserved `session-video-` identity prefix. Native pre-step and tool guards also cover cold restores and descendants; only a currently admitted project with mounted video tools can run. Original rename, locate and delete operations release admitted work before changing paths. A completed same-parent rename persists its native path grant before reporting success, including projects changed from the library. Reopening retains the original Workspace, Session header and history, and commits the effective directory through the existing working-directory service.

Main publishes generated assets without replacing existing files. Project-local artifact records bind completed bytes to the native request UUID, owner, project, Session and input hash; they carry no price or usage authority. A completed artifact survives restart, and a racing manual file leaves the downloaded result available for another destination under the same UUID. Later manual changes are preserved and never repaired by an automatic generation. Project cancellation also stops pending response reads and releases the body.

<a id="creative-capabilities"></a>
## Creative capabilities

Tool-capable native conversations discover AIGC and video with `creative_project`. Creating or attaching a domain document mounts `creative_<module>_<tool>` tools on the actual calling Agent, alongside the editor's original tools. `creative_import` transfers an authorized completed artifact through Main's original file writers; `deliver` uses native deliverable cards, and the result action opens the associated editor. Native read-only, explicit tool restrictions, task budgets and the dedicated Skill safety scope remain authoritative.

Verified video previews use the original native attachment store so the current model can inspect frames without reading another module's private folder. When a started conversation has no `present` tool, delivery loads the original Harness plugin in that same Agent scope through the existing Loader. Its native Session event and file cards remain authoritative.

[The Host contract](src/capabilities/types.ts) defines adapter registration, complete tool/schema revisions and typed artifacts. [Main admission](../desktop/src/studybuddy/capabilities/service.ts) validates account, caller, target and byte provenance independently. New domain adapters contribute the same interfaces; shared dispatch has no module-specific branch. Registration disposers revoke admission immediately and must be awaited to settle owned work before removing domain resources. Native Jobs observe original operation references. After a lost process, unavailable work stays unknown and is never resubmitted automatically. The [compiled integration](../../scripts/studybuddy/capability-integration.spec.ts) exercises a third document adapter and an actual decoded video export without supplier calls; original-account and billing acceptance are separate.

<a id="lifecycle-and-failures"></a>
## Lifecycle and failures

The provider exposes the initialized HTTP application and idempotent start/close operations. The injected consumer starts listening, then emits one ready message only after launcher `appReady` commits. A ready origin must be an HTTP origin on `127.0.0.1` with an explicit port.

EOF, transport shutdown, I/O failure and fiber disposal cancel pending initialization and suppress late readiness. Cleanup waits for domain services and Workers before closing the channel where the transport is still available. EOF requests launcher exit 0 after cleanup; malformed bootstrap, domain startup or I/O failures request exit 1. Cleanup failures are logged and request exit 1. Unknown native outcomes are never retried.

<a id="implementation"></a>
## Implementation

[Service Definition and Provider](src/research-service.ts) keep Fastify types inside the compiled domain. [The plugin](src/research-plugin.ts) owns stdio and launcher integration through Cordis effects and listeners. [Focused tests](tests/research-plugin.spec.ts) cover Loader composition, buffered bytes, initialization cancellation and cleanup. Journal lists and exports use the registered `sessionQuery` service and retain project and lineage checks.

<a id="model-experience"></a>
## Model Experience

The research profile changes no prompt, tool schema, model selection, usage or price authority. Video contributes project-specific tools only to admitted Conversations. Subtitle translation adds the ordered lines to one native child request using the current Session selection; the ordinary native model and billing services retain authority. No provider/model directory or usage estimate is introduced here.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

Keyless lifecycle and fixture HTTP tests do not establish original-account GUI, Office engine, scientific helper dependencies, real model responses or release acceptance. The combined resource candidate and original account require their separate integration checks. See [the Desktop runtime documentation](../desktop/README.md) for packaging and delivery.
