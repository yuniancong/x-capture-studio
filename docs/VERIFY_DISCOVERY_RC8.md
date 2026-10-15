# rc.8 验证记录

状态：GENERATED / LOCAL_TESTS_PASSED / REAL_PLATFORM_PENDING / NOT_WRITTEN_TO_EXTERNAL_SYSTEM。

## 基线与版本

公开 GitHub rc.7：`feature/multimedia-rc7` / `d89729b4f4dcf1d9f333c5c7dc54c5dfbd54c0e1`。main 仍为已脱敏的 `026378947da2753f3f3dc2b3e9a84edf261619b8`。本轮没有任何远端写入、强推或历史重写。构建版本为 `1.0.0-rc.8`，Manifest 数字版本 `1.0.0.8`。

## 失败先行

实际保留的 red 日志对应：
1. HLS 当前播放尺寸错误写入清单质量；空 TextTrack 被当成内嵌字幕。
2. 尚无有界观察账本和可靠资源关联。
3. 旧版展开正文会把媒体放到全文后；缺少锚点算法。
4. 观察桥接失败会令检查挂在 starting 状态。
5. 内联尾部媒体位置不明时不应直接用全文替换。
6. 同一 HLS root 从网络发现与清单解析重复入库。

修复后对应测试以及原有测试全部通过。不是使用同一实现计算期望值；时间/Chrome/GM/HTTP 属外部边界，使用固定、独立预期。

## 执行结果

| 套件 | 实际结果 |
|---|---:|
| TypeScript 类型检查 | PASS |
| Chromium + Stay + Demo 构建 | PASS |
| 原有核心单元/契约 | 59/59 |
| 原有文本单元/契约 | 51/51 |
| 原有高清链接契约 | 34/34 |
| 原有多媒体单元/契约 | 72/72 |
| 新增 rc.8 发现、归属、生命周期、证据、长文及 worker 无 DOM 初始化 | 49/49 |
| 原有 PNG/PDF/浏览器文件回读 | 50/50 |
| 原有引用/背景/隐私/Finder 模拟 | 54/54 |
| 原有文本 UI/复制/文件 | 34/34 |
| 原有高清链接 UI | 29/29 |
| 原有媒体链接 UI | 24/24 |
| 原有多媒体 UI | 53/53 |
| 新增生产 bundle 观察链路、双端 UI、文件、权限页 | 40/40 |

合计 **265 项单元/契约、284 项浏览器及文件检查**。原有六套浏览器检查本轮实际相加为 244 项（不是先前汇总口径的 243），再加新增 40 项。

这些计数只代表实际运行的断言，不表示全部真实平台情况都覆盖。

浏览器环境：Playwright + 系统 Chromium，桌面 1480×1000、Stay 390×844 触摸视口（旧套件使用各自既定视口）。未提供 Browser 插件，使用 Playwright。新套件执行真实构建的 `background.js`、`content.js` 及 Stay userscript；Chrome/GM/剪贴板和网络事件/请求使用明确的测试适配器。不是浏览器原生 webRequest 的实机证明。

新流程测试：Blob currentSrc / 无 React 变体 → 拒绝权限基础导出仍可用 → 扩展权限页调用授权 → 主动观察 → 隐藏工作台、点击底层页面播放按钮 → 控制的 Chrome 请求事件经过生产 background 监听器 → 唯一媒体归属 → 返回、清单解析 → MP4+HLS 共存 → TXT/MD 真正下载并读取字节。混入的其他视频预载只计为待确认，不进入选中视频。

另检查：空字幕只作 hint、主清单无虚假 320×320 固定画质、原位图文顺序、无异常、无横向溢出、诊断不含来源 URL/账号、会话停止清理、手机不显示 Chrome 专属权限项、原有 HLS 能力保留。

## Standards Review

本轮新增模块未发现阻塞性静态问题：最小目标域名、非阻断请求观察、只投影 Content-Type、不保存全头/凭据、TTL 和清理、跨 tab/document/选区隔离、后台同步注册、session 恢复、并发操作串行、可取消前台等待、未知归属不强行挂接。

遗留/边界：网络请求观察仅支持顶层 X 文档到 video.twimg.com；worker/子框架未知来源不自动附加；缓存可能不发事件；歧义候选仅显示数量。旧安装脚本与旧文档保持为历史基线，不被悄悄替换为未发布 rc.8。

## Spec Review

四项代码修订均落地，并有失败先行和生产构建的本地集成证据。继承 rc.7 的高清图片降级、多变体/HLS/DASH/音轨字幕、图文位置、PNG/PDF/选择/背景/文本能力。位置无法确认时保留可见块和警告，**不是保证所有折叠正文都能恢复**。

远端提交阶段为 BLOCKED：本轮发现的 GitHub 工具只有读取操作，create/update 查询无写入动作；本机连接器也未提供执行命令接口。插件搜索只返回已安装的 GitHub，不增加写入能力。已提供可应用补丁和源码，未虚构远端分支/Commit/PR。

## 真实平台单独判定

- 实际 unpacked MV3 启动烟测：在新 Chromium profile 载入生产扩展，12 秒未取得 serviceworker，记录 **BLOCKED**；没有通过关闭环境管理策略来绕过。
- Node worker-like 全局中运行真实 background bundle（没有 window/document）通过，只能证明启动代码不依赖 DOM，不能替代真实 MV3 安装。
- 用户的 Cat Kingdom 真实帖子：本轮未取得其真实 Chrome 网络采集，不宣称已抓到该视频 M3U8。
- iPhone Safari/Stay 原生导入、权限、播放器、系统剪贴板与分享：**NOT_RUN**。
- 原生可选权限提示框：本轮只验证 extension-page 调用时机/拒绝/允许的接口边界，不伪装为真实系统确认。

## 可重跑

```bash
npm install
npm run typecheck
npm run build
npm test
python tests/discovery_qa.py
python tests/multimedia_qa.py
python tests/hd_links_qa.py
python tests/media_links_qa.py
python tests/text_export_qa.py
XC_TEST_FONT=/path/to/licensed-cjk.otf python tests/browser_qa.py
XC_TEST_FONT=/path/to/licensed-cjk.otf python tests/rc2_regression.py
```

Python 需 Playwright、Pillow、PyMuPDF；旧套件另需合法可嵌入的测试字体，不随包分发。XC_BROWSER 可指定 Chromium；各套件输出目录环境变量见脚本头。本轮将文本 QA 改用统一 content_world_harness，避免依赖历史一次性启动脚本。原仓库的历史文件不删改。

源码包是可重新构建的快照，不是含完整 Git 历史的镜像。rc.7 存档与远端不一致的三份旧验证/文本说明和一次性 stay_startup_qa.py 不收入新源码包，也不在补丁中覆盖；使用精确限定路径的补丁升级远端。运行时代码、构建文件、活跃测试完整保留。

最终安装包必须通过 CRC、版本、SHA-256 和源码解压后重建字节比较；其实际结果写入交付 receipt，不以本说明的文字替代检查。
