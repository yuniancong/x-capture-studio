# rc.8 范围与证据矩阵

| 目标 | 实现 | 本地证据 | 外部边界 |
|---|---|---|---|
| Blob/React 缺失时补充取链 | network-observer / discovery / discovery-client | 新49单元+40生产bundle交互；实际background消息流 | 原生MV3与真实X尚待实测 |
| 只主动短时观察 | optional webRequest、30s ledger、session+alarms | 初始不采、拒绝授权、stop、导航、tab close、撤销、重启、超时 | 原生授权UI未测 |
| 多视频正确归属 | 精确URL、媒体ID、CDN family；歧义不附加 | postID≠mediaID、quote、预载、不同tab/doc、重复资源 | 未识别CDN结构会留待确认 |
| 不丢MP4/HLS/DASH | 与rc7变体模型合并；source provenance保留 | 既有72媒体单元+53UI+新增去重 | 平台不提供格式时不编造 |
| 字幕不误报 | hint/声明/URL/资源/Cue；独立inBand证据 | 空TextTrack、不同CEA服务、HTML/HLS/DASH、单调证据合并 | Cue未加载不等于没有字幕 |
| 画质不误报 | playbackDimensions独立；master不带固定尺寸 | DOM320尺寸、master合并、UI复制检查 | 未解析清单不知最高质量 |
| 长文原位 | 有序前缀锚点，仅可定位尾部扩展 | 混排、重复扩展、翻译不一致、截断中间、未知内联尾部 | 无锚点保留partial，不声称完整 |
| 高清图片降级 | 保留rc7图片resolver | 原51文本+34HD+72media契约，29HD UI | 网络权限/签名/格式仍限制可用率 |
| Stay不回归 | 原有隔离注入，DOM HLS；无Chrome接口 | 390x844生产脚本、复制TXT/MD、原回归 | 不是真iPhone |
| 原界面与PNG/PDF | 最小文本区增量、原renderer不变 | 50PNG/PDF、54背景引用、34文本 | 无真实用户内容截图验收 |
| 交付 | 构建ZIP、source、patch、sha256 | 解压重建比较 + receipt | Github本轮未写入 |
