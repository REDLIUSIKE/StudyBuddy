---
description: "管理 owned StudyBuddy AI 来源，并查看真实原生就绪状态、诊断和供应商余额。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-studybuddy-account

[English](README.md) | 中文

## 概述

自备来源查询与耗时工具操作分别排队。每个已发出的来源读取请求限时 15 秒；超时后页面恢复操作，其他原生任务继续运行，迟到的响应沿用原请求关联。账号切换仍丢弃旧账号结果。

认证后，共用空闲队列准备个人资料、已保存来源、模型页、使用记录首屏与只读充值数据。设置中的“模型”和“我的 AI → 自备模型”共用账号隔离的来源控制器、添加编辑和保存验证流程，桌面旧提供商表单及默认 DeepSeek 卡片不再注册。来源列表只等待本地来源与凭据读取；登记状态和就绪回执后台补齐。启动时先于工具中心准备来源列表和模型目录；目录读取期间，本地列表仍可操作。编辑器仅复用当前账号有效期内的目录元数据。来源页面切换复用 30 秒内成功读取的展示数据，合并尚未完成的读取。手动刷新、来源变更与工具中心跳转会请求新数据；较早的读取不能覆盖较新的结果。账号切换取消准备并清空旧账号数据。原生授权、精确模型证明、价格读取与明确支付操作沿用现有权威。

我的 AI 每份 owned Key 保留独立一行，并保留原有原生来源操作。用户明确选择精确模型和协议，再保存并验证该模型一次。已配置 Key 与内置来源就绪状态分别展示。来源详情读取缓存诊断；模型诊断和供应商余额刷新须由用户明确触发。

同级“模型”标签打开原有账号隔离的 HTTPS 页面。空闲时提前加载目录和价格，点开卡片才读取本人用量；标签切换复用已准备的页面，直到账号切换或登录失效。卡片合并已核对的官方介绍、输入输出类型、网关当前人民币价格及本人用量，供应商 Logo 保留原色。能力排序引用 Artificial Analysis 已发布分数，不发起模型调用；未收录型号不标名次。收费排序按明确计费类别和单位比较，历史花费只读取真实结算记录。

“我的 AI”的第四个页签“排行榜”通过声明的 `studybuddy.my-ai.leaderboard` 插槽承载现有排行页面。页面插件继续管理原页面、账号隔离和后台准备。原左侧“知涟”入口移除；同账号的社区导航通过账号模块的 `studybuddyMyAi` 导航服务打开该页签。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用此包

StudyBuddy 桌面组合提供我的 AI 和唯一外壳余额操作。来源复用原有 ModelProviderList、来源编辑器和管理操作：重命名、删除、排序、Key 显示/复制/粘贴、连通检测、目录和原 operation 恢复。圆点按当前来源版本对应的原生就绪回执显示：就绪为绿，失败或缺少凭据为红，处理中为黄，未确认或旧来源为灰。

V3 发现仅检查连通和精确人工候选，不调用模型。编辑器初始模型为空。显式保存只验证所选模型，输出上限最多 32 Token，并提示供应商费用。V2 来源检测与旧工具操作保持既有行为。Pending 保存保留原 operation，直到原生确认或返回精确缺失 journal 结果。

打开来源详情、登录和恢复准备不调用模型或刷新余额。诊断显示实际响应身份、可见文本时间和可信 terminal 用量；缺失值保持待确认。整个请求的输出速率要求实际 terminal 输出计数和正数实测时长。供应商账号余额使用权威十进制字符串，同一账号的不同 Key 不相加。

外壳余额打开原有充值弹窗。账号总额、可用及冻结金额保持精确权威金额字符串。客户端可见时，账户插件每隔 `balanceRefreshIntervalMs` 读取现有汇总 API，默认 5000 毫秒、最小 1000 毫秒；窗口重新获得焦点或恢复可见时也会刷新。并发读取合并为同一请求，账号切换丢弃旧响应。充值显示金额选择、付款码和支付进度，不展示订单明细；后台继续跟踪原付款并阻止重复充值。个人资料仍使用已保留、账号隔离的 HTTPS guest、已确认头像资源和 scoped Harness token。已删除的个人资料用量和账号详情栏保持删除。

微信原订单提供付款内容后，紧凑付款页显示微信充值标题、二维码和关闭按钮。未付款订单提供“重新选择金额”，通过现有 API 取消该原订单。只有服务端确认终态后才重新启用金额选择；结果不明或已经付款时继续跟踪原订单。关闭弹窗仍保留原订单和后台查询，充值完成仍刷新权威余额。查询失败时可重试查询同一订单，模拟订单保留测试支付标记。生成付款码之前保留金额、优惠券和邀请页面。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[来源 Controller](src/client/source-controller.ts) 拒绝旧账号、draft 和来源 revision 响应。[公共 business adapter](src/client/business-api.ts) 提供固定方法，不包含登录 token、私有 grant 或准入 ticket。Electron Main 拥有私有 consumer 准备和精确 SDK 验证；原生拥有来源、grant、余额和 terminal 权威。Renderer 的 purpose 字段不产生请求信任。

[来源诊断](src/client/SourceDiagnostics.tsx) 合并原生缓存事实与 Main 观察到的时间。来源就绪要求当前 source revision 和原 owned operation；已配置或已发现事实不能发布模型。会话选择与显式默认持久化由[模型选择器](../ui-model-selection/README.zh.md)拥有。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 显式来源诊断

#### 模型看到什么

用户明确保存或执行 `runNativeBuiltinDiagnostic` 时，通过 Main 的受保护 adapter 仅把短 prompt 发送到所选精确来源。账号、个人资料、来源目录和余额视图不增加 Session 上下文。

#### Token 影响

V3 显式验证或诊断的生成输出上限最多 32 Token，可能产生供应商费用。发现、详情读取与准备恢复不发送 inference 请求；显示用量来自实际 terminal 事实。

#### KV Cache 影响

账号和来源管理视图不改变持久对话前缀。显式诊断是独立请求，不把 prompt 追加到对话。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 中性供应商 preset 是编辑器选项，不是模型准入。仅当前精确人工权威和真实原生验证发布内置来源。真实供应商和生产 gateway 检查须具备独立证据；本地组件测试使用合成权威与拦截的网络传输。

<a id="dev-note"></a>
### 开发笔记

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
