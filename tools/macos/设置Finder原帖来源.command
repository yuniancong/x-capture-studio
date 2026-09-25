#!/bin/sh
# Optional, user-invoked one-shot tool. No installation, admin privileges or background agent.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' '此可选工具需要 Python 3。当前未找到；没有修改任何文件。插件本身不需要 Python。'
else
  python3 "$HERE/finder_source.py" "$@"
fi
printf '\n%s\n' '按回车关闭。'
read -r unused
