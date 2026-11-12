"""Check release skill archives without unpacking or running skill code."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'skills/catalog/catalog.json').read_text(encoding='utf-8'))
expected = {}
for item in catalog['items']:
    download = item.get('download', {})
    if download.get('status') != 'downloaded':
        continue
    name, digest = download['packagePath'], download['sha256']
    assert name.startswith('skills/packages/') and name.endswith('.zip')
    path = root / name
    assert not path.is_symlink() and path.resolve().is_relative_to(root / 'skills/packages')
    assert name not in expected or expected[name] == digest
    expected[name] = digest
for name, digest in expected.items():
    with (root / name).open('rb') as source:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(chunk)
        actual = checksum.hexdigest()
    if actual != digest:
        raise SystemExit('Public skill archive checksum mismatch: ' + name)
print(f'Verified {len(expected)} public skill archives; no skill scripts executed')
