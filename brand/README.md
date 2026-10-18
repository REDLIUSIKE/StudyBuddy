# StudyBuddy 品牌资产

此独立开发项目沿用现有 StudyBuddy 绿色 B 形硅宝及角色化字标。原始 v1 派生资源保留；本次适配资产由内置 image_gen 编辑既有品牌生成，使用真实透明背景。

- 侧栏及登录字标原图：`derived/studybuddy-desktop-sidebar-wordmark-transparent-v4.png`。沿用现有字形与角色，简化细碎高光与毛边。展开侧栏只显示完整字标中的一个 B；收起轨道保留独立硅宝。
- 显示资源：`derived/sidebar-wordmark-v4-{1,2,3,4}x.png`。`scripts/prepare-wordmark.mjs` 去除接近透明的多余外边距并以 Lanczos3 缩放，保留透明度和完整图案。侧栏框为 160 × 36 px、按钮高 38 px，Windows 外层品牌行高 40 px；登录页字标框为 320 × 72 px。
- 应用图标及 favicon：`derived/studybuddy-app-icon-transparent-v2.png`。按用户明确要求仅保留硅宝角色，没有底板、边框或背景；B 形开孔也透明。
- Windows 托盘图标：`apps/desktop/resources/tray-windows.ico`。`apps/desktop/scripts/render-tray-icon.ts` 复用与上述原图字节一致的 `resources/icon-windows.png`，分别生成 16、20、24、32、40、48、64 px 的透明位图，供 Windows 按显示缩放选用；打包时复制为 `resources/tray.ico`。
- 侧栏独立标志及会话欢迎标志继续使用 `derived/studybuddy-guibao-mark-transparent-v1.png` 的原资产。
- 生图最终提示词、工具模式及资源引用：`derived/studybuddy-ui-assets-v4.json`。散列与全部复制字节的核对见 `output/ui-refinements-2026-10-11/asset-integrity.json`。

本项目没有原 StudyBuddy 的 `brand:check` 命令；本轮以资源逐字节核对、Electron alpha 检查和实际品牌区域渲染验证这些派生资产。
