# rc.8 修订 · 真实环境验证与 8 项遗留问题结论

日期：2026-10-16。分支：`feat/rc8-video-discovery`（基于 `feature/multimedia-rc7` / `d89729b`）。
提交顺序：先原样提交 `updates/rc8.patch` 作为 rc.8 基线，再单独提交本修订，便于审阅差异。

## 用户实际问题：桌面 X 只输出 `/video/1`

**根因（真实页面复现，不是推测）**：用户真实 Chrome 中已运行 rc.8（页面上按钮版本 `1.0.0-rc.8`）。已登录桌面 X 当前：

1. 把帖子数据作为 **上层 React 组件** 的 `props.tweet` 传入（从 `<article>` 向上第 11 层），而且是 **扁平结构**（`id_str` / `full_text` / `extended_entities` 在顶层，没有 `legacy`，作者在 `user.screen_name`）。rc.8 的 `pageProbe` 只向下遍历（跳过 `return`），且只接受 `legacy` 形态 → 找不到任何帖子 → 视频只能回退为 `/video/1`。
2. 页面会清空 Performance 资源时间线（加载后 2 条，滚动后 0 条），rc.8 的“回读最近 120 秒时间线”实际拿不到清单。
3. 视频 `<video>` 为 `blob:`（MSE），DOM 中没有文件地址。
4. 对已加载的视频，在开启 30 秒观察后重播只请求分片，不重新请求 `.m3u8`，因此 webRequest 会话可能为空。

**修复（不重写媒体系统）**：

- `probe.ts`：先以浅层（深度上限）读取祖先组件 props，再沿用原有向下遍历；接受扁平帖子、扁平引用帖及其作者；结果仍按帖子 ID 归属；`/vid/avc1/WxH/` 路径解析尺寸。
- `passive-log.ts`：内容脚本 / Stay 脚本加载后，用带 `buffered` 的 PerformanceObserver 被动记录本页已请求的 `video.twimg.com` 清单/文件名称（上限 160、不含分片、仅内存）。导出时只按 CDN 媒体 ID 唯一归属附加；无需权限、不发请求。
- `resources.ts`：X fMP4 的 `/vid|aud/<codec>/<起>/<止>/…mp4` 为初始化/分段，不再当作可下载 MP4。
- `media-links.ts`：海报渲染参数不同（`?format=webp&name=medium` 与 `.jpg`）时，按相同 CDN 媒体 ID 唯一匹配页面数据。

**真实页面结果**（`docs/qa-rc8/real-x-evidence.json`）：在用户已登录 Chrome 的目标帖页面中执行修订后的 probe：7 条帖子全部识别（修订前 0），目标视频得到 master `.m3u8` 与 320/540/720 三档 MP4，最大 MP4 作为直链，耗时 6 ms，输出不含 token/cookie。与用户 Safari+Stay 地址同一媒体 ID、同一播放清单（Chrome 无 `&variant_version=1`）。真实 master 清单（HTTP 200）用发布版解析器解析出 3 档视频（含 CODECS/码率）和 3 组音轨。

## 8 项结论

| # | 项目 | 结论 | 证据 / 未完成部分 |
|---|---|---|---|
| 1 | MV3 Service Worker | **PASS（Chrome for Testing 153）**；Edge NOT_RUN | 发布 ZIP 解压后真实加载：worker 即时注册；`storage.session` 读写、`alarms` 创建/清除成功；`webRequest` 未授权时不存在；无用户手势的授权请求被浏览器拒绝；CDP 停止全部 worker 后消息可唤醒。用户真实 Chrome 运行 rc.8。原生授权/拒绝/撤销对话框**无法自动点击：NOT_RUN（需人工 1 次）**。webRequest 使用“预声明权限的测试副本”（不发布）验证：真实 X 顶层请求进入账本、stop 后 session 存储清空。先前 BLOCKED 是使用品牌 Chrome 加载解压扩展所致，本轮未关闭任何安全策略。`docs/qa-rc8/mv3-real-chrome-for-testing.json` |
| 2 | 真实 X 视频桌面抓取 | **发现 + 关联 + HLS 解析 PASS（真实数据）**；修订版扩展内完整导出 **待用户重载扩展后确认** | Chrome 实际请求 master/子清单/fMP4 初始化/m4s 分片（已记录）。归属依据为媒体 ID `2110598821118099457`（海报与清单同 ID）。TXT/Markdown 导出链路由单元/浏览器套件覆盖，用户真实浏览器中用新包导出尚未执行。 |
| 3 | Safari + Stay 真机 | **NOT_RUN** | 无法控制真实 iPhone/iPad。Stay 构建无 `window.` 访问检查、390×844 生产脚本回归通过。Stay 中 PerformanceObserver 是否可见由真机确认。真机步骤见下。 |
| 4 | 缓存/预加载漏采 | **部分解决，已用真实数据确认原因** | 已加载视频重播不再请求清单（实测）；X 清空时间线（实测）。现在主路径为页面数据 + 被动清单记录，均不依赖 30 秒窗口。脚本加载（document_idle）前已被清空且页面数据也缺失时仍会漏，此时保持 `/video/n` 回退与“待确认”说明，不强刷缓存、不自动播放。 |
| 5 | iframe / Worker / 未知来源 | **未放宽（有意）** | 本轮所有真实视频请求均来自顶层 X 文档（XHR）；未发现子框架或 Worker 导致漏采的真实证据，因此不扩大范围。被动记录也只限本文档、`video.twimg.com`。 |
| 6 | 多视频归属 | **自动归属增强；人工确认 UI 未做** | 只按精确 URL / CDN 媒体 ID 唯一匹配；同页其他视频（本次时间线中另有 3 个视频清单）计为“待确认”而不附加（单元测试使用真实 URL 结构）。页面数据本身按帖子 ID 归属，可解决多数多视频/引用帖情况。人工确认闭环仍为后续工作。 |
| 7 | 折叠长文图文位置 | **未改动，仍为 PARTIAL** | 本轮未变更锚点算法；扁平帖子的 `note_tweet` 形态未在真实页面观察到，兼容两种形态但未实测。 |
| 8 | 交付 | **完成：分支 + Draft PR + 安装包** | 双端构建、ZIP 校验、源码重建字节一致（`scripts/package_release.py --check`）、敏感信息扫描、noreply 提交；未强推、未改写历史、未合并 main。 |

