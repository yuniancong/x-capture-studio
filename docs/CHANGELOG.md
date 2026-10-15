# 更新记录

## 未发布 · 图片 / 视频素质选择

- 导出栏 1×–4× 上方新增「图片素质」「视频素质」。选项来自已选内容的真实资源：图片显示实际解码尺寸（未载入时为“选择后载入”），视频只列出实际找到的清晰度（页面数据 MP4 与已解析 HLS）。
- 图片素质影响 PNG / PDF 中绘制的图片与文本中的图片链接；所选级别不可用时逐张降级，“默认”保持原行为。
- 视频素质只影响复制/导出文本中的视频链接：输出该清晰度（或其下最接近）的 MP4 与 HLS 子播放流；“最高可用”保持原输出。

## 1.0.0-rc.8 修订 · 桌面视频只得到 /video/1 · 2026-10-16

- 根因（真实已登录桌面 X 复现）：帖子数据改为上层组件的扁平 `props.tweet`，原探针只向下遍历且只认 `legacy` 结构，取不到页面已有的 M3U8/MP4 变体；X 还会清空资源时间线，已播视频重播不再请求清单。
- 探针：浅层读取祖先组件 props，接受扁平帖子/引用帖/作者，仍按帖子 ID 归属；`/vid/avc1/WxH/` 解析尺寸。真实页面：7/7 帖子识别，目标视频得到 master M3U8 + 320/540/720 MP4。
- 被动清单记录：PerformanceObserver 只记本页已请求的 `video.twimg.com` 清单/文件名，仅内存、无权限、不发请求；按 CDN 媒体 ID 唯一归属。
- X fMP4 `/vid|aud/<codec>/<起>/<止>/` 识别为分段；海报渲染参数不同时按媒体 ID 匹配。
- 真实 Chrome for Testing 153 安装发布 ZIP：worker 注册、session/alarms、休眠唤醒、内容脚本注入与隔离世界观察均通过。
- 确定性打包脚本 `scripts/package_release.py`，源码重建字节一致。详见 `docs/VERIFY_VIDEO_RC8.md`。

## 1.0.0-rc.8 · 跨平台发现修复候选

- 桌面可选非阻断式 webRequest 观察 + 有界 session 生命周期 + 当前文档资源时间线补充；唯一媒体身份匹配，歧义不附加。
- 字幕 hint/声明/地址/验证/Cue 证据分层；不把无 URL 的 TextTrack 直接叫内嵌字幕。
- 当前视频内在尺寸与清单变体尺寸分开，HLS master 不被标为 320×320 最高画质。
- 折叠长文尾部文字锚点恢复；位置不明则保留并提示，不把全文堆到所有图片前。
- 新权限：可选 webRequest + 到期清理 alarms；Chrome/Edge 120+；Stay 权限不变。
- main 与 rc.7 远端分支未改动；本候选需真实平台验收，详见 VERIFY_DISCOVERY_RC8.md。


## 1.0.0-rc.7 · 多媒体升级候选 · 2026-10-15

- rc.6 基础上的图片实际校验/降级，多视频资源保留，HLS/DASH/VMAP 及字幕/音轨关联。
- 原位 TXT/Markdown/AI 输出；可选全部资源、Markdown图片，签名链接仅会话授权。
- 有界资源读取/缓存/取消，不扩大宿主权限；Stay新验证native fetch失败时保留观察地址。
- 216项单元/契约与243项本地浏览器检查通过；未作真实iPhone/Stay/live-X验收。
- 当前推送至 `feature/multimedia-rc7` 供审阅；不覆盖已脱敏 `main`。详见 VERIFY_MULTIMEDIA_RC7.md 与 INSTALL_RC7.md。

## 1.0.0-rc.5 · 2026-10-15

文本媒体标注后附可复用链接，图片、视频、引用与 Article 沿用原文位置。图文混排仅在文本投影中使用观察到的 DOM 顺序，不更改 PNG/PDF 视觉排列。图片保留实际地址与查询参数；视频优先使用观察到的媒体文件地址，播放流与原帖播放回退均明确标注，不将封面或临时 Blob 地址冒充媒体链接。

