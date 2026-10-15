# 电脑端安装｜Chrome / Edge

[X Capture Studio 首页](../README.md) · [iPhone / iPad 图文教程](INSTALL_STAY.md)

无需 Node.js、npm 或开发环境。提供**手动安装**与**交给 Codex / Claude Code 自动准备**两种方式，使用同一份已确认的 `v1.0.0-rc.7` 安装包。

> **安全边界：** 自动化可以下载、验证文件、解压、保留旧版备份并打开安装说明；普通 Chrome / Edge 正式加载未上架扩展，仍需要使用者在浏览器的扩展管理页确认。脚本不修改系统策略、不关闭安全防护、不接管个人浏览器资料。

## 方式 A：复制给 Codex 或 Claude Code

将以下内容完整复制，粘贴到 **Codex CLI / Claude Code**。只需让它在**你自己的电脑上**操作：

```text
请协助我在当前这台电脑上安装 X Capture Studio 的 Chromium 浏览器扩展。

官方仓库：https://github.com/yuniancong/x-capture-studio
目标：Chrome 或 Microsoft Edge，版本 v1.0.0-rc.7。
安装包必须来自已提交的 GitHub 分支：feature/multimedia-rc7（候选版，下载后必须按下方 SHA-256 严格核对）
文件路径：releases/X-Capture-Studio-Chrome-v1.0.0-rc.7.zip
预期 SHA-256：bdad62a983b5072f69e0640a9195f27b9dcd13c5ac85956c1eceaa2fc473a65b

请直接执行你能够安全执行的步骤，而不只是给我一段操作说明：
1. 检查本机操作系统、Python 3 和 Chrome / Edge 是否已安装；优先使用现有浏览器，不新建浏览器资料目录。
2. 从上方指定的 GitHub 提交下载 ZIP，严格校验 SHA-256；不一致立刻停止，不要尝试绕过校验。
3. 检查压缩包并安全解压到当前用户数据目录下的 XCaptureStudio/extension 文件夹，确认其中含 manifest.json。路径要清楚展示给我。
4. 已有版本不要擅自覆盖：先询问是否升级，确认后备份原目录再替换；不得删除个人浏览器配置或其他扩展。
5. 在浏览器打开 chrome://extensions 或 edge://extensions；如果具备授权的 GUI 操作能力，可以协助进行加载流程，但必须保留我对「开发者模式」「加载已解压的扩展程序」和权限提示的最终确认。不要修改浏览器策略、禁止安全保护或使用不透明的第三方扩展管理工具。
6. 我确认加载后，刷新 x.com 的帖子详情页，检查 X Capture 按钮是否出现。报告最终使用的浏览器、文件路径、扩展版本及核验结果。

禁止使用 curl | bash、远程任意脚本、申请我的 GitHub/浏览器密码、上传 Cookie 或修改其他扩展。
如果没有网络或 GUI 权限，尽可能完成前置步骤，然后只告诉我当前必须手动完成的单个操作。
```

如代理希望使用仓库内置的安装准备脚本，可先检查 [`scripts/prepare_chromium.py`](../scripts/prepare_chromium.py) 内容，再执行：

```bash
python3 scripts/prepare_chromium.py
```

Windows 上可使用 `py -3 scripts/prepare_chromium.py`。该脚本只下载固定版本并校验解压；**不会绕过浏览器的用户授权步骤**。脚本支持 `--dest` 自定义安装目录、`--archive` 使用已下载的 ZIP；如需升级，备份旧版本后显式传入 `--replace`。

## 方式 B：自己安装（约 1 分钟）

1. 下载 [Chrome / Edge rc.7 ZIP](../releases/X-Capture-Studio-Chrome-v1.0.0-rc.7.zip)，解压到一个**以后不会移动或删除**的文件夹。
2. Chrome 地址栏输入 `chrome://extensions`；Edge 输入 `edge://extensions`。
3. 开启**开发者模式**，点**加载已解压的扩展程序**，选择直接包含 `manifest.json` 的目录。
4. 根据浏览器提示确认扩展的站点访问权限，刷新一个 `https://x.com/.../status/...` 帖子详情页。
5. 看见相机 / X Capture 入口，即为安装完成。

![Chrome 官方截图：扩展管理页](https://developer.chrome.com/static/docs/extensions/get-started/tutorial/hello-world/image/BhuKGJaIeLNPW9ehns59NfwqKxF2/BzVElZpUtNE4dueVPSp3.png)

*截图来源：[Chrome Extensions 官方文档](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)；浏览器语言与版本不同，按钮位置可能略有差异。*

## 常见问题

**代理只准备了文件，但浏览器没有出现扩展？** 正常：需要手动加载解压目录。普通个人 Chrome / Edge 不支持由普通网页或提示词无提示静默安装开发者模式扩展。

**升级时扩展不工作？** 保持原目录不移动，覆盖或通过脚本的备份替换流程升级，然后在扩展页点“重新加载”，刷新 X 标签页。关闭旧版扩展的额外副本，避免重复按钮。

**为什么不下载源码直接 npm build？** 普通用户只需要已构建 ZIP，无需安装任何开发依赖。源码编译适合开发者贡献代码时使用。

**这个是 Chrome Web Store 发布版吗？** 不是。当前为 GitHub 源码发布与开发者模式加载，未来如正式上架商店将另行注明。
