# StudyBuddy 硅基同桌

> 普通用户可前往 [StudyBuddy 官网](https://guijitongzhuo.com/) 下载正式版。
>
> 也可以从 [GitHub Releases](https://github.com/REDLIUSIKE/StudyBuddy/releases/latest) 下载最新的 Windows 安装包。

StudyBuddy 硅基同桌是一款面向学习、研究与创作场景的开源桌面 AI 工作台。它将 AI 对话、项目文件、资料检索、科研辅助、技能与工具管理，以及图像、音频和视频创作能力整合进统一的桌面体验，帮助用户在自己的电脑上组织学习与创作流程。

## 校园主理人招募

StudyBuddy 硅基同桌正在招募校园主理人。你可以在自己的学校发起共学计划，组织同学一起学习和使用 AI 工具，分享实践经验、收集真实反馈，并让更多同学了解和使用 StudyBuddy。

如果你热爱 AI、愿意组织校园活动或建立学习社群，欢迎加入我们。

**报名 QQ 群：120796873**

## 共创邀请

StudyBuddy 硅基同桌是一个持续完善的开源项目，欢迎开发者参与代码共创。你可以通过 Issue 和 Pull Request 贡献缺陷修复、性能优化、测试完善和现有功能改进。

我们希望和更多开发者一起，把实用的 AI 学习与创作工具带给更多人。

## 主要能力

- AI 对话、项目文件和桌面工作区
- 资料检索与科研辅助
- 技能、工具和提示词管理
- 图像、音频与视频创作
- 本地项目、历史记录和内容管理

## 源码结构

- `apps/desktop`：Electron 桌面客户端
- `apps/web`：客户端网页界面
- `packages`：客户端、运行时和通用功能包
- `native`：本地原生组件
- `integrations`：随客户端运行的研究与创作功能源码

本仓库不包含 StudyBuddy 的在线账户、支付、管理、部署和运营服务。需要联网的功能需由使用者自行配置相应的服务地址与凭据。

## 开发环境

- Node.js 24
- pnpm 11.28.5
- Bun 1.3.14（仅部分创作功能需要）
- Windows 10 或 Windows 11（桌面版主要开发与测试平台）

安装依赖：

```powershell
pnpm install --frozen-lockfile
```

启动桌面开发版：

```powershell
pnpm run dev:desktop
```

编译桌面端和网页端：

```powershell
pnpm run build
pnpm run build:desktop
pnpm run build:web
```

测试覆盖多个模块，请按本次改动范围运行对应的 Vitest 测试文件或目录：

```powershell
pnpm exec vitest run <测试文件或目录>
```

## 许可证

StudyBuddy 硅基同桌以 [MIT License](LICENSE) 开源。第三方项目的版权与许可证信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 以及各 `integrations` 子目录中的许可证文件。

## 致谢

StudyBuddy 硅基同桌使用并参考了许多优秀的开源项目，特别感谢以下项目的作者和社区：

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [OpenFilm](https://github.com/openfilm/openfilm)
- [K-Dense BYOK](https://github.com/K-Dense-AI/k-dense-byok)
- [Toonflow](https://github.com/HBAI-Ltd/Toonflow-app)

更多第三方项目及许可证信息请查看 `THIRD_PARTY_NOTICES.md`。感谢所有开源贡献者，让 StudyBuddy 硅基同桌成为可能。

## 发起人的话

我不是程序员，也不懂代码。StudyBuddy 硅基同桌源于我对 AI 学习工具的真实需求，并在开源社区和许多帮助下逐步完成。

我选择公开源码，希望更多开发者能够帮助检查、改进和完善这个项目。如果你发现问题，欢迎提交 Issue；如果你愿意参与开发，欢迎通过 Pull Request 与我们一起共创。
