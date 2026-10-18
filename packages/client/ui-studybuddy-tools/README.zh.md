---
description: "在 Harness 中挂载按账号隔离的 StudyBuddy 桌面工具中心，排查账号、原生视图与纯网页边界。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-studybuddy-tools

[English](README.md) | 中文

## 概述

工具中心在导航中使用装饰性的扳手图标。浏览器模块仅包含这一枚图标，不包含整套图标目录；入口位置和原生操作保持不变。

桌面认证后，共用空闲队列提前准备隐藏的工具中心。返回保留的视图时复用工具安装检测，连接与配置仍读取当前状态。安装变更、手动刷新和重试仍会扫描。退出登录与账号代次变化会销毁保留视图并取消待执行的准备。

在 Harness 内打开 StudyBuddy 现有工具卡片和配置面板。桌面主进程管理原生操作、私有安装授权和本地视图。账号切换时销毁旧视图，普通面板切换则保留视图。纯网页宿主不能操作本机工具。

实验室改为从“设置 → 实验室”打开，原侧栏和主面板入口移除。保留的原生页面可在所属设置弹窗内显示，遇到其他弹窗或菜单时隐藏。跳转工具中心或技能安全检查对话前关闭设置，沿用原有账号代次校验。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 StudyBuddy 桌面组合中选用本包。工具安装、连接和恢复仍由原 StudyBuddy 服务处理；不要再挂载一套账号或钱包。

```yaml
- id: studybuddy-tools
  name: '@deepseek-ai/dsh-client-ui-studybuddy-tools'
```

本包没有配置字段。通过 Cordis 配置行挂载，不是可安装到 profile 的 bundle。桌面必须提供按账号隔离的 `studybuddy.tools` 宿主；否则面板提示需要桌面客户端。

空的技能检查对话显示引导说明，不提供固定示例选项。用户在原生输入框填写技能名或项目地址，后续对话提问仍可正常出现。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现归属 — 点击展开</summary>

插件管理不依赖 React 的控制器和显示生命周期。控制器串行更新可见性和几何尺寸，并释放迟到的视图。显示层用共享 DOM 观察器，在前台菜单和弹窗出现时隐藏原生交互层。桌面在分配视图前校验打包字节。

来源和充值导航进入现有账号模块。通知只携带账号代次和固定目的地，不携带 Key。页面只获得明确命名的工具方法；私有安装授权不进入页面。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Web 客户端组合](../../../docs/subsystems/web-client.zh.md) — 客户端包归属。
- [共享原子组件](../ui-primitives/README.zh.md) — 可复用控件与视图几何。
- [工具控制器](src/client/tool-center-controller.ts) — 账号与销毁边界。

-----

<a id="model-experience"></a>
## Model Experience

无，因为本包只显示本机工具管理，不组装供应商请求，也不添加 Session 上下文。

#### KV Cache effect

本包不改变模型输入或 Token 用量。各原工具和供应商仍管理自己的请求与缓存行为。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- 本机操作需要打包的桌面宿主和已认证账号范围。网页能显示不代表本机工具可用。
- 协议夹具和隔离服务测试不证明生产认证或真实工具安装、连接已通过。
- Harness 内置模型目录和聊天交接属于主移植任务，需要单独通过联合验收。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
