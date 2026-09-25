# X Capture Studio · Stay Safari 专项修订 rc.3

日期：2026-09-25。状态：GENERATED / 本地回归通过 / 用户实际 Safari + Stay 反馈入口正常。

## 结论与证据边界

目标仅为 iOS/iPadOS Safari 内的 Stay 扩展。桌面版 rc.2 可以继续使用，不要求更新。
已查阅用户指定的官方仓库 README、Tampermonkey.m、bootstrap.js、GM API 构造与菜单文档。
公开 main 在本次读取时为 9b78d761d307234d4ed5ea72ac423804ea0c4301（2022-06-15）。
**公开源码不等于当前 App Store 二进制；公开实现用于定位兼容风险。rc.3 随后收到用户实际 Safari + Stay 使用反馈，入口已正常出现；这不等于对所有 iOS / Stay 版本完成兼容认证。**

## 已验证的兼容性问题

1. 原版 rc.2 的 metadata 声明了 unsafeWindow；公开 Stay 规则会因此选择 page 注入。
2. 即使只删除该 grant，公开 Stay 对 window.* 的静态扫描仍将原打包代码分到 page 模式；匹配包括 inactive demo、常规定时器和事件调用。
3. 公开 page 分支用普通 script 元素和 TextNode 插入网页。在本地严格 script-src 测试页面中，原 rc.2 不运行，入口为 0；无此策略时入口为 1。
4. 同一严格测试下，用受信任隔离上下文执行修订脚本，入口出现，可以实际选帖、打开编辑器和生成 PNG。

第 3–4 项是 **Chromium 中对公开注入分支的行为对照**，不是完整 Stay 宿主模拟，更不是 iPhone 实测。
没有采集用户当前 X 页面的 CSP 头，不能断言用户设备一定仅有这一种原因。
此前的普通页面直接注入测试没有覆盖宿主的注入模式选择，本轮补齐此测试缺口。

## 修订

- 移除 Stay 输出的 unsafeWindow grant 与该对象依赖；DOM 采集独立工作。
- Stay 专用构建用语义等价的 globalThis 属性访问，避免公开宿主对 window.* 的误分类；不是关闭网站 CSP，不注入 nonce，也不加载远程可执行代码。
- 构建期检查最终脚本，避免后续引入相同注入模式回归。
- 在应用模块初始化前注册 Stay 菜单与 GM_log 启动记录。
- 启动失败时尽量保留普通 DOM 的自检按钮；不依赖 PDF、字体或网络。
- 常规入口、每帖按钮与自检入口互相独立，菜单注册失败不隐藏常规入口。
- 修复网页克隆宿主节点但未克隆 ShadowRoot 时，旧标记阻止重新挂载的问题。
- 文档明确以 Safari + Stay 扩展为目标，移除“必须在 Stay 浏览器内打开”的误导说明。

隔离环境中若无法读取页面私有 JavaScript 渲染属性，DOM 结果仍保留；没有证据的父帖关系、隐藏全文和引用链接不编造，继续提示未知。此项需要真实 X 样例补充验收。

## 本轮实际运行

命令：

```sh
npm run typecheck
npm run build
npm test
XC_OLD_SCRIPT=/path/to/rc2.user.js XC_QA_OUT=/tmp/xc-stay-qa python tests/stay_startup_qa.py
```

结果：类型检查通过；双端源码可构建；59 项单元/契约测试通过；39 项新增启动专项检查通过。
专项涵盖旧版正反对照、公开规则分类、严格 CSP、GM 词法作用域、菜单、可见入口、逐帖按钮、编辑器、选择、PNG 与来源回读、GM 缺失/异常/停滞、节点重建、重复注入、启动错误回退。
实导 PNG：1520 × 1152 像素；文件元数据包含虚构主帖及所选回复的完整 source URL。

测试环境：Playwright + Chromium，390 × 844 触摸视口。Browser 插件/技能未提供，使用 Playwright fallback。
X 导航在容器浏览器中受管理策略限制；测试改用 about:blank 本地合成文档和绝对来源锚点，没有修改管理策略或尝试绕过。所有内容、用户与关系为测试数据。
GM API 是词法绑定的测试替身；Safari 原生 bridge、当前 Stay 安装/匹配/权限/UI、真机分享/剪贴板/照片保存、手机 PDF 导出没有在本轮验收。

## 视觉检查

已打开检查本次 mobile-launcher.png、mobile-editor.png 和实际导出 PNG。
入口可见，不被底部区域遮挡；每帖相机入口可点击；编辑器预览与控制面板能滚动；PNG/PDF 导出按钮可达；分块、字体、背景维持现有体系。
这不是新视觉设计，不改用户已接受的工作台风格。

## 真机确认

用户已实际在 Safari + Stay 中确认 rc.3 入口正常。若后续重新安装或换设备，可停用旧 X Capture 脚本，导入并启用 rc.3，回到 Safari 的 X 页完整刷新。
脚本运行后，页面应有 X Capture / ?；Stay 面板中应有“打开 X Capture”“X Capture 启动自检”，并可能显示 START / READY 日志。
若页面仍没有入口，查看 **Safari 当前 X 页的 Stay 扩展面板**，反馈脚本显示状态、菜单与日志。
没有菜单/日志仅表示尚无脚本开始执行的证据；不能直接等同未授权，也不能直接归因于用户设置。
不要求更换浏览器、上传 Cookie 或登录凭证。

## 文件校验

主脚本：X-Capture-Studio-Stay-v1.0.0-rc.3.user.js
SHA-256：24a28081c4b85e434da7b878d5854bdc767991dd817f593aa82a8397b5bca538
字体文件：未包含。第三方 JavaScript 授权声明保留在 userscript 与 Source/vendor/。

## 官方来源（2026-09-25 查阅）

- 定位、启用/导入与 GM_log：https://github.com/shenruisi/Stay
- 注入模式选择与 window 属性启发式：https://github.com/shenruisi/Stay/blob/9b78d761d307234d4ed5ea72ac423804ea0c4301/Stay/tampermonkey/Tampermonkey.m
- 注入分支：https://github.com/shenruisi/Stay/blob/9b78d761d307234d4ed5ea72ac423804ea0c4301/Stay%20Extension/Resources/bootstrap.js
- GM API 宿主预处理：https://github.com/shenruisi/Stay/blob/9b78d761d307234d4ed5ea72ac423804ea0c4301/Stay/tampermonkey/lib/gm-api-create.js
- 自定义菜单：https://github.com/shenruisi/Stay/wiki/GM_registerMenuCommand
- 主分支日期：https://github.com/shenruisi/Stay/commits/main/
