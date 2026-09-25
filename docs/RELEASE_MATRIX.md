# Release Matrix

| Surface | Version | Artifact | Evidence |
|---|---:|---|---|
| Chromium extension | 1.0.0-rc.2 | `releases/X-Capture-Studio-Chrome-v1.0.0-rc.2.zip` | 本地 typecheck / build / unit / browser 文件回读测试；用户实际桌面使用反馈可用 |
| Safari + Stay | 1.0.0-rc.3 | `releases/X-Capture-Studio-Stay-v1.0.0-rc.3.user.js` | Stay 注入专项测试；用户实际 Safari + Stay 反馈入口正常 |

## Why the versions differ

`1.0.0-rc.3` 是针对 Stay 注入模型的专项修订。桌面 Chromium 端在该轮没有必要升级，因此继续把 `1.0.0-rc.2` 作为推荐安装版本，避免把未单独做桌面实机验收的新版本冒充为已验证桌面版本。
