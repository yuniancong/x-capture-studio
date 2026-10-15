#!/usr/bin/env python3
"""Optional local Finder source repair for X Capture original PNG/PDF exports.

Only writes com.apple.metadata:kMDItemWhereFroms. It never removes quarantine,
changes system permissions, opens source URLs, uploads data or installs a service.
Python 3 is required; it is not assumed to be bundled with macOS.

python3 finder_source.py --inspect capture.png    # read-only, any OS
python3 finder_source.py capture.png             # asks before writing on macOS
python3 finder_source.py --restore capture.png   # restores its saved previous field
"""
from __future__ import annotations
import argparse, base64, ctypes, ctypes.util, datetime, errno, html, json, os, pathlib
import plistlib, re, stat, struct, subprocess, sys, zlib
from urllib.parse import urlsplit

ATTRIBUTE = 'com.apple.metadata:kMDItemWhereFroms'
MAX_FILE = 256 * 1024 * 1024
MAX_METADATA = 2 * 1024 * 1024
MISSING_ATTR = {getattr(errno, 'ENOATTR', 93), getattr(errno, 'ENODATA', 61)}

# os.getxattr/setxattr/removexattr exist only on Linux; macOS needs libc via ctypes.
_libc = None
def _darwin_libc():
    global _libc
    if _libc is None:
        lib = ctypes.CDLL(ctypes.util.find_library('c'), use_errno=True)
        lib.getxattr.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p,
                                 ctypes.c_size_t, ctypes.c_uint32, ctypes.c_int]
        lib.getxattr.restype = ctypes.c_ssize_t
        lib.setxattr.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p,
                                 ctypes.c_size_t, ctypes.c_uint32, ctypes.c_int]
        lib.setxattr.restype = ctypes.c_int
        lib.removexattr.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
        lib.removexattr.restype = ctypes.c_int
        _libc = lib
    return _libc

XATTR_NOFOLLOW = 0x0001  # <sys/xattr.h>; read_file already rejects symlinks.

def _raise(path) -> None:
    code = ctypes.get_errno()
    raise OSError(code, os.strerror(code), str(path))

def getxattr(path, name: str) -> bytes:
    if hasattr(os, 'getxattr'):
        return os.getxattr(path, name)
    lib, p, n = _darwin_libc(), os.fsencode(path), name.encode()
    size = lib.getxattr(p, n, None, 0, 0, XATTR_NOFOLLOW)
    if size < 0:
        _raise(path)
    buf = ctypes.create_string_buffer(size)
    size = lib.getxattr(p, n, buf, size, 0, XATTR_NOFOLLOW)
    if size < 0:
        _raise(path)
    return buf.raw[:size]

def setxattr(path, name: str, value: bytes) -> None:
    if hasattr(os, 'setxattr'):
        return os.setxattr(path, name, value)
    if _darwin_libc().setxattr(os.fsencode(path), name.encode(), value, len(value), 0, XATTR_NOFOLLOW) < 0:
        _raise(path)

def removexattr(path, name: str) -> None:
    if hasattr(os, 'removexattr'):
        return os.removexattr(path, name)
    if _darwin_libc().removexattr(os.fsencode(path), name.encode(), XATTR_NOFOLLOW) < 0:
        _raise(path)

def permalink(value: str) -> str | None:
    try:
        u = urlsplit(value)
        if u.scheme not in ('http', 'https') or u.username or u.password:
            return None
        if not re.fullmatch(r'(?:www\.|mobile\.)?(?:x\.com|twitter\.com)', u.hostname or ''):
            return None
        m = re.match(r'^/(?:\w+/status/\d+|i/article/\d+|i/web/status/\d+)(?=/|$)', u.path)
        return 'https://x.com' + m.group(0) if m else None
    except ValueError:
        return None

def png_records(data: bytes) -> dict[str, str]:
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('不是 PNG 原文件。')
    records: dict[str, str] = {}; pos = 8
    while pos + 12 <= len(data):
        size = struct.unpack('>I', data[pos:pos+4])[0]
        end = pos + 12 + size
        if end > len(data):
            raise ValueError('PNG 块不完整，未修改文件。')
        kind = data[pos+4:pos+8]; content = data[pos+8:pos+8+size]
        if kind in (b'iTXt', b'tEXt') and size <= MAX_METADATA:
            expected = struct.unpack('>I', data[pos+8+size:end])[0]
            if zlib.crc32(kind + content) & 0xffffffff != expected:
                raise ValueError('PNG 元数据校验失败，未修改文件。')
            key, sep, rest = content.partition(b'\0')
            if sep:
                if kind == b'iTXt':
                    if len(rest) < 2 or rest[:2] != b'\0\0':
                        pos = end; continue  # Our exporter writes uncompressed iTXt only.
                    fields = rest[2:].split(b'\0', 2)
                    if len(fields) != 3:
                        pos = end; continue
                    rest = fields[2]
                records[key.decode('latin1')] = rest.decode('utf-8', errors='replace')
        pos = end
        if kind == b'IEND':
            return records
    raise ValueError('PNG 缺少结束块，未修改文件。')

