---
description: "将原生 owned 精确 StudyBuddy 模型 grant 接入可信 Harness 对话。"
kind: "package-library"
---

# @deepseek-ai/dsh-llm-studybuddy-builtin

[English](README.md) | 中文

## 概述

StudyBuddy 对话可以使用用户以自有 Key 明确验证过的精确模型。Pending 来源保持已配置状态，不进入可选目录。每份 Key 保留独立来源、credential、connection 与 funding 身份。该私有库要求原生准入和持久对话审计，不读取环境凭据，也不选择默认模型。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用此包

Desktop Host 通过私有 Main control 组合该库，没有 profile 安装命令。[入口模块](src/index.ts) 导出目录 owner 和精确 SDK converter；[Host 组合](../../../apps/desktop-host/src/studybuddy-builtin-models.ts) 提供真实账号及 Host 代次、可信 initiator、原生回执和持久审计 sink。

在工作区执行 `pnpm exec vitest run apps/desktop-host/tests/studybuddy-builtin-models.spec.ts apps/desktop-host/tests/studybuddy-builtin-wire.spec.ts apps/desktop-host/tests/studybuddy-builtin-control.spec.ts`。这些测试使用真实 registry、三个 SDK 协议 converter、AgentRegistry 和 Session 持久化，同时拦截全部网络请求。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[目录](src/studybuddy-builtin-models.ts) 原子安装每一来源，返回真实无 Key 读回，并仅发布原生确认的精确模型。候选失败保留先前安装的快照。撤销关闭未来准入；账号和 Host 代次拒绝旧 material。请求 prepare 与直调 stream 执行相同精确 membership 检查。

对话发送要求 Agent-loop marker、当前真实 initiator 与 Session、原生冻结准入，以及发送前 flush 的无 Key 审计事件。调用者提供的 purpose 不产生授权。受保护 Main 验证可以访问已安装的 pending 来源，不发布该来源。[Wire converter](src/studybuddy-builtin-wire.ts) 使用 grant 的协议、endpoint 和 credential，并拒绝重定向。DeepSeek Chat 发送 `max_tokens`；Kimi Chat 发送 `max_completion_tokens`。二者省略不受支持的 store 与 reasoning 配置并保留供应商 reasoning 历史，即使经过私有 gateway 也按原生供应商权威处理。Grant 没有精确选项权威，因此供应商 reasoning 和 sampling 默认保持未配置。[Terminal observer](src/studybuddy-builtin-terminal.ts) 记录有界原始供应商事实；SDK 归一化零值不产生用量权威。

Gateway 和 local direct 发送都要求精确冻结准入中的请求回执为 null。Gateway 请求携带可复用 Key、请求 UUID 和用途。历史状态回执保持可读，不能授权再次发送。

[平台目录](src/studybuddy-platform-models.ts) 从有有效期、人工审核的 Harness Chat 目录独立注册 `studybuddy-platform`，沿用现有原生 v2 平台钱包与激活权威。Main 管理受保护的下发恢复，并在发送前核对当前账号、设备和精确模型的完整绑定。平台和个人 Key 目录保持各自版本。下发结果未知时保留原 nonce；只有确认取消的申请或已撤销的旧绑定可以替换。SDK 终态错误保留原分类。客户端函数定义转发到精确人民币网关；供应商另行收费的搜索、音频及工具附加项继续拒绝。没有可信函数调用能力的模型只接收文本请求。

刷新平台目录时，已准入请求保留本次冻结的模型和用量事实。引用已替换目录的 prepared call 须重新准入。撤销账号或替换 Host 仍会阻断先前请求的每个响应片段。

已审核的 `image_in` 同时决定目录中的输入模态和实际 Pi 请求配置。支持图片的路由以标准图片内容块发送本地已验证附件；文字路由保持原生仅文字能力。`imageToolModels()` 仅向显式识图工具提供当前精确视觉路由的身份，不返回凭证，也不授予模型调用权限。

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [LLM adapter registry](../llm/README.zh.md)
- [SDK 协议转换](../llm-pi-ai/README.zh.md)
- [私有 consumer 升级](../../../docs/upgrade-guide/v0.2.1-alpha.2/studybuddy-builtin-consumer/guide.zh.md)
- [必读请求审计事件](../../../docs/persistence-changes/2026-10-11-studybuddy-builtin-request.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

### 精确对话请求

#### 模型看到什么

Grant 的精确模型通过所选协议 converter 接收 `GenerateOptions.messages`、附件与允许的工具。私有目录、credential 和准入元数据不增加 prompt 文本。

#### Token 影响

普通对话输入和生成输出决定 Token 用量。对话与平台流仅从完整的原始终态总输入、输出计数发布 usage，包括明确返回的零值；缺失或不一致的计数保持缺失。缓存计数与未缓存输入互斥，reasoning 是输出子集。显式验证发送用户的短 prompt，输出上限最多 32 Token；缺失原始 terminal 计数时保持未知。

#### KV Cache 影响

私有路由和审计元数据不改变渲染后的对话前缀。不同来源、模型或协议使用各自供应商缓存行为。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 辅助标题与压缩调用尚无可信内置准入。调用者选择 reasoning 或 sampling 选项需要额外精确权威，目前拒绝。平台准入覆盖已审核的 Chat 与原生图片输入；其他模态和供应商另行收费的工具仍需补充传输证据。真实供应商和生产 gateway 验证需要独立原生证据；本地测试使用合成权威和拦截的网络传输。目录显示某个模型不代表该模型已完成真实付费对话验收。

<a id="dev-note"></a>
### 开发笔记

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
