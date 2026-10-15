# rc.7 验证记录 — 本次实际生成的候选

基线：公开 main `026378947da2753f3f3dc2b3e9a84edf261619b8`；源码包中的 baseline-rc5/rc6 是本地恢复快照，不冒充远端提交。
恢复时 15 个 rc.6 补丁前置文件对象 SHA 全部匹配；src/scripts/assets/vendor 子树与已脱敏 main 一致。先应用原 rc.6 限定路径补丁，再实施 rc.7。未覆盖 main，没有改写旧历史或使用个人邮箱。

## 本轮改动

MediaResources / ResourceVariant / MediaTrack 模型保留发现来源、所属媒体、画质/格式、验证方式、敏感链接状态。新模块位于 src/media/；宿主读资源在 src/platform/resource-network.ts。现有渲染器、PNG/PDF 布局、媒体显示 src 与资源候选分离。

图片实际解码校验像素，候选失败顺序回退；如果已观察到的 srcset 指示更大的图片，会继续比较，不盲信 orig。生成候选失败不能成为“已观察资源”。DOM/页面数据/再次采集合并不丢弃已有 MP4/HLS/DASH 或字幕。受网络/CORS限制的地址标未验证而非删除。

HLS 支持主/子列表、相对 URL、质量字段、AUDIO/SUBTITLES/CC、变量及必要 LL-HLS 元数据、VOD/直播/加密标记。DASH 支持多 Period/AdaptationSet/Representation、BaseURL、分段模板/列表、音轨/字幕、static/dynamic 和保护标记。VMAP/VAST 只提取已观察资源，不请求跟踪器/远程广告包装。分片和密钥不下载。

## 本轮执行结果

| 检查 | 实际结果 |
|---|---:|
| TypeScript 5.8.3 类型检查/双端构建 | PASS |
| 核心单元/契约 | 59/59 |
| 文本单元/契约 | 51/51 |
| 既有高清/播放页契约 | 34/34 |
| 新多媒体单元/契约 | 72/72 |
| 单元/契约合计 | 216/216 |
| PNG/PDF/工作台浏览器与文件回读 | 50/50 |
| 引用、背景、隐私、Finder 模拟 | 54/54 |
| 文本/复制回退/文件/手机适配 | 34/34 |
| 新多媒体生产 bundle 集成 | 53/53 |
| 既有媒体链接集成 | 24/24 |
| 高清与播放页兼容集成 | 28/28 |
| 本地浏览器/回读合计 | 243/243 |

实际生成了 UTF-8 TXT/Markdown、高清 PNG 与可提取中文的单页 PDF，并回读检查。已查看桌面/手机工作台及 PDF 渲染图片。
旧回归脚本的 JSON 保留历史 version/testDate 字段，它们代表套件起源，不代表本次产物版本。docs/qa-rc7/index.json 记录本轮运行范围和构建哈希，不把历史标签称作新平台验证。

## 各资源验证等级

| 类型 | 已验证 | 未宣称 |
|---|---|---|
| 图片 | 合成HTTP响应、真实位图解码、orig失败降级、srcset优选、像素上限 | 每张真实X图片必有orig |
| MP4/其他直接文件 | MIME/地址分类、多变体保留、HEAD 405→有限GET回退 | 完整视频已下载/能够永久播放 |
| M3U8 | 本地规范清单解析、主子关系、语言/音轨/字幕、加密和循环/预算约束 | 每条真实X视频都有HLS |
| MPD | 本地多层MPD解析、分片标记、字幕/音轨关系、安全XML | 当前X普遍提供DASH |
| 字幕 | DOM track/textTracks、结构化数据、HLS/DASH轨道归属及导出 | 自动生成字幕/所有字幕正文已下载 |
| Stay | 完整生产脚本CDP隔离运行、GM/剪贴板记录适配器、触摸视口 | 真iPhone导入、Safari原生桥接、真实系统分享 |

## 安全与请求预算

新主动资源检查只允许 https 的 pbs.twimg.com、video.twimg.com、abs.twimg.com，拒绝内网、IP、凭证URL和重定向；外部已观察资源可以留存链接，但默认不主动读取。原扩展权限与 Stay grant/connect 不扩大。
每次操作至多32次请求、24MiB、并发2、深度2、单次6秒、总计28秒；图片8MiB/80MP、清单512KiB。错误受控降级。图片/清单短缓存不存原视频数据。签名链接默认不对外导出、不自动追踪；用户明确同意仅当前会话生效。不开启全网监听、不提取Cookie、无后台视频下载、无解密。

## 真实环境阻塞（不计通过）

实际 MV3 新临时配置文件安装烟测在10秒内未出现 service worker，记录为 BLOCKED；没有修改策略或使用用户浏览器配置。无法据此证明扩展已在真实 X 路由安装运行。没有真实 iPhone/Safari/Stay、登录后的X页面或实时X媒体可用率验收。
本轮 Browser 插件不存在，采用现有 Playwright Chromium。新集成使用生产JS，网络/宿主/剪贴板边界是记录适配器；不是当前Safari/Stay二进制仿真。

## 双轴检查

Standards：类型检查通过；只读有界请求、XML/URL防护、单独媒体身份、Session同意、幂等合并、原视觉模块无改动。无字体二进制分发。
Spec：图片降级、多视频变体、HLS/DASH/VMAP、音轨/字幕和原位输出均有本地证据。真实平台可获取率仍待用户环境验收，不能称“所有X格式在两端全面验证”。未实现完整媒体下载、字幕转码或语音转录，属于本规格排除范围。

## 可重跑

```sh
npm install
npm run typecheck
npm run build
npm test
XC_MM_QA_DIR=/tmp/xc-rc7-media python tests/multimedia_qa.py
XC_TEXT_QA_DIR=/tmp/xc-rc7-text python tests/text_export_qa.py
XC_MEDIA_QA_DIR=/tmp/xc-rc7-links python tests/media_links_qa.py
XC_HD_QA_DIR=/tmp/xc-rc7-hd python tests/hd_links_qa.py
```

Python浏览器测试需要 Playwright 和可用 Chromium（XC_BROWSER）。旧PNG/PDF套件另需Pillow、PDF解析器及合法可嵌入CJK字体（XC_TEST_FONT），字体不随包分发。完整日志与逐项结果见 docs/qa-rc7/。

## 外部资料（本轮复核的规范，不是X实时资源测试证据）

- X 媒体数据字典：https://docs.x.com/x-api/fundamentals/data-dictionary
- HLS RFC 8216：https://datatracker.ietf.org/doc/html/rfc8216
- Apple HLS：https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices/
- DASH-IF Timing Model：https://dashif.org/Guidelines-TimingModel/
- HTML media/track：https://html.spec.whatwg.org/multipage/media.html
- Stay公开源码：https://github.com/shenruisi/Stay （历史实现不等于当前App二进制）

## 发布状态

GENERATED / LOCAL_TESTS_PASSED。NOT_WRITTEN_TO_EXTERNAL_SYSTEM：GitHub main 和脱敏历史没有变更。安装包最终CRC/版本/字节校验以同批交付receipt为准。
