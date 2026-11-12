#!/usr/bin/env python3
"""Export tracked working-tree source and checksum-verified public skill packages.

Never traverses .local, outputs, credentials, caches or dependency directories.
Does not export a database or change local application state.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
EXTRA = (
    'scripts/export-clean-source.py', 'docs/clean-server-install.md',
    'scripts/verify-release-skills.py', '.github/workflows/video-linux.yml',
    'integrations/aitoearn/source/project/aitoearn-backend/Dockerfile.production',
    'integrations/aitoearn/source/project/aitoearn-backend/Dockerfile.production.dockerignore',
    'integrations/aitoearn/source/project/aitoearn-backend/scripts/prepare-production.mjs',
    'integrations/aitoearn/source/project/aitoearn-backend/scripts/start-production.mjs',
)
PRIVATE_PARTS = {'.local', '.git', '.secrets', '.aws', '.ssh', '.claude-session',
                 'node_modules', 'outputs', '.taste-skill', '.nx', '.vite',
                 'playwright-report', 'test-results', '__pycache__'}


def checked_path(name):
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or any(x in PRIVATE_PARTS for x in p.parts):
        raise ValueError('Private or unsafe path refused')
    base = p.name.lower()
    if ((base.startswith('.env') and base != '.env.example') or
        base in {'restore-key.json', 'operations-config.key'} or
        base.endswith(('.dump', '.backup', '.db', '.sqlite', '.sqlite3', '.log', '.rdb', '.aof'))):
        raise ValueError('Private file type refused')
    source = ROOT / name
    if source.is_symlink() or not source.resolve().is_relative_to(ROOT):
        raise ValueError('Symlink or external file refused')
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='New .tar.gz file outside the project')
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if output.is_relative_to(ROOT) or output.exists():
        parser.error('Output must be a new file outside the project')
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    names = set(filter(None, tracked)) | set(EXTRA)
    catalog = json.loads((ROOT / 'skills/catalog/catalog.json').read_text(encoding='utf-8'))
    expected = {}
    for item in catalog['items']:
        download = item.get('download', {})
        if download.get('status') != 'downloaded':
            continue
        name = download['packagePath']
        if not name.startswith('skills/packages/') or not name.endswith('.zip'):
            raise ValueError('Unexpected skill package location')
        digest = download['sha256']
        if name in expected and expected[name] != digest:
            raise ValueError('Conflicting skill package checksums')
        expected[name] = digest
        names.add(name)
    # Validate the full input list before creating an archive.
    for name in names:
        if not checked_path(name).is_file():
            raise ValueError('Missing release source or skill package')
    output.parent.mkdir(parents=True, exist_ok=True)
    os.umask(0o077)
    manifest = []
    fd, temporary = tempfile.mkstemp(prefix='.release-', dir=output.parent)
    try:
        with os.fdopen(fd, 'wb') as raw, tarfile.open(fileobj=raw, mode='w:gz') as archive:
            for name in sorted(names):
                source = checked_path(name)
                data = source.read_bytes()
                digest = hashlib.sha256(data).hexdigest()
                if name in expected and digest != expected[name]:
                    raise ValueError('Skill package checksum mismatch; export stopped')
                info = tarfile.TarInfo('wishtaday/' + name)
                info.size = len(data)
                info.mode = 0o755 if source.stat().st_mode & 0o111 else 0o644
                archive.addfile(info, io.BytesIO(data))
                manifest.append({'path': name, 'sha256': digest, 'bytes': len(data)})
            data = json.dumps({'files': manifest, 'skillPackages': len(expected)}, indent=2).encode()
            info = tarfile.TarInfo('wishtaday/RELEASE-CONTENTS.json')
            info.size, info.mode = len(data), 0o644
            archive.addfile(info, io.BytesIO(data))
        # Atomic creation without overwriting an existing destination.
        os.link(temporary, output)
    finally:
        os.unlink(temporary)
    print(json.dumps({'files': len(manifest), 'verifiedSkillPackages': len(expected),
                      'archiveBytes': output.stat().st_size, 'output': str(output)}))


if __name__ == '__main__':
    main()
