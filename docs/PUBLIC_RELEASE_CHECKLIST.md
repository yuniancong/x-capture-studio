# 公开仓库检查清单

- [x] 自有代码/文档采用 MIT License；第三方许可仍然独立保留。
- [x] 项目内容中未发现明显明文凭证、私钥或真实 Cookie；合成测试 token 标注为假值。**这不是完整历史密钥扫描**。
- [x] Stay 图片通过 Apple 官方图片服务器链接引用，明确属于开发者的历史 App Store 营销图；不作为项目原创素材授权。
- [x] README 和教程均说明 Chrome / Edge 开发者模式需要人工确认，不允许绕过浏览器安全界面。
- [x] 本地安装脚本对 ZIP 校验 SHA-256、安全路径校验、拒绝默认覆盖、升级时保留备份。
- [x] 应用运行时代码保持 rc.5；避免把文档更新冒充经过新版本端到端验收。
- [ ] GitHub Repository → Settings → General → Danger Zone → Change visibility → Public：**需仓库管理员在 GitHub UI 确认**。当前 ChatGPT GitHub 连接器没有更改仓库可见性的动作。
- [ ] （可选）公开后在 Settings → Pages 指定 `main` 分支的 `/docs` 文件夹发布安装中心，首页是 `docs/index.html`。

> Private → Public 以后历史提交、Actions 日志等也会对公众可见。请仓库所有者完成最终确认。
