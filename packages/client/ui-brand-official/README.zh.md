---
description: "StudyBuddy 侧栏和会话欢迎区品牌插槽贡献。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 摘要

StudyBuddy 在所有构建配置中使用现有绿色硅宝角色和适配字标。此包填充侧栏独立标志、名称及会话欢迎区标志插槽。此包没有运行时状态，也不影响模型请求。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用此包

随产品交付的浏览器插件名单挂载此包。`DSH_CLIENT_BUILD_PROFILE` 不控制 StudyBuddy 品牌贡献。

### 选择配置

本地与官方构建呈现相同的 StudyBuddy 品牌。

### 替换品牌

其他部署可使用自己的包替换插槽贡献。此插件没有配置项。

<a id="understand-the-implementation"></a>
## 了解实现

展开侧栏只显示一个 160 × 36 px 的完整字标，其中已包含 B 形硅宝。外壳传入 `wide: true` 时，标志占位者不返回内容；收起轨道与会话欢迎区继续使用独立硅宝。[侧栏外壳](../ui-sidebar/README.zh.md#use-this-package) 为品牌容器提供 36 px、品牌按钮提供 38 px 高度；Windows 品牌行保持 40 px，新会话按钮位置不变。透明字标提供 1x、2x、3x 像素密度选择，不裁切图案。

<a id="further-exploration"></a>
## 延伸阅读

- [侧栏外壳](../ui-sidebar/README.zh.md)——插槽归属与导航行为。
- [欢迎区外壳](../ui-conversation/README.zh.md)——会话品牌呈现。

<a id="model-experience"></a>
## 模型体验

没有模型可见内容、Token 变化或缓存影响。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

字标是现有品牌的位图适配。调整尺寸时，容器必须保留完整可见图案。

<a id="dev-note"></a>
### 开发说明

插槽生命周期测试和实际桌面裁切检查覆盖此呈现。
