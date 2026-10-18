---
description: "StudyBuddy 已停用的 Session 日志偏好设置配套包。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-session-log

[English](README.md) | 中文

## 摘要

StudyBuddy 已删除 Session 日志上传开关及其提示。此浏览器包仅作为旧配置所需的无行为兼容入口保留。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用此包

新的组合不再挂载此配套包。加载既有条目不会增加通用设置行，也不能启用上传。

<a id="understand-the-implementation"></a>
## 了解实现

客户端入口不注入服务、不贡献插槽、不写入配置。[已停用的 Host 包](../../session/session-log-deepseek/README.zh.md) 也不会注册上传字段。

<a id="further-exploration"></a>
## 延伸阅读

- [设置表单](../ui-settings/README.zh.md)——其他已接受的 Host 设置。
- [本地 Session 存储](../../../docs/session-format-status.zh.md)——既有记录兼容性。

<a id="model-experience"></a>
## 模型体验

无；此无行为浏览器入口不贡献模型可见内容。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

工作区包身份仍保留，供旧配置安全加载；不提供面向用户的偏好设置。

<a id="dev-note"></a>
### 开发说明

浏览器插槽回归验证加载和销毁此配套包不会创建设置或浮层贡献。
