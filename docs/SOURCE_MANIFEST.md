# 来源与构建清单

版本：1.0.0-rc.2；日期：2026-09-25。

## 产品依据

本次连续对话中用户确认的范围及最后的执行授权。用户提供的 Tweet Screenshot 工作台截图只用于视觉对照，不作为程序背景、卡片截图或源码素材随包分发。

X Snap 与 Tweet Screenshot 的 Chrome 商店说明只作功能参照，未取得或复制它们的扩展代码。本程序属于独立实现，不暗示第三方产品或 X 平台背书。

## 外部资料与依赖

| 来源 | 用途 | 地址 / 固定版本 |
|---|---|---|
| Chrome 官方扩展文档 | MV3、内容脚本、跨域资源、加载本地扩展 | https://developer.chrome.com/docs/extensions/ |
| Stay 公开项目 README | userscript 导入与 GM 接口参考；不证明当前 Stay Browser 真机能力 | https://github.com/shenruisi/Stay |
| PNG 规范 | iTXt、XMP / UTF-8、pHYs、CRC | https://www.w3.org/TR/png-3/ |
| fontkit | 浏览器字体解析、字形与子集；JavaScript 包纳入构建 | https://github.com/foliojs/fontkit ，2.0.4 |
| qrcode-terminal 内的 QR 核心 | 本地绘制可选原帖二维码 | 0.12.0 中的 Kazuhiko Arase QR 实现 |
| Noto CJK 官方固定版本 | 用户运行时可获取的 PDF 字体；不在交付包中 | notofonts/noto-cjk，Sans2.004 |
| X Snap | 用户指定的产品参照 | https://chromewebstore.google.com/detail/x-snap/cliapideplfechpbplmhnofefcgdnjkb |
| Tweet Screenshot | 用户指定的产品与交互参照 | https://chromewebstore.google.com/detail/tweet-screenshot-x-twitte/eefllioofaknonamnfbfiodjmlckcccg |

第三方 JavaScript 的具体许可证和附属依赖见 `vendor/THIRD_PARTY_NOTICES.md`。字体 API 名称和字体 URL 不等于捆绑字体数据。运行时初次获取字体属于用户主动导出流程，可由本地授权字体替代。

## 本轮新增证据（2026-09-25）

- 用户本轮四张标注截图：Finder 来源、引用作者栏、编辑器标识与媒体排布、遗漏引用卡片。图片仅作诊断依据，不随程序作为媒体分发。
- rc.1 原始完整交付包：只读保留，单独提取原源码构建用于失败对照。rc.2 源码是修订后的实际实现。
- Chromium Blob authority URL 处理：https://raw.githubusercontent.com/chromium/chromium/main/components/download/internal/common/base_file.cc ，`GetEffectiveAuthorityURL`。
- macOS WhereFroms 属性实现：https://chromium.googlesource.com/chromium/src/+/ff31fdd149688bcd4cd52488312c8a4257847777/components/services/quarantine/quarantine_mac.mm 。
- Chrome wallpaper API（ChromeOS 范围，不是 macOS 读壁纸）：https://developer.chrome.com/docs/extensions/reference/api/wallpaper 。
- Apple Safari 扩展权限说明：https://support.apple.com/guide/iphone/get-extensions-iphab0432bf6/ios 。

## 构建与验收

TypeScript 5.8.3；Node.js 22.16.0；应用源代码以 `.ts` 保留，vendor 为固定的本地 JavaScript 构建输入。生成物包含 Chromium 扩展、单文件 userscript、自包含演示 HTML。

源代码、构建文件与测试数据的 SHA-256 在交付包根目录 `SHA256SUMS.txt` 中。README 和 `docs/VERIFICATION.md` 区分真实运行与未运行项。没有商店发布、用户设备远程安装、GitHub 推送或云服务部署。

## 测试材料

全部测试帖子、账号、数字、URL ID 与 Article 来自合成 fixture 或演示数据，不是用户账户的导出。媒体回归图为明确标记的测试图。示例 PDF 中有正常嵌入的文档字体子集；不提供独立字体文件，不包含测试机的 OTF / TTF。
