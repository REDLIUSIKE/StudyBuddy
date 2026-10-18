---
description: "保存个人提示词、复制完整正文，并显式上传已保存版本到提示词广场。"
kind: "package-reference"
---

# StudyBuddy 提示词管理

[English](README.md) | 中文

## 概述

用户可以保存可复用的提示词、复制完整正文，并显式上传已保存版本到提示词广场。独立右栏保留当前主页面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

## 使用本包

[web-app 组合](../../bundle/web-app/cordis.patch.yml)挂载客户端插件，无配置字段。顶部入口打开我的提示词或提示词广场；卡片操作编辑个人记录或上传已保存版本。复制失败时不会显示成功反馈。

## 理解实现

<details>
<summary>实现内部结构 — 点击展开</summary>

本插件提供全局顶部入口和按账号隔离的右栏提示词库。点击卡片复制完整纯文本正文；编辑更新个人记录，上传将已保存版本冻结为广场副本。提示词面板打开时，现有右栏保留 Session 预览。

[控制器](src/client/controller.ts)丢弃旧账号响应，保留较早列表请求返回前已完成的修改，仅在请求成功后推进广场页码。[视图状态](src/client/view-store.ts)管理本地编辑和反馈；[面板](src/client/PromptPanel.tsx)仅滚动自身内容，定位到上传返回的卡片。Electron 提供已认证传输。

</details>

## Model Experience

无，因为提示词库仅复制文本，不自动注入 Session 上下文或发起供应商请求。

#### KV Cache effect

无；之后是否粘贴到另一个对话由用户决定。

## Known Limitations and Deferred Work

- 本功能需要已认证的桌面账号 API。每个账号最多保存 500 条提示词；标题上限为 120 个 UTF-16 代码单元，正文上限为 64 KiB UTF-8。广场每页加载 50 条记录。删除、内容审核及浏览器独立认证不在本次功能范围内。

### Dev Note

<details>
<summary>维护者工作上下文 — 点击展开</summary>

运行时验收与部署证据见[日期验收记录](../../../output/prompt-management-design-20261013/completion.md)。

</details>
