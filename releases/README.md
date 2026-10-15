# 安装包与回退版本

当前版本：**v1.0.0-rc.8**（已并入 `main`；桌面已实测，iPhone/Stay 由用户真机验收）。

- Chromium: [`X-Capture-Studio-Chrome-v1.0.0-rc.8.zip`](X-Capture-Studio-Chrome-v1.0.0-rc.8.zip)
- Safari + Stay: [`X-Capture-Studio-Stay-v1.0.0-rc.8.user.js`](X-Capture-Studio-Stay-v1.0.0-rc.8.user.js)
- Stay ZIP: [`X-Capture-Studio-Stay-v1.0.0-rc.8.zip`](X-Capture-Studio-Stay-v1.0.0-rc.8.zip)
- 校验和：[`RC8_CHECKSUMS_SHA256.txt`](RC8_CHECKSUMS_SHA256.txt)；可用 `npm run build && python3 scripts/package_release.py --check` 从源码重建并比对字节。

回退保留：Chromium rc.7/rc.5/rc.2、Stay rc.7/rc.5/rc.3，保持原字节。详见 [`../docs/VERIFY_VIDEO_RC8.md`](../docs/VERIFY_VIDEO_RC8.md)。
