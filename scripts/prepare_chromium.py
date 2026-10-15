#!/usr/bin/env python3
"""Download, verify and safely unpack the pinned X Capture Studio extension.

This prepares a local extension directory. Browser-managed permission/activation is
intentionally left to the human user; there is no policy/profile/security bypass.
Works with Python 3.9+ standard library (macOS / Windows / Linux).
"""
from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

VERSION = '1.0.0-rc.7'
SOURCE_REF = 'feature/multimedia-rc7'  # Candidate branch, SHA-256 pinned below; switch to main after merge
ARCHIVE = f'X-Capture-Studio-Chrome-v{VERSION}.zip'
URL = f'https://raw.githubusercontent.com/yuniancong/x-capture-studio/{SOURCE_REF}/releases/{ARCHIVE}'
SHA256 = 'bdad62a983b5072f69e0640a9195f27b9dcd13c5ac85956c1eceaa2fc473a65b'
LIMIT_BYTES = 25 * 1024 * 1024


def default_destination() -> Path:
    if sys.platform == 'darwin':
        base = Path.home() / 'Library' / 'Application Support'
    elif os.name == 'nt':
        base = Path(os.environ.get('LOCALAPPDATA') or (Path.home() / 'AppData' / 'Local'))
    else:
        base = Path(os.environ.get('XDG_DATA_HOME') or (Path.home() / '.local' / 'share'))
    return base / 'XCaptureStudio' / 'extension'


def verified_archive(path: Path) -> None:
    if not path.is_file():
        raise ValueError('未找到安装包。')
    if path.stat().st_size > LIMIT_BYTES:
        raise ValueError('安装包超出体积上限。')
    h = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            h.update(block)
    if h.hexdigest() != SHA256:
        raise ValueError('SHA-256 校验失败：拒绝解压或安装。')


def download_archive(path: Path) -> None:
    request = urllib.request.Request(URL, headers={'User-Agent': 'XCaptureStudio-Installer/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response, path.open('wb') as target:
        total = 0
        while True:
            data = response.read(1024 * 1024)
            if not data:
                break
            total += len(data)
            if total > LIMIT_BYTES:
                raise ValueError('下载体积超过安全限制。')
            target.write(data)


def safe_extract(archive: Path, target: Path) -> None:
    with zipfile.ZipFile(archive, 'r') as z:
        infos = z.infolist()
        if len(infos) > 150:
            raise ValueError('安装包文件数量异常。')
        names = [i.filename for i in infos if not i.is_dir()]
        if not {'manifest.json', 'content.js', 'background.js'}.issubset(names):
            raise ValueError('安装包缺少必要的 MV3 扩展文件。')
        for member in infos:
            name = member.filename
            posix = PurePosixPath(name)
            if (name.startswith(('/', '\\')) or '\\' in name or ':' in name or
                    any(part in ('..', '') for part in posix.parts) or len(posix.parts) > 8):
                raise ValueError('安装包存在不安全路径。')
            # Unix mode bits: reject symlinks and non-regular objects.
            kind = (member.external_attr >> 16) & 0o170000
            if kind not in (0, 0o040000, 0o100000):
                raise ValueError('安装包存在非普通文件或符号链接。')
        z.extractall(target)


def main() -> int:
    parser = argparse.ArgumentParser(description='Prepare X Capture Studio (Chromium).')
    parser.add_argument('--dest', type=Path, default=default_destination(), help='extension directory')
    parser.add_argument('--archive', type=Path, help='use a locally downloaded ZIP instead of network')
    parser.add_argument('--replace', action='store_true', help='replace existing installation after confirmation (backup original)')
    args = parser.parse_args()
    if args.dest.expanduser().is_symlink():
        raise ValueError('拒绝将安装目录设置为符号链接。')
    dest = args.dest.expanduser().resolve()
    if dest.is_symlink():
        raise ValueError('拒绝将安装目录设置为符号链接。')
    if dest.exists() and not args.replace:
        raise ValueError(f'目标目录已经存在，未覆盖：{dest}\n如需升级，请先备份并显式使用 --replace。')
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='xc-verify-') as tmp:
        temp = Path(tmp)
        archive = args.archive.expanduser().resolve() if args.archive else temp / ARCHIVE
        if not args.archive:
            print(f'正在从固定提交下载 {ARCHIVE} ...')
            download_archive(archive)
        verified_archive(archive)
        extracted = temp / 'extension'
        extracted.mkdir()
        safe_extract(archive, extracted)
        original: Path | None = None
        if dest.exists():
            suffix = 1
            while (dest.parent / f'{dest.name}.backup-{suffix}').exists():
                suffix += 1
            original = dest.parent / f'{dest.name}.backup-{suffix}'
            dest.rename(original)
        try:
            shutil.copytree(extracted, dest)
        except Exception:
            if dest.exists():
                shutil.rmtree(dest)
            if original:
                original.rename(dest)
            raise
    print('\n安装文件准备完成（尚未通过浏览器授权/启用）。')
    print(f'扩展目录：{dest}')
    if original:
        print(f'旧版本备份：{original}')
    print('\n请在 Chrome 中打开 chrome://extensions；Edge 中打开 edge://extensions。')
    print('打开「开发者模式」→「加载已解压的扩展程序」→ 选择上面的扩展目录。')
    print('根据浏览器提示确认站点访问权限，然后刷新 x.com 的帖子详情页。')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, urllib.error.URLError, zipfile.BadZipFile) as exc:
        print(f'安装准备失败：{exc}', file=sys.stderr)
        raise SystemExit(1)
