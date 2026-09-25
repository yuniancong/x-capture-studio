# 验证记录 · X Capture Studio 1.0.0-rc.2

日期：2026-09-25。状态：GENERATED / LOCAL_REGRESSION_PASSED。真实 X、已安装扩展、iOS Stay 和 macOS 原生属性仍待验收。

## 环境与真实范围

Node.js 22.16.0、TypeScript 5.8.3、Python Playwright + Chromium。桌面 1476 × 1023；手机 390 × 844，Chromium 触摸模拟，既有测试另包含 DPR 3。文件独立检查使用 Pillow、PyMuPDF 和 Poppler。

当前会话未列出 Browser/IAB 插件，使用 Playwright。浏览器的组织策略阻止页面导航和扩展安装；未移除或绕过策略。使用 `page.set_content()` 注入合成 DOM 和实际构建代码。测试明确阻断合成页面的 HTTP(S) 请求，头像 / 媒体的导出测试使用本地生成位图。没有登录 X，没有执行真实账户点赞或发布。

PDF 字体为测试环境单独提供的合法 CJK 字体；独立字体文件不放入交付包。脚本的 GM API 使用模拟实现；它验证代码契约，不证明 Stay 某版本的真实桥接能力。

## 命令与结果

```sh
npm run typecheck
npm run build
npm test
XC_TEST_FONT=/path/to/cjk-font.otf XC_QA_DIR=/tmp/xc-base python tests/browser_qa.py
XC_TEST_FONT=/path/to/cjk-font.otf XC_QA_DIR=/tmp/xc-rc2 python tests/rc2_regression.py
```

| 验证层 | 结果 | 完整包证据 |
|---|---|---|
| 类型检查 | 通过 | QA/typecheck.log |
| 扩展 / 脚本 / 演示构建 | 通过 | QA/build.log |
| 单元 / 契约 | 59 / 59 | QA/unit-tests.tap |
| 既有浏览器与文件回读 | 50 / 50 | QA/browser-results.json、browser-tests.log |
| 本轮专项 | 54 / 54 | QA/rc2-results.json、rc2-tests.log |
| 原版与修订版同场景对照 | 原版可复现失败；修订版通过 | QA/baseline-repro.json、rc2-repro.json |
| 已安装扩展 / 真实 X | 未运行 | 用户真实截图是问题依据，不等于我们拥有真实 DOM |
| iOS Stay 真机 | 未运行 | 不将 Chromium 触摸模拟写成 iOS 通过 |
| macOS Finder 原生写入 | 未运行 | 辅助工具仅完成真实文件解析 + mocked xattr 回归 |

构建指纹见 QA/build-fingerprints.json；打包校验见包根目录 SHA256SUMS.txt。

## 修复的证据

### 引用内容与标识

从 rc.1 原交付包取出原代码重新构建。在缺少独立链接的 role=link 引用，以及非旧选择器的作者栏场景复现引用整块丢失。引用头像虽可解析，旧场景没有图像绘制命令；新版覆盖独立头像布局与媒体准备。

专项回归确认：两种引用可完整保留、不重复为外层帖子；真实显示名与 handle 不粘连时间；只读页内公共属性补足引用 URL；页面当前中文翻译不被原始英文覆盖；四图片水平组合不再强制变成 2×2。

将采集到的认证 SVG 原路径交给浏览器 Path2D 作为独立参考，与归一化后共享场景渲染对照；本样例像素差为 0。另对相对 / 平滑 / 椭圆弧命令做独立参考对照。解析只保留允许的路径与几何，不保留原 SVG 脚本、事件或外部引用。

### PNG / PDF

引用样例 PNG 1520 × 2122 像素，独立读取标准 Source、SourceURL 和 XMP 引用链接；PNG 每个块和元数据 CRC 通过。

引用样例 PDF 为单张长页，中文、被引用作者和最后段落可真实提取；含嵌入字体、矢量图形及可点击引用链接。使用 PyMuPDF / Poppler 重新渲染，人工查看引用头像、蓝标、文本、排列和边界。不是整页图片伪装文本 PDF。

既有 110 条帖子压力测试保留最后条目、单页及 UserUnit。样本能被本次读取器读取，不代表无限长或所有 PDF 阅读器一致。

### 背景

通过真实文件选择导入测试背景，再调整柔化、压暗、纹理，检查实际场景命令与 PNG 两侧不同像素；PDF 中背景为位图而正文仍为文字。不是把预览换颜色但导出未生效。

### Stay

执行最终生产 userscript，覆盖页面无 body、旧版标记残留、入口删除、body 替换、缺 ResizeObserver / IntersectionObserver、GM 菜单抛错、GM 读取永不结束、重复注入。每种场景检查一个可见悬浮入口和手机底栏避让；关键故障场景继续打开编辑器。

缺观察器测试中，Playwright 自己的 tap/actionability 依赖 IntersectionObserver，因此只有该场景直接调用按钮 click handler，其余关键打开场景使用 Chromium 触摸事件。这不是实际手指 / iOS 交互证明。

### Finder 来源

标准 PNG 内部元数据与 macOS WhereFroms 为两层。新版文件保留个别帖子的真实链接；没有把标准 Source 写入通过说成 Finder 已修复。可选工具对真实 PNG/PDF 的读取、来源顺序、只写 WhereFroms、正文哈希不变、恢复旧属性均通过模拟接口测试；真实 macOS 链路留待用户验收。

## UI / PDF 视觉对照

用户已批准的 Tweet Screenshot 工作台截图为结构依据，本轮四张真实截图为缺陷依据。已经打开原参照与最终实际渲染截图、PNG 与 PDF 渲染图检查，不把编译通过当视觉验收。

| 对照点 | 处理 |
|---|---|
| 工作台结构 | 保留深色框架、左侧画布、右侧设置与固定导出区 |
| 卡片 / 背景 | 紫色渐变与白色独立卡片、留白、圆角保留 |
| 引用完整性 | 独立头像、昵称、认证、handle、时间、正文和媒体 |
| 原始媒体构图 | 可识别时遵循原页面组合与裁切，不无条件 2×2 |
| 文字 | 主帖及引用可读，无黑框；PDF 中文可复制 |
| 参数入口 | 15 色块和中文本地壁纸按钮，精细控件可滚动 |
| 手机 | 带文字的独立入口，44 px 操作目标；编辑器适应窄屏 |
| 有意差异 | 中文 UI、自有品牌、扩展背景选项、PDF 导出及诊断入口；不声称像素级克隆 |

测试演示内容、头像和图片全部合成；未将用户真实截图作为应用资产。离线 about:blank 环境不支持 localStorage 时出现「设置暂未持久保存」提示属于明确降级；截图在提示自然消失后采集，不隐藏产品错误。

## 双轴评审

Standards：审阅只读数据白名单、SVG sanitization、图片 / 背景大小预算、预设验证、资源白名单、匿名链接移除、生产与演示入口隔离、无远程脚本执行、辅助工具局部且可恢复写入。严格类型和回归通过。这不是独立安全审计。

Spec：本轮明确问题已实现修正并通过对应合成场景；自动读取桌面壁纸没有实现，提供用户选原图；Finder 自动原生写入没有纳入浏览器脚本，提供可选辅助工具；Stay 故障模式已修，真实设备是否恢复仍待确认。其余已批准功能不改变；没有添加媒体归档、后台服务或账户系统。
