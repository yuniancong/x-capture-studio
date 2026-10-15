# X Capture Studio · rc.5

把 X / Twitter 主帖、作者串、长文及手动选中的回复背景，保存为高清长图、文本型 PDF、纯文本或 Markdown。支持 Chromium 浏览器扩展和 Safari + Stay 用户脚本；本地处理，无强制水印。

## 本轮变更：媒体链接原位输出

图片、视频在文本原来的位置附对应资源链接；正文、作者、时间、选区、PNG/PDF、背景和 Stay 启动方式保持原规则。视频缺少可复用直链时明确输出其原帖播放链接，绝不把封面或 Blob 地址当作视频文件。

## 文本功能

打开 Capture Studio → **文本**。

- 底部 **复制文本**：快速复制当前选中的内容，默认纯文本。
- 文本页签选择 **纯文本 / Markdown**，分别复制或导出 `.txt` / `.md`。
- **复制给 AI**：结构化 Markdown + 简短的选择/加载范围说明。

选区、顺序、主帖/回复/引用角色和原帖链接保持一致；保留已获取的 Article 章节、列表与代码。提供字段开关，匿名规则与工作台共享。复制受限时保留可手动选择的全文及文件保存入口。

![文本工具](docs/assets/text-export-desktop.png)

## 安装 / 更新

当前安装产物为 `X-Capture-Studio-Chrome-v1.0.0-rc.5.zip` 和 `X-Capture-Studio-Stay-v1.0.0-rc.5.user.js`，在交付中单独提供。

**Chromium：**解压安装包，在 `chrome://extensions` 开发者模式加载包含 `manifest.json` 的目录；更新已有版本时替换原扩展目录中的文件、重新加载扩展并刷新 X 页面。不要把源码目录当成已构建扩展目录。

**Safari + Stay：**停用旧脚本，导入/更新 rc.5 并启用，回到 Safari 的 X 页面完整刷新。目标仍为 Safari + Stay，不是 X 原生 App。保留原有六个 X/Twitter 域名范围、独立入口和自检。

## 开发 / 构建

要求 Node.js 20+。只有固定版本 TypeScript 作为开发依赖；已附固定第三方 JavaScript 引擎及其许可，无字体文件。

```sh
npm install
npm run typecheck
npm run build
npm test
```

输出：`dist/extension/`、`dist/X-Capture-Studio.user.js`、`dist/X-Capture-Studio-Demo.html`。构建不会自动提交、上传或发布。

## 状态

当前源码基线：`v1.0.0-rc.5`，以 GitHub `main` 的实际 commit 为准。基于已确认正常使用的 rc.4 开发，仅调整文本媒体原位链接；rc.4 仍可回退。rc.5 的真实 X / Safari+Stay 真机回归尚待完整验证。

类型检查、构建、110 项单元/契约测试通过；媒体链接专项 24 项、文本交互回归 34 项、Stay 启动模拟 39 项、既有浏览器/文件回读 50 项、引用与背景专项 54 项通过。测试使用合成页面、Chromium 和记录型适配器，不冒充真实 Safari/Stay 或真实 X 页面验收。

- [文本功能与规则](docs/TEXT_EXPORT.md)
- [本轮验证与限制](docs/VERIFY_MEDIA_RC5.md)
- [版本矩阵](docs/RELEASE_MATRIX.md)
- [变更记录](docs/CHANGELOG.md)
- [隐私说明](docs/PRIVACY.md)
- [代码来源清单](docs/SOURCE_MANIFEST.md)

本项目自身未新增开源许可。第三方许可证保留在 `vendor/THIRD_PARTY_NOTICES.md`。
