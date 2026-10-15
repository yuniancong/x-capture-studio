# X Capture Studio rc.6｜高清图片链接与视频专属地址修订

日期：2026-10-15。上游基线：`026378947da2753f3f3dc2b3e9a84edf261619b8`（已完成邮箱脱敏的 main）。
状态：GENERATED / LOCAL_TESTS_PASSED；未推送 GitHub；未进行真实 X / Safari / Stay 真机验收。

## 修复范围

1. 图片文本地址与截图显示资源分离。标准 `pbs.twimg.com/media/` JPG/PNG/GIF 地址规范化为原尺寸请求 `name=orig`；兼容旧式 `.jpg:small`。保留所观察到的实际格式，不将 PNG/WebP 一概猜成 JPG。
2. 仅有 WebP 展示信息时请求 `4096x4096` 大尺寸，不假设存在 WebP 原图。已观察到原始 PNG/JPG 元信息时使用对应格式。其他图片服务保留最大的已观察 srcset 候选；不为未知服务编造高清规则。
3. 图像签名/令牌地址不改参数以免破坏签名。这个版本没有解决审查中所有未来分享隐私风险，不应因此宣称已完全去敏。现有匿名和媒体开关继续生效。
4. 视频的播放页与文件直链区分。优先保留观察到的 `/video/n`；仅在有明确帖子及媒体附件序号，或单个媒体为视频时生成其视频页地址。不对 Article ID 拼造 `/video/1`。
5. 有 MP4 等真实资源时另列“视频文件直链”；播放流另列“视频播放流”。没有视频专属地址/文件时明确回退为“原帖（视频专属地址未获取）”。不把封面、Blob 地址或原帖页冒充文件直链。
6. 复制文本、Markdown、复制给 AI、TXT / Markdown 文件共用序列化器。沿用“媒体标注 + 链接”，不改为远程图片嵌入语法；媒体在原有对应位置，引用帖保持独立。
7. UI、卡片、PNG/PDF 排版、预设、选区、宿主权限不变。新增字段仅补充媒体链接。安装包补齐已有 MIT 许可；不捆绑任何字体文件。

## 依据与限制

X 官方 Media Studio 文档说明 `/video/1` 用于视频分享/播放器：
https://help.x.com/en/using-x/media-studio-faqs

X 官方数据字典将图片 URL、视频 preview_image_url 与 variants 分开：
https://docs.x.com/x-api/fundamentals/data-dictionary

图片原尺寸参数是对同一图片服务的资源请求，不是 AI 放大，也不是原尺寸资源可达性的保证。本轮环境未实际下载 X 图片原尺寸或所提供帖文的视频文件；资源权限、下架、签名过期及服务器实际提供的分辨率仍然限制最终结果。

## 基线与最小改动

通过 GitHub 连接器读取当前 head 与树。本地已核对 `src`、`scripts`、`assets`、`vendor` 完整子树，以及 package.json/tsconfig.json 的 Git 对象哈希与该 clean head 一致。
本地历史 QA/文档打包快照不完全等于远端，因此本次源码交付采用限定路径的更新补丁，不将本地历史包整体覆盖远端。补丁及文件 manifest 中列出各文件预期旧/新对象 SHA。
新浏览器测试使用独立 `tests/content_world_harness.py`，不依赖历史一次性 Stay QA 脚本的整段执行。本次不修改旧提交历史。

## 失败先行与本地验证

最初针对旧 rc.5 的五个回归断言：4 个失败，1 个（显示数据不应突变）通过。修复后全通过。

| 检查 | 结果 |
|---|---|
| TypeScript 类型检查、双端构建 | PASS |
| 原有核心单元 / 契约 | 59 / 59 |
| 文本导出单元 / 契约（更新旧缩略图预期） | 51 / 51 |
| 新增高清地址 / 视频地址契约 | 34 / 34 |
| 新增高清链接浏览器专项 | 29 / 29 |
| 既有媒体链接浏览器专项（更新预期原图地址） | 24 / 24 |
| 既有 PNG / PDF / 浏览器回读 | 50 / 50 |
| 引用、背景、隐私、Finder 工具模拟回归 | 54 / 54 |
| 既有文本 UI、复制回退、文件回读 | 34 / 34 |
| 生产 JS 语法、权限不变、Stay 隔离运行模式 | PASS |
| 用户截图的帖子地址 -> 同一 `/video/1` 地址（仅本地地址计算） | PASS |

浏览器测试：Playwright Chromium，桌面 1480×1000（或各旧套件自身视口），手机 390×844 触摸视口；本地合成 DOM、CDP 隔离内容世界。Browser 插件不可用，采用 Playwright。GM、剪贴板及分享为测试适配器，不是真实 iOS API 链路。

已实际生成并独立回读 TXT、MD、PNG、PDF。已检查桌面/手机工作台截图及 PDF 渲染图；核对工作台框架、页签、按钮、字号/信息密度、卡片主题/间距、移动布局。未新增界面元素，合成同源输入的 rc.5 与 rc.6 完整 Scene 命令一致。

单独尝试实际 MV3 安装后的 X 路由烟测时，浏览器报 `ERR_BLOCKED_BY_ADMINISTRATOR`。停止该路径，不绕过环境策略；该项为环境阻塞，不计 PASS。后续测试仅用本地合成内容世界。

没有进行 X 账户登录、隐藏接口请求、实际用户数据上传，或真实 iPhone/Safari/Stay 导入、权限、系统剪贴板验收。不能把上述模拟结果称为真机通过。

## 可重跑命令

```bash
npm install
npm run typecheck
npm run build
npm test
python tests/hd_links_qa.py
python tests/media_links_qa.py
```

浏览器套件需要 Python Playwright 与可用 Chromium，可用 XC_BROWSER 指定。PNG/PDF 两套旧回归另需本地合法可嵌入的 CJK 字体，XC_TEST_FONT 指定；字体不随本包分发。证据目录用 XC_HD_QA_DIR / XC_MEDIA_QA_DIR / XC_QA_DIR / XC_TEXT_QA_DIR 指定。

## 更新使用

桌面：解压 chrome-rc6.zip，在原已加载目录替换文件并于 chrome://extensions 重新加载，然后刷新 X 页面。
Stay：停用旧 X Capture，导入 stay-rc6.user.js 并启用，再完整刷新 Safari 的 X 页面。请勿同时启用多份旧/新脚本。

这是 rc.5 → rc.6 的局部修订。GitHub 当前版本和历史未改变；旧 rc.5 可回退。正式推送应在用户试用后另行授权，并保持 noreply 提交身份。
