# iPhone / iPad 图文安装教程｜Safari + Stay

[X Capture Studio 首页](../README.md) · [电脑端安装](INSTALL_DESKTOP.md)

**目标：** 在 iPhone 或 iPad 的 **Safari 浏览器**中运行 X Capture Studio。不要在 X 原生 App 内寻找扩展按钮；Stay 是 Safari 用户脚本管理器。

> 图像说明：下方 Stay 页面图片来自开发者提交到 Apple App Store 的**官方历史展示图**，用于帮助识别“资料库”“+”和 Safari 脚本面板。它们展示的是早期界面，不代表 2026 年版本所有按钮位置完全一致。操作路径以 [Stay 官方 README](https://github.com/shenruisi/Stay#readme) 与 [Apple 官方 Safari 扩展说明](https://support.apple.com/zh-cn/guide/iphone/iphab0432bf6/ios) 为准。图片通过 Apple 图片服务的原始地址引用，不属于本项目开源许可证。

## 第 1 步｜安装 Stay

1. 在 iPhone / iPad 打开 [**Stay for Safari 的 App Store 官方页面**](https://apps.apple.com/cn/app/id1591620171)。
2. 点击“获取”或下载按钮，安装并打开 Stay。
3. 无需为了运行脚本而先登录其他开发服务；如 Stay 提供本地模式，可按你的偏好使用。

**确认结果：** 桌面出现 Stay，打开后能看到脚本管理界面。

## 第 2 步｜在 Safari 中启用 Stay

**iOS 18 / 旧路径：** `设置 → Safari 浏览器 → 扩展 → Stay`。

**iOS 26 / 27 等较新系统：** `设置 → App → Safari 浏览器 → 扩展 → Stay`。找到“允许扩展”并打开；在允许的网站列表中，至少对 `x.com` / `twitter.com` 设置允许，若按 Stay 官方推荐启用“所有网站”，请自行审阅权限范围。

如使用 Safari 的网站菜单，也可以在当前 X 网页上打开“页面菜单 → 管理扩展”，核查 Stay 是否已启用。

**确认结果：** Stay 处于“允许扩展”状态且有访问 X 网站的权限。

## 第 3 步｜将脚本下载到“文件”App

请在 Safari 打开以下链接，并保存 `.user.js` 文件：

[**下载 X Capture Studio · Stay v1.0.0-rc.5**](../releases/X-Capture-Studio-Stay-v1.0.0-rc.5.user.js)

如果 Safari 打开的是 JavaScript 纯文本页面而不是下载文件，请从 GitHub 文件页面选择“下载原始文件”，或保存到 iPhone / iPad 的 **“文件” App**。请确认文件扩展名仍为 `.user.js`（不是 `.txt` 或 `.html`）。

## 第 4 步｜在 Stay 的资料库中导入脚本

打开 **Stay → 资料库（Library）**，找到右上角 **“+”** 或当前版本对应的“添加脚本”入口，选择**从本地文件导入**，再在“文件”选择刚才下载的 `.user.js`。

<img src="https://is3-ssl.mzstatic.com/image/thumb/PurpleSource112/v4/cd/e0/44/cde0440d-dd4a-2c44-ca9d-d5fce9761aec/84222a56-50f9-489c-a3b0-8c763ee712bc_2.3.x-screenshot5.5-cn1.png/392x696bb.png" alt="Stay 官方历史 App Store 展示图：资料库和右上角的新增脚本按钮" width="290" />

*官方历史截图：资料库界面，右上角紫色“+”用于添加脚本；不同 Stay 版本可能改名或调整布局。图源：Stay 在 Apple App Store 发布的产品图片。*

**确认结果：** 资料库中能找到 **X Capture Studio**，脚本信息里包含 `x.com` / `twitter.com` 的匹配规则。

## 第 5 步｜激活脚本

在资料库里打开 **X Capture Studio**，把状态设为“激活 / 启用 / Running”（以 Stay 当前显示为准）。如果安装了 rc.4 或更旧版本，请先**停用旧脚本**，避免重复注入。

<img src="https://is2-ssl.mzstatic.com/image/thumb/PurpleSource122/v4/72/aa/66/72aa6670-37e5-67b1-9bec-5aaf4d1e203f/c98e2adb-d5d9-4a97-8929-c5d104083bcf_2.3.x-screenshot5.5-cn4.png/392x696bb.png" alt="Stay 官方历史 App Store 展示图：Safari 中查看运行或停止的脚本" width="290" />

*官方历史截图：Safari 中 Stay 脚本管理面板展示 Running / Stopped 状态，可用于理解启用状态，具体控件请以当前版本为准。*

**确认结果：** 该脚本处于已激活状态。

## 第 6 步｜打开 X，检查按钮

1. 切回 **Safari**（不是 X App）。
2. 访问 [x.com](https://x.com/) 并打开一条帖子的**详情页**。
3. 完整刷新页面，等待正文显示。
4. 页面右下方应出现 **“X Capture / ?”** 悬浮入口；部分帖子操作栏内也有相机图标。
5. 点击入口，出现可编辑的 X Capture Studio 工作台即可使用 PNG、PDF 和文本导出。

**确认结果：** 编辑器能打开并列出当前页面的已加载帖子候选。

## 如果按钮没有出现

- 在 Safari 当前 X 页面检查 **Stay 已允许访问此网站**；不是仅在“设置”里开启了总开关。
- 在 Stay 资料库确认脚本 **已激活**，版本为 rc.5，且没有另一个旧版同时运行。
- 返回 Safari 完整刷新；如仍无入口，在 Safari 的 Stay 扩展面板中查看脚本匹配、运行状态和日志。
- 如果面板显示“未匹配”，确认正在访问 `https://x.com/` 或 `https://twitter.com/`，而不是 `X` 原生 App 或站外镜像。
- 可将 Stay 面板的脚本状态和日志截图发到 [GitHub Issues](https://github.com/yuniancong/x-capture-studio/issues)，请不要附上 Cookie、Token、个人私信或浏览器凭证。

## 截图、来源及版权

- 操作路径：[Stay 官方项目 README](https://github.com/shenruisi/Stay)、[Apple 官方 Safari 扩展帮助](https://support.apple.com/zh-cn/guide/iphone/iphab0432bf6/ios)。
- Stay 的两张图片来自 **Apple App Store 中开发者发布的早期产品展示图**；本仓库不存放其副本，也不声称图片属本项目版权所有。
- 这些截图只是操作定位参考；具体选项可能随 Stay 和 iOS 更新。若步骤不符，优先检查官方文档与当前屏幕的同义入口。