所有复制 / TXT / Markdown / Copy for AI 共用序列化结果。保留原有匿名和字段开关。只同步调整三处媒体说明文案；不改界面布局、样式、选帖、PNG/PDF 或 Stay 注入方式。110 项单元/契约、24 项媒体专项及既有分组回归通过，详见 VERIFY_MEDIA_RC5.md。rc.5 尚未真机复测或写入 GitHub。

## 1.0.0-rc.4 · 2026-09-26

新增跨 Chromium / Safari+Stay 的文本功能：复制纯文本、复制 Markdown、导出 UTF-8 TXT/MD、复制给 AI。工作台新增文本页签、只读全文预览和文本字段开关。共享当前选区/顺序，保留作者/回复关系/来源/引用/Article 结构，默认不加入互动数字和媒体文件地址。

复制无需等待字体/媒体。接口拒绝时提供完整全文、全选与文件保存回退；支持时可系统分享文本文件。匿名规则覆盖文本作者、自动回链和文件名，不静默改写正文。空选区不覆盖剪贴板。文本框内的原生复制与 Tab 焦点得到保护。

PNG/PDF 渲染主线和 Stay 隔离注入规则不变；原有 rc.2/rc.3 安装版保留为回退。两端新候选统一为 rc.4。新增文本单元/契约 29 项、专项浏览器检查 34 项通过；其余回归见 VERIFY_TEXT_RC4.md。新版本尚未进行 iPhone/Safari 原生验收。

## 1.0.0-rc.2 · 2026-09-25

针对用户本轮真实页面截图和 Stay 无入口反馈修订，不改变已批准的单长图 / 单长页文本 PDF、分块卡片及本地处理主线。

### 引用与原貌

修复没有独立 permalink 的引用卡片被丢弃、UserName / User-Name 结构差异、引用作者头像未绘制、显示名错误、handle 粘连时间数字。复用当前可见的认证 SVG 路径，保留图形的 viewBox / 颜色 / 填充规则；不再用圆形文字对勾替代。只读补充页面中已有的引用关系数据，不请求隐藏接口。主帖与引用帖的作者、正文和媒体独立取值。当前可见翻译优先，不用英文原文静默覆盖。

可读取时保留多图原始裁切与组合比例；优先捕捉可读取的视频当前帧，不可读取时退回海报封面。PNG / PDF 共用同一布局与路径。

### 背景

15 个快速背景、自定义纯色 / 渐变 / 透明、网格 / 圆点。新增本地图片 / 壁纸导入、位置、适配、柔化与压暗，预设可带背景图。仅背景副本做体积优化，不改变正文倍率。没有自动读取 macOS 系统桌面壁纸。

### Stay

独立带文字的悬浮入口和自检，编辑器延迟初始化；处理 DOM 未就绪、旧版标记、入口被删除、body 被替换、重复注入、部分观察器缺失、GM 菜单异常、GM 读取挂起等情况。脚本根域 / www / mobile 的 X 和 Twitter 地址匹配补齐。设置读取挂起时超时回退，不能让入口打开无限等待。

### 来源

PNG 增加标准 Source / Description 字段，保留 SourceURL、Sources、XCapture、XMP；PDF 保留来源与可点击链接。只使用有效的帖子或 Article 链接，不使用首页兜底。引用链接另存。导出结果可直接打开原帖。

Finder 的来源属性由下载浏览器 / macOS 管理，不在网页脚本权限内；提供可选的本地单次辅助工具，确认后只更新单个文件的 WhereFroms 属性。PNG/PDF 内部元数据已验证，macOS 原生写入未实机验证。

### 验证与剩余限制

59 项单元 / 契约、50 项既有浏览器 / 文件回读、54 项本轮专项检查通过。合成页面的生产 userscript 已实际执行；不代表真实 X 各布局、已安装 Chrome 扩展或 iOS Stay 真机验收。完整逐项结果见 QA。

## 2026-10-15 · Open-source / onboarding docs (runtime remains rc.5)

- Add project MIT License and preserve third-party notices.
- Add verified and bounded Python 3 Chromium extension preparation helper; pinned rc.5 archive and SHA-256.
- Add copyable Codex / Claude Code installation prompt and a manual installation guide.
- Add screenshot-assisted Safari + Stay user guide using developer-published App Store **historical** image links (not re-licensed).
- Add responsive standalone installation center `docs/install.html`, with copy-prompt and guided steps.
- No browser extension runtime, Stay userscript runtime, or rc.5 release-archive changes in this documentation update.
