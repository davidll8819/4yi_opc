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
    if not (root / name).exists():
        matches = [i['download'] for i in catalog['items'] if i.get('download', {}).get('packagePath') == name]
        assert all(len(d.get('sources', [])) == 2 and 'e3a7b9103dfbb5fea4ee33022d501eba2f7680d8' in d['sources'][0] and d['sources'][1].startswith('https://api.github.com/repos/davidll8819/4yi_opc/git/blobs/') for d in matches)
        continue
    with (root / name).open('rb') as source:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(chunk)
        actual = checksum.hexdigest()
    if actual != digest:
        raise SystemExit('Public skill archive checksum mismatch: ' + name)
print(f'Verified {len(expected)} public skill archive declarations (local files checked when present); no skill scripts executed')
