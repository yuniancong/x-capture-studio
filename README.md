# X Capture Studio · rc.4

把 X / Twitter 主帖、作者串、长文及手动选中的回复背景，保存为高清长图、文本型 PDF、纯文本或 Markdown。支持 Chromium 浏览器扩展和 Safari + Stay 用户脚本；本地处理，无强制水印。

## 新增文本功能

打开 Capture Studio → **文本**。

- 底部 **复制文本**：快速复制当前选中的内容，默认纯文本。
- 文本页签选择 **纯文本 / Markdown**，分别复制或导出 `.txt` / `.md`。
- **复制给 AI**：结构化 Markdown + 简短的选择/加载范围说明。

选区、顺序、主帖/回复/引用角色和原帖链接保持一致；保留已获取的 Article 章节、列表与代码。提供字段开关，匿名规则与工作台共享。复制受限时保留可手动选择的全文及文件保存入口。

## 安装 / 更新

当前源码版本为 **1.0.0-rc.4**。仓库中的 `releases/` 继续保留 Chromium rc.2 与 Stay rc.3 预构建文件作为历史回退；rc.4 可由当前源码直接构建。

**Chromium：**运行 `npm run build` 后，在 `chrome://extensions` 开发者模式加载 `dist/extension/`。更新已有版本时替换原扩展目录中的文件、重新加载扩展并刷新 X 页面。

**Safari + Stay：**运行 `npm run build` 后导入 `dist/X-Capture-Studio.user.js`，启用后回到 Safari 的 X 页面完整刷新。目标仍为 Safari + Stay，不是 X 原生 App。保留原有六个 X/Twitter 域名范围、独立入口和自检。

> 本轮通过对话交付的 rc.4 预构建包已经过用户实际试用；GitHub 当前提交以源码和可重现构建为准，旧预构建包保留用于回退。

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

当前仓库推荐源码版本：Chromium 与 Safari + Stay 均为 **1.0.0-rc.4**；旧 Chromium rc.2 与 Stay rc.3 保留在 `releases/` 作为历史回退。2026-09-26 用户完成实际试用并反馈 rc.4 未发现问题；该反馈记录为用户验收结果，不替代更广泛的浏览器 / iOS 兼容性测试。

类型检查、构建、88 项单元/契约测试通过；另有 50 / 54 / 39 / 34 项分组回归通过。浏览器测试使用离线合成页面及明确的适配器，不等同于穷尽真实 X、Safari/Stay、系统剪贴板或 iOS 分享面板场景。

- [文本功能与规则](docs/TEXT_EXPORT.md)
- [本轮验证与限制](docs/VERIFY_TEXT_RC4.md)
- [版本矩阵](docs/RELEASE_MATRIX.md)
- [变更记录](docs/CHANGELOG.md)
- [隐私说明](docs/PRIVACY.md)

本项目自身未新增开源许可。第三方许可证保留在 `vendor/THIRD_PARTY_NOTICES.md`。
