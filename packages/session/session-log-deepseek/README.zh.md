---
description: "StudyBuddy 已停用日志上传插件；历史 Session 记录仍可读取。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-deepseek

[English](README.md) | 中文

## 摘要

StudyBuddy 已删除 Session 日志上传。此包保留旧配置所需的插件身份和已发布 Session 读取器所需的历史事件类型。加载此包不会注册贡献，也不会发送会话历史。

## 目录

- [配置](#configuration)
- [请求字段](#request-field)
- [接受与重试](#acceptance-and-retry)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="configuration"></a>
## 配置

没有生效的配置。既有配置中的 `enabled` 或 `maxBytes` 不会执行任何行为；启用旧条目不能恢复上传。随产品交付的 bundle 不再挂载此插件。

<a id="request-field"></a>
## 请求字段

此插件不会向 DeepSeek 扩展注册表注册 `dsh_session_log`。本地规范 Session 历史及反馈记录仍由既有读取器读取。

<a id="acceptance-and-retry"></a>
## 接受与重试

不会上传、重试或新增 `session-log-deepseek/delivery-accepted` 记录。历史交付记录保留已声明类型和可读取的 Session 格式。

<a id="model-experience"></a>
## 模型体验

此停用插件不会添加模型可见内容，也不会改变输入 Token 或 KV Cache。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

保留此包仅用于旧配置和已发布记录兼容。导出历史类型及无行为的 `apply` 函数；上传配置与 `acceptedThrough` 运行时 API 已删除。

<a id="dev-note"></a>
### 开发说明

Loader 组合测试以旧的启用配置发出真实模拟 HTTP 请求，并验证请求不含私有 Session 事件。
