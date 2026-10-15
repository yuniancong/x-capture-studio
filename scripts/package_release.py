"""Deterministic release packaging from dist/ (run `npm run build` first).
Fixed timestamps/permissions/order, so a rebuild from source yields identical bytes.
Usage: python3 scripts/package_release.py [--check]"""
import hashlib, json, pathlib, sys, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
TAG = VERSION.split('-')[-1].replace('.', '')  # e.g. rc8
REL = ROOT / 'releases'
STAMP = (2026, 10, 16, 0, 0, 0)

def write_zip(target: pathlib.Path, members: list[tuple[str, pathlib.Path]]) -> None:
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, src in sorted(members):
            info = zipfile.ZipInfo(name, STAMP); info.external_attr = 0o644 << 16; info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, src.read_bytes())

def build(out: pathlib.Path) -> dict[str, str]:
    out.mkdir(parents=True, exist_ok=True)
    ext = ROOT / 'dist' / 'extension'
    if not (ext / 'manifest.json').exists(): raise SystemExit('dist/extension missing: run npm run build')
    names = {'chrome': f'X-Capture-Studio-Chrome-v{VERSION}.zip', 'userjs': f'X-Capture-Studio-Stay-v{VERSION}.user.js', 'stay': f'X-Capture-Studio-Stay-v{VERSION}.zip'}
    write_zip(out / names['chrome'], [(p.relative_to(ext).as_posix(), p) for p in ext.rglob('*') if p.is_file() and p.name != '.DS_Store'])
    userjs = ROOT / 'dist' / 'X-Capture-Studio.user.js'
    (out / names['userjs']).write_bytes(userjs.read_bytes())
    write_zip(out / names['stay'], [(f'x-capture-{TAG}-stay.user.js', userjs), (f'INSTALL_{TAG.upper()}.md', ROOT / f'INSTALL_{TAG.upper()}.md'),
                                    ('LICENSE', ROOT / 'LICENSE'), ('THIRD_PARTY_NOTICES.md', ROOT / 'vendor' / 'THIRD_PARTY_NOTICES.md')])
    return {n: hashlib.sha256((out / n).read_bytes()).hexdigest() for n in names.values()}

if __name__ == '__main__':
    if '--check' in sys.argv:
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            fresh = build(pathlib.Path(tmp))
        bad = [n for n, h in fresh.items() if not (REL / n).exists() or hashlib.sha256((REL / n).read_bytes()).hexdigest() != h]
        print(json.dumps({'rebuilt': fresh, 'mismatch': bad}, indent=2)); sys.exit(1 if bad else 0)
    sums = build(REL)
    (REL / f'{TAG.upper()}_CHECKSUMS_SHA256.txt').write_text(''.join(f'{h}  {n}\n' for n, h in sums.items()))
    print(json.dumps(sums, indent=2))
