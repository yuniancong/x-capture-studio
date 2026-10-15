# 版本矩阵（2026-10-16）

| 对象 | 版本 | 状态 |
|---|---|---|
| GitHub `main` | rc.5 + 开源安装文档 | 已脱敏公开基线，未强推或改写 |
| 分支 `feature/multimedia-rc7` | rc.7 | 历史候选，未改动 |
| 分支 `feat/rc8-video-discovery` | rc.8（含 `/video/1` 修订） | **当前候选**，Draft PR；Chrome ZIP / Stay `.user.js` / Stay ZIP 已提交 |
| 顺序基线 | rc.5 → rc.6 → rc.7 → rc.8 | rc.8 先原样提交补丁，再提交修订 |
| Chrome for Testing 153 真实安装 + 真实 X 页面 | rc.8 | 已验证（见 VERIFY_VIDEO_RC8.md）；原生授权对话框与 Edge 未测 |
| 真实 iPhone / iPad Safari + Stay | rc.8 | **未验收** |

历史 Chromium rc.2/rc.5/rc.7 与 Stay rc.3/rc.5/rc.7 安装包均保留原字节。校验和见 `releases/RC8_CHECKSUMS_SHA256.txt`。