## 本轮实际执行的检查

| 套件 | 结果 |
|---|---:|
| TypeScript 类型检查 | PASS |
| Node 单元/契约（原 265 + 新增 10） | 275/275 |
| discovery_qa | 40/40 |
| multimedia_qa | 53/53 |
| hd_links_qa | 28/28（rc.7 记录同为 28；rc.8 文档写 29 为计数错误） |
| media_links_qa | 24/24 |
| text_export_qa | 34/34 |
| browser_qa（PNG/PDF） | 50/50 |
| rc2_regression | 52/52 后在 macOS 上于 Finder 助手 xattr 两项中断（见下） |

失败先行：`docs/qa-rc8/red-video.txt`（新测试 9/10 在修复前失败）。浏览器套件使用 Chrome for Testing 153、OFL 授权的 Noto Sans SC 作为测试字体（不随包分发）。

## 发现但未在本轮修复

- **未登录桌面 X 使用新页面结构**（`<article class="flex flex-col gap-1">`，无 `data-testid="tweet"`）：解析器识别 0 条帖子。已登录页面不受影响。
- **`tools/macos/finder_source.py` 在真实 macOS 上不可用**：调用 `os.getxattr/os.setxattr`，macOS 的 Python 没有这两个函数（仅 Linux 有）。`rc2_regression.py` 在 macOS 上因此中断；在 Linux 上的 mock 测试掩盖了这一点。

## 用户最少验收步骤

**电脑（约 1 分钟）**：`chrome://extensions` → 用 rc.8 修订版目录重新加载 X Capture（或加载新 ZIP）→ 刷新目标帖 → X Capture → 文本 → Markdown。期望视频处出现 `.m3u8` 与 MP4 链接而不是只有 `/video/1`。可选：“启用桌面视频观察”时确认/拒绝系统对话框各一次，并在扩展详情中撤销。

**iPhone/iPad（约 3 分钟）**：保留旧脚本为停用状态 → 导入新 `.user.js` 并启用 → Safari 允许 Stay 访问 x.com → 刷新目标帖 → 出现 X Capture 入口 → 文本 → 确认 `.m3u8` 链接仍在 → 复制文本、导出 TXT/MD、PNG/PDF、系统分享各一次。异常时停用新脚本、启用旧脚本并刷新即可回退。

`SOURCE_MANIFEST_RC8.json` 对应 rc.8 基线提交（修订前快照），本修订未改写；修订后的可复现性以 `scripts/package_release.py --check` 为准。

## 合并后最终检查（含素质选择、未登录页面、macOS 助手）

| 套件 | 结果 |
|---|---:|
| TypeScript | PASS |
| Node 单元/契约（275 + 未登录 4 + 素质 9） | 288/288 |
| discovery / multimedia / hd_links / media_links / text_export / PNG·PDF | 40 / 53 / 28 / 24 / 34 / 50 全通过 |
| rc2_regression（macOS） | 54/54（xattr 修复后完整通过） |
| logged_out_qa | 22/22 |

真实安装最终 ZIP（Chrome for Testing 153）：worker、session、alarms、唤醒均正常；**未登录真实 X 页面注入 4 个帖内入口**（修订前 0）。
素质选择用真实资源验证：同一照片原图解码为 2048×1365 并绘入 PNG 场景；视频 540p 输出真实 540 MP4（响应头已验证）与 540 HLS 子播放列表，“最高可用”输出与修订前一致。手机 375px 宽无横向溢出。
