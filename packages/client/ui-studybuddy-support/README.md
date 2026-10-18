---
description: "Account-owned Help & Feedback in the Harness Settings dialog."
kind: "package-plugin"
---

# @deepseek-ai/dsh-client-ui-studybuddy-support

English | [中文](README.zh.md)

## Use this package

The plugin adds Help & Feedback to Settings, after the existing sections. It does not add a primary navigation item or replace Harness Session persistence, crash reports or upstream feedback. Desktop Main supplies the authenticated support API; other environments show an explicit unavailable state.

The workflow previews and sends diagnostic logs, submits a problem with optional screenshots, copies confirmed LOG/ISSUE references and reuses the product update check. Drafts and operations survive closing Settings for the same account; invalidation clears them. An uncertain report submission is not repeated automatically. Complete API Key attachments retain the existing policy and are disclosed before submission; raw conversations and login credentials are not automatically collected.

The same plugin contributes About StudyBuddy after Help & Feedback. This static page credits major integrated projects separately from design references in two columns, showing project links and licenses without framework or per-project descriptions. It provides QQ community group 120796873 with a copy action; no personal QQ contact is displayed. The planned GitHub release is described as a future publication; no repository address or release date is invented. The page does not depend on the support API or an account session.

## Model Experience

This feature sends no prompt to a model and changes no model selection, route, usage or price facts. The existing support service owns archive validation, screenshot limits, durable log attempts and remote availability.

## Known limitations

Collection availability describes observed diagnostic sources, not a tool's installation or connection health. Sources without an integrated collector remain unavailable. Remote objects may finish after a view closes; closing the view is not deletion. An unconfirmed report blocks new uploads for the current owner lifecycle so its confirmed LOG reference remains available for investigation. A support deadline rejects that request without terminating unrelated native work; a late receipt is still correlated.

## Implementation

The [approved design](../../../docs/superpowers/specs/2026-10-12-harness-help-feedback-design.md) defines collection and ownership. The React-free controller mirrors results; the declared store contains view drafts only. The client entry exports only the Cordis loading values.
