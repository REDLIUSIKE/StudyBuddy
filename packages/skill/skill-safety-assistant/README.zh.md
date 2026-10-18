---
description: "将封闭技能安全请求交给归属明确的原生提供方，不启动模型轮次即可读取会话引导。组合或测试 StudyBuddy 技能检查时查阅。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-safety-assistant

[English](README.md) | 中文

## 概述

消费方可以将查找、扫描和安装 skill（技能）的请求交给单个已组合的本地提供方。不启动模型轮次也能读取会话引导。提供方不可用或已撤销时，返回结构化失败而非编造结果。本包本身不下载、扫描或安装 skill。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知局限与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## 使用本包

组合默认服务导出，并在发送请求前注册归属明确的提供方。[服务测试](tests/service.spec.ts) 使用原生 Session 引用和可撤销的 Cordis 注册验证此路径。

服务转交真实调用的 Agent（智能体）、actor 和取消信号。提供方校验活跃根 agent；工具参数不能替换账号或 Agent 身份。request、job、candidate、artifact、intent、report、operation ID 使用不同品牌类型；[types.ts](src/types.ts) 定义这些类型和无密钥结果。接收客户端负责本地化失败说明。

服务没有配置字段。提供方卸载时移除注册、取消调用，并等待执行完全停稳。卸载后的迟到结果不能变成成功。展示是只读操作，不授权任何动作。

预设的 `./tools` 入口提供四个原生操作，并保留原生澄清问题。其有作用域的提示组合过滤器只向模型展示这五个工具；预设层的空限制会把预设自身的贡献也对其后代隐藏。预设的单调守卫独立拒绝其他执行，不依赖 schema 的展示。此预设以外的普通对话不变。

-----

<a id="understand-the-implementation"></a>

## 理解实现

<details>
<summary>实现细节——点击展开</summary>

服务为每次调用捕获一项提供方注册，将调用者取消信号与该注册生命周期合并，并在异步结果返回后再次核对注册。提供方负责活跃根 agent 和账号准入；文件系统与扫描操作不属于服务定义。桌面[操作记录](../../../apps/desktop/src/studybuddy/skill-safety-journal.ts) 独立于原生对话日志保存不可变操作回执。不能根据待定记录重放结果未知的操作；操作记录不追踪对话阶段或问题。

桌面 [Main 所有者](../../../apps/desktop/src/studybuddy/skill-safety-main.ts) 串行读取原生来源，并在每次操作前使用当前私有账号凭据。凭据刷新时替换旧管道，账号准入不变。管道失败仍会明确报告；只有后续显式请求才启动替代管道，不重放失败的操作。撤销会等待排队的读取和管道退出。

</details>

-----

<a id="further-exploration"></a>

## 延伸阅读

- [架构](../../../docs/architecture.zh.md)——插件组合与能力角色。
- [Skills](../../../docs/subsystems/skills.zh.md)——活跃 skill 的发现与加载。
- [原生提问](../../interaction/tool-ask-user/README.zh.md)——真实用户回答，而非模型生成的授权。

-----

<a id="model-experience"></a>

## 模型体验

### 无直接模型上下文

#### 模型看到什么

`execute()` 与 `presentation()` 均不注册模型工具或提示词。消费方负责返回记录的展示，必须将模型可见输入和结果保留在原生会话日志中。

#### Token 影响

服务本身不增加请求 token、不发起推理请求。模型用量由提供方和消费方操作负责。

#### KV Cache 影响

服务不重写模型历史或提示词前缀。消费方展示记录的变化仍由该消费方负责上下文语义。

## 已知局限与延期工作

<a id="known-limitations-and-deferred-work"></a>

服务需要私有原生提供方，本身不是安装权限来源。

- 提供方缺失或已撤销时使用稳定失败代码拒绝调用，不回落到其他提供方或模型。
- 扫描结论、安装决定和文件回执必须来自各自执行真源；模型编写的同意不是真实用户决定。
- 本包约定和测试不能证明扫描器版本、真实模型路由、Windows 资源包或完整实验室流程已经通过验收。

<a id="dev-note"></a>

### 开发注记

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
