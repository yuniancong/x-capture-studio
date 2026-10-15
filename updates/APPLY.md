# 安全应用 rc.8 更新

不要用源码快照覆盖已存在仓库，不要推送本地重建的合成 Git 根历史。

先在真实 GitHub clone 内核验 HEAD 为 `d89729b4f4dcf1d9f333c5c7dc54c5dfbd54c0e1`，工作区干净。若不是该基线，先进行差异评审。

```bash
git switch -c fix/media-discovery-rc8 d89729b4f4dcf1d9f333c5c7dc54c5dfbd54c0e1
git apply --check /path/to/updates/rc8.patch
git apply --index /path/to/updates/rc8.patch
npm install
npm run typecheck
npm run build
npm test
```

change-manifest.json 包含每个改动路径的旧/新 Git blob SHA；不覆盖清单以外路径。提交前检查 noreply 作者/提交者身份；以普通 push 发布新分支，不 force push，不修改 main。

复制经过 SHA-256 检查的候选安装文件到 releases/ 是另一项明确动作；本补丁只含代码/测试/文档，未假装已上传二进制。
