# X Capture Studio rc.5 — 媒体原位链接验证

日期：2026-10-15。代码基线：GitHub `main` 的 `7bfc59743b2bfafe189ecead7888885f08f19dbc`，对应用户已验证的 rc.4 安装文件与源码副本。

## 改动范围

图片标注后附已采集的 HTTP(S) 图片资源地址；视频使用独立 `sourceUrl`，不把显示用的 `src`（视频封面/当前帧）混作视频地址。可读取的既有页面数据中优先 MP4；未得到直链时明确显示“原帖播放链接”，流媒体地址标为“播放流”。不编造未取得的地址，忽略临时 Blob/data/带凭据的地址。

链接跟随原文的媒体块，不集中移到文末。Article 段落—图片—段落—视频—段落顺序经合成 DOM 验证；同组图/视频混排使用文本专用观察顺序，不改变已有视觉渲染数据。引用媒体仅关联其自身作者和来源。链接卡片的图片在该卡片位置列出，不包含头像、背景图或视频封面。

匿名默认隐藏自动回链，只有已有匿名来源例外开启时恢复；媒体开关关闭时同时隐藏标注和链接。原帖来源开关仍独立，不静默改写原文。

## 已执行

环境：Node.js 22.16.0，TypeScript 5.8.3；Playwright + Chromium（1476×1023 桌面、390×844 手机触摸视口），模拟 Stay 的隔离环境与词法 GM 接口。Browser 插件未提供，使用本地 Playwright。页面与媒体均为明确标识的合成夹具。

| 检查 | 结果 | 证据 |
|---|---:|---|
| 类型检查、双端构建 | PASS | 构建命令输出及 build-info |
| 原有单元/契约 | 59/59 | QA/unit-tests.log |
| 文本单元/契约（含新增媒体测试） | 51/51 | QA/unit-tests.log |
| 图片/视频链接及原位顺序专项 | 24/24 | QA/media-results.json |
| 文本复制/导出/隐私/回退回归 | 34/34 | QA/text-results.json |
| Stay 公共注入与启动模拟 | 39/39 | QA/stay-results.json |
| 原有浏览器与 PNG/PDF 文件回读 | 50/50 | QA/browser-results.json |
| 引用/背景/Finder 辅助工具回归 | 54/54 | QA/rc2-results.json |

TXT 与 Markdown 的真实输出文件已逐字回读；剪贴板与原生分享使用记录型适配器，不声称已操作 iOS 系统剪贴板。生产 Stay userscript 实际在模拟隔离环境执行；保留原有站点范围和启动方式。

失败先行：旧版缺图片/视频链接的用例失败；旧文本输出把同组视频放在图片后，原位顺序用例失败。修订后相同用例转绿。非媒体文本三种格式对 rc.4 固定样本逐字不变。

## 双轴检查

Standards：PASS（本轮范围）。URL 验证、不执行链接内容、不下载视频、不增加远程代码或权限；公开页面探针保持可独立执行，Stay 构建保持无 `unsafeWindow` 依赖。

Spec：PASS（本地已覆盖场景）。复制纯文本/Markdown/AI、TXT/MD 文件均使用相同链接及位置；媒体链接不越过段落；主帖和引用不串用视频；其他视觉与选择行为保持。

15 个关键既有视觉/PNG/PDF/选区/宿主模块与 rc.4 逐字节一致，见 QA/scope-check.json。预览与 PDF 回归渲染已检查，正文可读、卡片与面板无新增错位。三处媒体说明文案和版本号为必要同步变更，并非界面改版。

## 尚未验证与限制

没有本轮真实 X 各页面、已安装 Chrome 扩展的完整真实站点链路、iPhone Safari/Stay 真机或原生分享面板验收。不能从合成测试推断所有真实视频都能读取 MP4；Stay 隔离环境不会为了获得内部数据而切回曾引发问题的网页注入模式。拿不到视频文件地址时，原帖播放链接是明确回退，不是视频下载直链。

媒体链接来自当前可获取的内容，不保证失效/受限/未加载资源可下载，不承诺地址永久有效；不会抓取新接口绕过限制。视频的 `currentSrc` 及 Blob 语义参考 MDN 官方文档：
https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentSrc
https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob

GitHub 状态：NOT_WRITTEN_TO_EXTERNAL_SYSTEM。本轮仅生成安装文件与可审查源码补丁，未推送仓库。
