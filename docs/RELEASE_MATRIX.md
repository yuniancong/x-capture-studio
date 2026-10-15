# 版本矩阵（2026-10-16）

| 对象 | 版本 | 状态 |
|---|---|---|
| GitHub `main` | **rc.8** | 2026-10-16 经 PR #2 并入（含 rc.7）；历史未改写 |
| 分支 `feature/multimedia-rc7` | rc.7 | 历史候选，未改动 |
| 分支 `feat/rc8-video-discovery` | rc.8 | 已合并到 main |
| 顺序基线 | rc.5 → rc.6 → rc.7 → rc.8 | rc.8 先原样提交补丁，再提交修订 |
| Chrome for Testing 153 真实安装 + 真实 X 页面 | rc.8 | 已验证（见 VERIFY_VIDEO_RC8.md）；原生授权对话框与 Edge 未测 |
| 真实桌面 Chrome（用户） | rc.8 | 用户测试通过（2026-10-16） |
| 真实 iPhone / iPad Safari + Stay | rc.8 | 由用户按 VERIFY_VIDEO_RC8.md 验收 |

历史 Chromium rc.2/rc.5/rc.7 与 Stay rc.3/rc.5/rc.7 安装包均保留原字节。校验和见 `releases/RC8_CHECKSUMS_SHA256.txt`。
