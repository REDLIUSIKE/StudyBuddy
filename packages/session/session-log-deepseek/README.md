---
description: "Retired StudyBuddy upload plugin; historical Session records remain readable."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-deepseek

English | [中文](README.zh.md)

## Summary

StudyBuddy removes Session-log upload. This package retains its plugin identity for old profiles and historical event types for released Session readers. Loading it performs no registrations and sends no session history.

## Table of Contents

- [Configuration](#configuration)
- [Request field](#request-field)
- [Acceptance and retry](#acceptance-and-retry)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration"></a>
## Configuration

No active configuration. Existing profile entries with `enabled` or `maxBytes` remain inert; enabling an old entry cannot restore upload. Shipped bundles omit this plugin.

<a id="request-field"></a>
## Request field

The plugin never registers `dsh_session_log` with the DeepSeek extension registry. Local canonical Session history and feedback records remain available to their existing readers.

<a id="acceptance-and-retry"></a>
## Acceptance and retry

No upload, retry, or new `session-log-deepseek/delivery-accepted` record occurs. Historical delivery records retain their declared types and readable Session format.

<a id="model-experience"></a>
## Model Experience

No model-visible content, input-token changes, or KV-cache changes originate from this retired plugin.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The package remains only for profile and released-record compatibility. It exports historical types and an inert `apply` function; the upload configuration and `acceptedThrough` runtime API are removed.

<a id="dev-note"></a>
### Dev Note

Loader composition tests exercise legacy enabled configurations against actual mock HTTP requests and verify that private Session events are absent.
