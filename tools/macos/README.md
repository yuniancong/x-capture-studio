# 可选：把 Finder「来源」改为原帖地址

仅用于 macOS；插件正常截图不需要此工具，也不需要 Python。

## 它解决什么

PNG / PDF 内部已经含有原帖链接，但 Finder「显示简介 → 更多信息 → 来源」读取的是另一层文件属性。通过 Blob 下载时 Chromium 可能把它设为 `https://x.com/`。本工具从原始导出文件中读取有效来源，要求你确认，然后只设置选中文件的 `com.apple.metadata:kMDItemWhereFroms`。

不会访问 X、上传文件、改正文、改文件权限、请求管理员权限、移除安全隔离标记、安装后台服务。主帖链接排在第一位；其他已选帖子及可确定的引用链接可以列在后面。

## 最简单用法

需要已安装的 Python 3；不假设 macOS 自带 Python。双击 `设置Finder原帖来源.command`，选择原始 PNG / PDF，检查将写入的链接，确认即可。若系统安全提示阻止启动，不要关闭系统安全保护；可先审阅源码，再在已有 Python 环境的终端执行下面的命令。

```sh
python3 /path/to/finder_source.py /path/to/capture.png
```

将示例路径替换为实际位置，含空格的路径需要引号。工具旁边的三个文件需放在同一文件夹。

## 只读核验 / 恢复

```sh
python3 /path/to/finder_source.py --inspect /path/to/capture.png
python3 /path/to/finder_source.py --restore /path/to/capture.png
```

写入前会在导出文件旁建立 `原文件名.finder-source-backup.json`；保留它才能恢复先前的该字段。不要更改备份里的路径或内容。只有来源字段恢复，图片/PDF 正文从未被改动。

匿名文件、转码后移除元数据的文件、无有效来源、符号链接或超过 256 MB 的文件不处理；不从文件名推测链接。不允许工具修改你没有写入权限的文件。

## 验证状态

已在当前 Linux 测试环境独立解析真实导出的 PNG / PDF，检查源 URL 顺序；通过模拟扩展属性写入 / 回读 / 恢复测试，并确认文件正文 SHA-256 不变。**macOS AppleScript 文件选择、真实扩展属性写入以及 Finder 刷新显示尚未实机验证。** 如果未完成，工具会报告，不能把读取通过当作已修改成功。

## 依据（核查日期 2026-09-25）

- Chromium Blob 来源处理：https://raw.githubusercontent.com/chromium/chromium/main/components/download/internal/common/base_file.cc ，`GetEffectiveAuthorityURL`。
- macOS WhereFroms 写入：https://chromium.googlesource.com/chromium/src/+/ff31fdd149688bcd4cd52488312c8a4257847777/components/services/quarantine/quarantine_mac.mm 。