def sources_from_bytes(data: bytes) -> list[str]:
    candidates: list[str] = []
    if data.startswith(b'\x89PNG'):
        records = png_records(data)
        candidates.extend([records.get('SourceURL', ''), records.get('Source', '')])
        candidates.extend(records.get('Sources', '').splitlines())
        try:
            doc = json.loads(records.get('XCapture', '{}'))
            if not candidates[0]:
                candidates.insert(0, doc.get('root', ''))
            candidates.extend(s.get('url', '') for s in doc.get('sources', []) if isinstance(s, dict))
        except (ValueError, AttributeError, TypeError):
            pass
    elif data.startswith(b'%PDF-'):
        # X Capture deliberately keeps its XMP stream uncompressed. No general PDF execution/parsing.
        for match in re.finditer(rb'<dc:source>(.*?)</dc:source>', data, re.S):
            part = match.group(1)
            if len(part) > MAX_METADATA:
                continue
            for value in re.findall(rb'<rdf:li>(.*?)</rdf:li>', part, re.S):
                candidates.append(html.unescape(value.decode('utf-8', errors='replace')))
    else:
        raise ValueError('仅支持 X Capture 下载的 PNG 或 PDF 原文件。')
    result: list[str] = []
    for item in candidates:
        url = permalink(item) if isinstance(item, str) else None
        if url and url not in result:
            result.append(url)
    if not result:
        raise ValueError('没有找到有效的原帖链接。匿名导出或转码文件可能没有来源；不会从文件名猜测。')
    return result

def read_file(path: pathlib.Path) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise ValueError('请选择普通文件，不处理符号链接或目录。')
    if path.stat().st_size > MAX_FILE:
        raise ValueError('文件超过 256 MB，未处理。')
    return path.read_bytes()

def backup_path(path: pathlib.Path) -> pathlib.Path:
    return path.with_name(path.name + '.finder-source-backup.json')

def apply_sources(path: pathlib.Path, sources: list[str]) -> None:
    old = None
    try:
        old = getxattr(path, ATTRIBUTE)
    except OSError as exc:
        if exc.errno not in MISSING_ATTR:
            raise
    backup = backup_path(path)
    if not backup.exists():
        payload = {'format': 'x-capture-finder-source-backup', 'path': str(path.resolve()),
                   'previous': base64.b64encode(old).decode() if old is not None else None,
                   'date': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        # Exclusive create; never overwrite an earlier recovery point or follow a symlink.
        with backup.open('x', encoding='utf-8') as out:
            json.dump(payload, out, ensure_ascii=False, indent=2)
    data = plistlib.dumps(sources, fmt=plistlib.FMT_BINARY)
    setxattr(path, ATTRIBUTE, data)
    if plistlib.loads(getxattr(path, ATTRIBUTE)) != sources:
        raise RuntimeError('写入后的来源核验不一致，请保留备份文件。')

def restore(path: pathlib.Path) -> None:
    backup = backup_path(path)
    if backup.is_symlink() or backup.stat().st_size > MAX_METADATA:
        raise ValueError('来源备份无效。')
    doc = json.loads(backup.read_text(encoding='utf-8'))
    if doc.get('format') != 'x-capture-finder-source-backup' or doc.get('path') != str(path.resolve()):
        raise ValueError('备份与此文件不匹配。')
    old = doc.get('previous')
    if old is None:
        try:
            removexattr(path, ATTRIBUTE)
        except OSError as exc:
            if exc.errno not in MISSING_ATTR:
                raise
    else:
        setxattr(path, ATTRIBUTE, base64.b64decode(old, validate=True))

def choose_file() -> pathlib.Path:
    script = 'set f to choose file with prompt "选择 X Capture 下载的 PNG / PDF 原文件"\nreturn POSIX path of f'
    r = subprocess.run(['/usr/bin/osascript', '-e', script], text=True, capture_output=True, check=False)
    if r.returncode:
        raise ValueError('已取消选择文件。')
    return pathlib.Path(r.stdout.rstrip('\n'))

def confirm(path: pathlib.Path, sources: list[str], restoring: bool = False) -> bool:
    text = ('恢复先前的 Finder 来源字段' if restoring else '将 Finder 的来源设为：\n' + '\n'.join(sources[:6]))
    text += '\n\n文件：' + path.name + '\n只修改此文件的来源属性；不改图片/PDF正文、不移除安全隔离属性。'
    script = '''on run argv
      display dialog (item 1 of argv) with title "X Capture · Finder 来源" buttons {"取消", "确认"} default button "确认" cancel button "取消"
    end run'''
    return subprocess.run(['/usr/bin/osascript', '-e', script, text], capture_output=True, check=False).returncode == 0

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true', help='只读取来源，不写任何内容')
    parser.add_argument('--restore', action='store_true', help='恢复旁边备份记录中的原来源属性')
    parser.add_argument('files', nargs='*', type=pathlib.Path)
    args = parser.parse_args()
    if not args.inspect and sys.platform != 'darwin':
        parser.error('写入/恢复仅在 macOS 运行；可使用 --inspect 做只读检查。')
    if args.inspect and not args.files:
        parser.error('--inspect 需要文件路径。')
    paths = args.files or [choose_file()]
    failed = False
    for path in paths:
        try:
            data = read_file(path)
            if args.restore:
                if confirm(path, [], True):
                    restore(path); print('已恢复：' + path.name)
                continue
            sources = sources_from_bytes(data)
            print(path.name + '\n' + '\n'.join(sources))
            if not args.inspect and confirm(path, sources):
                apply_sources(path, sources); print('已写入并回读核验；请关闭并重新打开 Finder 的「显示简介」。')
        except (OSError, ValueError, RuntimeError) as exc:
            failed = True; print('未完成：' + str(exc), file=sys.stderr)
    return int(failed)

if __name__ == '__main__':
    raise SystemExit(main())
