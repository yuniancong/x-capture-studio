# rc.4 验证记录

日期：2026-09-26。基线：GitHub main `b31ac3ab864ae481b09b1dc595d0a0a83fb70071`，Chromium 安装基线 rc.2、Stay 安装基线 rc.3。
本轮先在基线副本完成实现与测试，用户实际试用确认未发现问题后，再将 rc.4 源码和文档同步到 GitHub main。本文件保留测试时的原始基线，便于区分“开发起点”和“当前 main”。

## 结果

| 检查 | 结果 |
|---|---|
| TypeScript 5.8.3 typecheck | PASS |
| Chromium / Stay / demo 构建 | PASS |
| 原有单元/契约测试 | 59 / 59 |
| 新增文本序列化测试 | 29 / 29 |
| 既有浏览器与 PNG/PDF 回读 | 50 / 50 |
| rc.2 引用、背景、宿主与 Finder helper 回归 | 54 / 54 |
| Stay 公共注入规则与启动模拟 | 39 / 39 |
| 文本 UI、文件与复制/分享适配专项 | 34 / 34 |

测试分组存在重叠，不将总和称为独立用户场景数量。文本核心最初 27 项在入口尚不存在时全部失败，实施后通过；追加换行和超大代码块两项后共 29 项。

## 真实执行了什么

使用 Node 22.16.0、TypeScript 5.8.3、Chromium 144.0.7559.96 与 Python Playwright。Browser 插件/skill 未提供，因此使用 Playwright。
浏览器测试读取当前构建产物、合成 DOM 与虚构帖子；文件导出是真实 Blob/下载，并回读实际 UTF-8 字节，与原内容及选区核对。PNG/PDF 用 Pillow/PyMuPDF 独立检查。

测试环境对 X 和 localhost 的页面导航均返回 ERR_BLOCKED_BY_ADMINISTRATOR。没有更改浏览器管理策略，也没有访问真实 X 账号。后续使用既有 set_content 本地测试方式；复制接口、存储、GM 和系统分享为明确的记录型/失败型适配器，不把自动化结果冒充系统剪贴板、原生分享面板、Safari/Stay 二进制或所有真实 X 页面布局。

Stay 专项执行实际分发 userscript，在 Chromium CDP 隔离环境中验证入口、每帖按钮、菜单、选中回复、PNG以及文本导出。复制/分享记录确认调用发生于真实 tap 的 user activation 内。也验证剪贴板拒绝后全文仍可全选、手动复制并保存。

## 测试修订

旧 Stay harness 等待编辑器容器后立即读取 canvas 数量，会在下一帧绘制前误判。这与之前记录的 rc.3 模拟测试问题一致。本轮复现后，在同一断言前显式等待首个预览 canvas；未删断言、未放宽结果条件，超时仍失败。补充后 39 项通过。

## 视觉核对

对照既有 rc.2 运行图与新运行图：保留工作台两栏、深色界面、紫色背景和独立白色卡片、原有图像/PDF导出按钮、字号层次与控件风格。五个核对点为布局、配色、卡片绘制、文字/控件尺寸、底部操作区。增加文本页签及文本工具属于已批准的功能变化；手机在文本页签把图像预览调整为较短区域，为文本操作留出空间。

检查 1476×1023 桌面和 390×844 触摸视口，无横向溢出；手机主要文本按钮至少 44px。自动化环境未直接运行真实 iPhone/Safari；2026-09-26 用户随后完成实际试用并反馈本版未发现问题。

## 复现

```sh
npm install
npm run typecheck
npm run build
npm test
XC_BROWSER=/path/to/chromium XC_TEXT_QA_DIR=/tmp/xc-text python tests/text_export_qa.py
XC_OLD_SCRIPT=/path/to/rc2.user.js XC_BROWSER=/path/to/chromium XC_QA_OUT=/tmp/xc-stay python tests/stay_startup_qa.py
XC_TEST_FONT=/path/to/embeddable-cjk-font XC_BROWSER=/path/to/chromium XC_QA_DIR=/tmp/xc-browser python tests/browser_qa.py
XC_TEST_FONT=/path/to/embeddable-cjk-font XC_BROWSER=/path/to/chromium XC_QA_DIR=/tmp/xc-rc2 python tests/rc2_regression.py
```

PDF 测试字体只用于本地测试，不包含在源码/安装包中。QA 目录保留本轮完整通过的 JSON 结果和日志；无真实帖子、凭证或字体文件。

## API 依据

- WebKit Async Clipboard API：https://webkit.org/blog/10855/async-clipboard-api/ （点击/触摸手势、写入失败处理）
- MDN Navigator.share：https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share （文件能力检测、用户激活与取消）

源码状态：GENERATED、TYPECHECK_PASS、LOCAL_TESTS_PASS；用户实际试用：USER_REPORTED_PASS（2026-09-26）；GitHub：WRITTEN_TO_MAIN。本记录不替代广泛兼容性测试。
