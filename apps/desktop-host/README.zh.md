---
description: "桌面 Host 集成与按账号隔离的嵌入科研插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-desktop-host

[English](README.md) | 中文

## 概要

Desktop 通过此私有包提供现有 Host 服务和原生工具。嵌入科研经 Main 封存的 `studybuddy-research` profile 加载 `lib/research-plugin.js`，使用共享 dsh 和 primary runtime。插件启动编译后的科研领域模块，并保留 Main 的私有原生 RPC 通道。它不创建另一套模型循环，也不初始化 standalone 凭据。

## 目录

- [科研 profile](#research-profile)
- [剪视频 profile](#video-profile)
- [跨板块创作能力](#creative-capabilities)
- [生命周期与失败](#lifecycle-and-failures)
- [实现](#implementation)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)

<a id="research-profile"></a>
## 科研 profile

[Main](../desktop/src/studybuddy/research-profile.ts) 创建并重新校验与资源绑定的 profile；用户不把它作为 bundle 安装。配置拒绝未知字段，并要求以下绝对路径：

| 字段 | 含义 |
| --- | --- |
| `domainEntry` | 经资源清单准入的编译领域模块。 |
| `staticDirectory` | 编译后的科研与 Office 浏览器资源。 |
| `pythonExecutable` | 共享 primary runtime 中的 Python 可执行文件。 |

stdin 首行 JSON 只提供 `projectsRoot`、`guestAuthorization` 和 `toolAuthorization`；两项凭据都是 64 位小写十六进制字符串。后续字节属于现有 RPC 传输。凭据不成为 profile 字段或启动参数。

<a id="video-profile"></a>
## 剪视频 profile

Main 以封存的视频领域模块与 Studio 资源加载 `lib/video-editing-plugin.js`。私有 stdin 提供账号与工作区目录、项目绑定及已核验的渲染运行时。原生文件选择器分别授权项目、素材和导出路径，选择结果保留在账号私有状态中。嵌入模式不开放原软件的供应商、凭据和系统脚本文件选择接口。

产品界面已删除服务商和自定义服务配置，使用原账号的原生模型目录。`video_read_guide` 读取 StudyBuddy 原生编辑指南或兼容的影片与页面规范；指南和工具说明使用 StudyBuddy 品牌，第三方法律声明保留原始署名。两个内置 StudyBuddy 示例无需远程下载，打开后成为普通可编辑工程。

视频文件夹改名后，即使工作区的实时成员索引因旧目录消失而过滤了该会话，冷恢复仍可按保存的精确初始路径找到原工作区。Session 头和工作区路径保持不可变；原生工作目录服务记录本次准入的当前目录。

普通 Host 持有项目 Conversation 与 `video_*` 工具。`video_translate` 和原有字幕按钮使用一个持久化原生子会话，沿用当前 Conversation 的模型，不开放工具。原生记录保留有序原文与输出；完成的请求复用原结果，结果不明的请求不重新发送。源时间保持不变，并发手工修改会返回冲突。原生网页工具保留自己的执行与记录流程。

项目的对话与日志导出复用已有 Session 日志导出器，包含子会话和引用附件。当前原生 ZIP 暂存于项目对话元数据目录，再进入用户选择的导出部分。归档采用可取消的流式写入，拒绝元数据目录联接。可导出状态不会伪造成已经算出的归档大小。

配音使用显式生成的视频准入和已有同步语音权威。Studio 与原生工具都请求真实逐字时间戳，在音频旁生成原有 VTT 格式。匿名字幕下载复用已有的有界公共抓取服务，不保留凭据或临时网址。账号私有音频与项目工件记录可在重启后恢复已完成内容和时间戳。时间戳缺失或无法对齐时保留音频，不伪造字幕、不自动追加收费转写。已有手工 VTT 优先保留；用户仍可通过原有字幕按钮明确发起转写。

切换可见的视频页面只释放页面持有关系。跨对话任务独立保留文档及实际调用方，直到任务结束；显式关闭项目及切换账号仍会撤销任务。每个排队导出恢复自己的项目上下文。重复的绑定确认保留正在执行的操作；重新打开会等待上次关闭结束。账号变化后拒绝旧关闭结果。

视频项目 Session 使用保留的 `session-video-` 身份前缀。原生轮次与工具保护也覆盖冷恢复和子会话；只有已准入且挂载视频工具的项目才能执行。原有重命名、重新定位和删除操作先释放已准入任务，再改变路径。完成同父目录重命名后，先持久化原生路径授权再报告成功，也覆盖从项目列表修改的项目。重新打开保留原 Workspace、Session 头及历史，通过已有工作目录服务记录当前目录。

Main 发布生成素材时不替换已有文件。项目内的工件记录将完成内容绑定到原生请求 UUID、所有者、项目、Session 和输入摘要，不持有价格或用量权威。完成的工件可跨重启恢复；遇到并发手工文件时，保留下载结果，可用同一 UUID 换个路径保存。后续手工修改保持有效，不通过自动生成修复。取消项目也会停止未完成的响应读取并释放响应体。

<a id="creative-capabilities"></a>
## 跨板块创作能力

支持工具调用的原生对话通过 `creative_project` 发现 AIGC 和剪视频。创建或关联领域文档后，`creative_<module>_<tool>` 工具挂载到实际发起调用的 Agent，与编辑器原有工具并存。`creative_import` 经 Main 原有文件写入器转移已授权、已完成的工件；`deliver` 使用原生交付卡片，结果按钮打开对应编辑器。原生只读、显式工具限制、任务预算和专用 Skill 安全检查作用域继续生效。

已校验的视频预览使用原生附件存储，当前模型可以直接检查画面，无须读取另一板块的私有目录。已开始的对话缺少 `present` 工具时，交付通过现有 Loader 在同一个 Agent 作用域加载 Harness 原插件。继续沿用其原生 Session 事件及文件卡片。

[Host 合同](src/capabilities/types.ts) 定义适配器注册、完整工具及 Schema 版本与类型化工件。[Main 授权](../desktop/src/studybuddy/capabilities/service.ts) 独立校验账号、调用方、目标及字节来源。新领域适配器实现相同接口；共同调度不增加板块专用分支。注销函数立即撤销准入，移除领域资源前必须等待它结束所属任务。原生 Jobs 观察原有操作引用。进程丢失后，不可查询的任务保持待确认，绝不自动重发。[编译集成测试](../../scripts/studybuddy/capability-integration.spec.ts) 使用第三个文档适配器并实际导出、解码视频，不调用供应商；原账号及计费验收单独进行。

<a id="lifecycle-and-failures"></a>
## 生命周期与失败

提供方暴露已初始化的 HTTP 应用及幂等启动、关闭操作。注入的消费方开始监听后，仅在启动器提交 `appReady` 时发出一条 ready 消息。ready 地址必须是 `127.0.0.1` 上带显式端口的 HTTP origin。

EOF、传输关闭、I/O 失败和 fiber 销毁会取消未完成的初始化并抑制迟到的 ready。传输仍可用时，清理先等待领域服务和 Worker 结束，再关闭通道。EOF 在清理后请求启动器以 0 退出；引导内容无效、领域启动或 I/O 失败请求以 1 退出。清理失败会写入日志并请求以 1 退出。结果未知的原生操作不会重试。

<a id="implementation"></a>
## 实现

[服务声明与提供方](src/research-service.ts) 将 Fastify 类型保留在编译领域模块内。[插件](src/research-plugin.ts) 通过 Cordis effect 和监听器持有 stdio 与启动器集成。[专项测试](tests/research-plugin.spec.ts) 覆盖 Loader 组合、缓冲字节、初始化取消和清理。历史列表和导出使用已注册的 `sessionQuery` 服务，并保留项目及父子会话关系检查。

<a id="model-experience"></a>
## 模型体验

科研 profile 不改变提示词、工具 schema、模型选择、用量或价格权威。剪视频只为已准入 Conversation 增加项目工具。字幕翻译将有序原文交给一个原生子会话，沿用当前 Session 的模型选择；普通原生模型与计费服务继续持有权威。这里不引入新的供应商或模型目录，也不估算用量。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

无 Key 的生命周期与夹具 HTTP 测试不证明原账号 GUI、Office 引擎、科学辅助依赖、真实模型响应或发布验收。组合资源候选与原账号仍须各自完成集成核对。打包与交付见 [Desktop 运行时文档](../desktop/README.zh.md)。
