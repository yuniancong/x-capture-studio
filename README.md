# X Capture Studio

> **v1.0.0-rc.7 多媒体升级候选。** 已提交到升级分支供安装测试和审查，rc.5 安装包保留为回退；真实 X 与 Safari＋Stay 真机尚待验收。阅读 [rc.7 安装与使用说明](INSTALL_RC7.md)。

**A local-first, high-fidelity X / Twitter capture tool for Chromium and Safari + Stay.**

把主帖、作者连续帖、长文、引用帖和手动选中的回复，保存为可调样式的高清 PNG 长图、真实文本 PDF、TXT 或 Markdown。保留原帖链接与所选择的上下文；本地处理，无强制水印。

![X Capture Studio 实际工作台（虚构演示数据）](docs/assets/capture-studio-preview.png)

## 开始使用｜选择平台

| 平台 | 安装入口 | 安装文件 |
|---|---|---|
| **电脑 · Chrome / Edge** | **[复制给 Codex / Claude Code 的安装 Prompt](docs/INSTALL_DESKTOP.md)** | [Chromium v1.0.0-rc.7 ZIP](releases/X-Capture-Studio-Chrome-v1.0.0-rc.7.zip) |
| **手机 · iPhone / iPad Safari + Stay** | **[配官方截图的逐步安装教程](docs/INSTALL_STAY.md)** | [Stay v1.0.0-rc.7 user.js](releases/X-Capture-Studio-Stay-v1.0.0-rc.7.user.js) |

**[图文安装中心（独立网页）](docs/install.html)**：电脑端内置**复制 AI 安装指令**；手机端提供带 Stay 官方 App Store 历史截图的分步说明。也可直接打开 HTML 文件查看；如将仓库 `docs/` 启用 GitHub Pages，安装页可直接线上访问。

### 电脑端可以自动完成什么？

向 Codex / Claude Code 发送 [安装 Prompt](docs/INSTALL_DESKTOP.md)，它将检查浏览器、下载指定安装包、验证 SHA-256、解压并指出稳定路径；如代理具有被允许的图形界面操作权限，也可帮你打开扩展管理页。**开发者模式、加载已解压的扩展程序和访问权限仍需用户在浏览器中确认**；不会用脚本绕过 Chrome/Edge 安全限制。

### 手机版安装概要

1. 在 [App Store 安装 Stay](https://apps.apple.com/cn/app/id1591620171)。
2. 在系统设置中开启 Safari 的 Stay 扩展，并允许它访问 X / Twitter。
3. 下载 `.user.js`，在 Stay **资料库 → 添加脚本 → 本地文件**中导入。
4. 激活脚本；使用 Safari 打开 X 帖子详情页并刷新。
5. 出现 **X Capture / ?** 悬浮按钮后就能截图、复制文本或导出 PDF。

<img width="190" alt="Stay 官方历史 App Store 示例：资料库与新增入口" src="https://is3-ssl.mzstatic.com/image/thumb/PurpleSource112/v4/cd/e0/44/cde0440d-dd4a-2c44-ca9d-d5fce9761aec/84222a56-50f9-489c-a3b0-8c763ee712bc_2.3.x-screenshot5.5-cn1.png/392x696bb.png" />

*Stay 开发者在 Apple App Store 发布的历史展示图，版权归原权利人；用于识别界面，当前按钮位置可能不同。详见 [完整图文教程](docs/INSTALL_STAY.md)。*

## 功能

- **选择内容**：Single / Thread / Select，自由选择原帖、作者续帖、直接回复及其他已加载上下文。
- **真实引用关系**：Quote、作者、发布时间、来源和媒体保持准确；不冒充未加载的回复已完整采集。
- **高保真可调样式**：X 原貌、分块卡片、文档；背景、渐变、纹理、导入本地图片／桌面壁纸原图、字体、间距、圆角、角色样式等参数。
- **PNG / PDF**：默认单张长图及单页长 PDF，PNG 支持 1×–4×；PDF 在支持的内容中保留可复制搜索的文字。
- **Text Export**：复制纯文本 / Markdown / Copy for AI，导出 `.txt` / `.md`；媒体按原位置附真实图片资源链接，视频优先媒体链接，不可获取时标明“原帖播放链接”。
- **本地处理**：无登录、无广告、无强制水印；媒体解析不足会给出提示。

![文本与 Markdown 面板（虚构演示数据）](docs/assets/text-export-desktop.png)

## 从源码构建

需要 Node.js 20+，开发者使用：

```bash
npm install
npm run typecheck
npm run build
npm test
```

构建输出位于 `dist/extension/` 和 `dist/X-Capture-Studio.user.js`。普通安装无需 Node.js，直接使用已构建的 `releases/` 安装文件。

## 版本与兼容

当前升级候选安装产物均为 **v1.0.0-rc.7**；rc.5 仍可作为历史回退。电脑通过加载已解压的 Chromium Manifest V3 扩展使用；iPhone/iPad 通过 Safari + Stay userscript 使用。**这不是 Chrome Web Store 上架版本**，也不能在 X 原生 App 内使用。正文及媒体仅覆盖已经加载并且能够取得的数据。

本次只新增面向公开使用的安装指南、AI 安装准备脚本和许可证；**未改动 rc.5 浏览器插件与 Stay 可执行代码**。运行本地测试不等于覆盖所有真实 X 布局或 iOS Stay 设备。

相关文件：[安装桌面端](docs/INSTALL_DESKTOP.md) · [Stay 图文教程](docs/INSTALL_STAY.md) · [变更记录](docs/CHANGELOG.md) · [隐私与权限](docs/PRIVACY.md) · [测试与限制](docs/VERIFY_MEDIA_RC5.md)

## 开源许可

项目自有源码和文档采用 [**MIT License**](LICENSE)。第三方依赖及其各自许可见 [Third-party notices](vendor/THIRD_PARTY_NOTICES.md)。Apple/Stay 产品截图及 X 用户内容属于各自权利人，不在项目 MIT 授权范围内。任何功能不代表 X、Apple、Stay 或 Chrome 的官方背书。

欢迎通过 Issues 报告 X 页面解析兼容问题；**请勿上传私信、Cookie、Token 或其他敏感截图**。
