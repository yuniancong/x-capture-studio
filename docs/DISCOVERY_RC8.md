# rc.8 多媒体发现与证据设计

## 固定基线

GitHub rc.7 分支 `feature/multimedia-rc7`，commit `d89729b4f4dcf1d9f333c5c7dc54c5dfbd54c0e1`。main 保留 `026378947da2753f3f3dc2b3e9a84edf261619b8`。rc.8 为增量修复，不重复实现已有 HLS/DASH/图片降级。

## 发现 → 关联 → 验证 → 表示

- 发现：DOM、页面已有媒体字段、当前文档最近的 PerformanceResourceTiming 名称、可选 Chrome webRequest。
- 关联：先匹配同媒体的精确 URL，再以观察到的 CDN 资源家族与媒体 ID 唯一匹配。不用帖子 ID 冒充 CDN 视频 ID，不凭时间邻近归属。
- 验证：复用有预算的 MediaResolver，解析清单/检查图片/检查直链响应头；HTTP 请求成功本身不等于文件完整、字幕正文存在或最高画质确认。
- 表示：正常/完整资源模式复用统一序列化器，保留资源来源并坚持原位输出。

网络模块只存必要的 URL、媒体 Content-Type、HTTP 状态、来源/时间及文档范围，不留 Cookie、Authorization、请求正文或完整响应头。Content-Type 从 responseHeaders 提取后立即丢弃其他字段。不读取响应体。

## 观察会话

30 秒；最多 8 个同时活动的标签页会话；每会话最多 96 个去重 URL。前台合并网络与时间线最多 192 条。只监听 `https://video.twimg.com/*` 的 media/xmlhttprequest/other 类型，且请求须来自已授权 X 顶层文档。未知/opaque initiator、其他 tab、不同 document、跨站 iframe、非标准端口和不合法 URL 均不附加。

事件监听同步顶层注册。序列化异步操作避免 hydration 覆盖刚记录的事件。会话使用 `chrome.storage.session`（仅会话内存）及 `alarms` + 活跃时定时器到期清理；stop、导航、tab close、撤销权限清理。恢复时重新核验范围与 TTL。事件使用接收时刻与会话比较，不混淆 Chrome 网络时戳和 wall-clock。

会话仅由点击检查启动，不在普通浏览时保存视频请求。不修改请求、播放器、缓存或网站登录。不自动播放。内存缓存未产生可观察请求时，有限回读当前文档最近 120 秒时间线条目；只读允许的资源名称，没有访问全局浏览历史。

收到 URL 不足以对应唯一视频时只报告歧义数量。本版不提供人为强行挂接未知 URL 的控件。跨域嵌入保留原播放器入口，不跨框架读取私有状态。

## 字幕证据

`hint < declared < url-observed < resource-validated < cue-confirmed`。

浏览器空 TextTrack 只有 hint；已知 HTML track 为 declared / URL-observed；HLS/DASH 声明提供轨道关系。仅字幕清单解析或合法资源验证支持 resource-validated。可读取非空 cues 支持 cue-confirmed。未加载 cues 不代表没有字幕。

“in-band”是来源关系，不是“URL 为空”的同义词：只有真实清单声明支持内嵌关系；没有 URI 的损坏 HLS SUBTITLES 不被当作内嵌字幕。CEA-608 CC1/CC2 等不同 service 不合并。保留来源、语言、group、Period、Representation 等限制，避免不同轨混合。

## 画质

`playbackDimensions` 保存媒体元素当前内在尺寸及观察时间，完全独立于 `ResourceVariant.width/height`。DOM 不用播放尺寸标注 HLS 或其他 URL 的固定质量。清单声明的子流/Representation 尺寸保留；HLS master 不继承当前轨道或旧变体固定尺寸。已有资源仍保留其来源与可验证质量，不因排序丢失 MP4/M3U8/MPD。

## 折叠正文

通过按顺序匹配的文字前缀锚点，只延伸能定位的末尾文字块，不移动非文字块，不搜索性猜测缺失文本在哪张图片之前。含未确认内联尾部媒体、翻译不一致或中间锚点不连续时保留原块并警告。普通“纯正文+尾部附件”与真正 interleaved 结构在 DOM 解析时区分。无法恢复的全文不冒充已完整采集。

## 不在本轮范围内

不要求两端 URL 一致；不保证任意 X 视频都提供 M3U8；不下载分片、合并视频、访问解密密钥、抓私有接口或绕过平台限制。无 webRequest 权限、旧 Chromium、拒绝授权及 Stay 均保留基础取链。新权限说明见 INSTALL_RC8.md。

## 官方参考（实现前已核查）

- Chrome webRequest（MV3 非阻断观察、host + initiator 访问、缓存限制）：https://developer.chrome.com/docs/extensions/reference/api/webRequest
- Service Worker 事件同步注册：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events
- chrome.storage.session：https://developer.chrome.com/docs/extensions/reference/api/storage
- HTML 视频内在尺寸、TextTrack：https://html.spec.whatwg.org/multipage/media.html
- HLS 主/子清单和字幕：https://datatracker.ietf.org/doc/html/rfc8216
- Stay 历史公开注入实现：https://github.com/shenruisi/Stay

历史 Stay 源码的模拟约束不等同于当前 App 二进制；真机状态单列，不用解析单测冒充平台验收。
