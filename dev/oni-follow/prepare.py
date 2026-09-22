#!/usr/bin/env python3
"""Verify pinned archives and apply fixture-only patches in a new directory.

No downloads, package installation, builds, container operations or trust changes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import zipfile

bundle = Path(__file__).resolve().parent
manifest = json.loads((bundle / 'manifest.json').read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--oni-archive', type=Path, required=True)
parser.add_argument('--processing-archive', type=Path, required=True)
parser.add_argument('--filters-archive', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()

def digest(data):
    return hashlib.sha256(data).hexdigest()

archives = {'oni': args.oni_archive, 'processing': args.processing_archive, 'filters': args.filters_archive}
for project, archive in archives.items():
    if digest(archive.read_bytes()) != manifest[project]['archive_sha256']:
        raise SystemExit(f'{project}: original archive checksum mismatch')
    if digest((bundle / f'{project}.patch').read_bytes()) != manifest[project]['patch_sha256']:
        raise SystemExit(f'{project}: patch checksum mismatch')

output = args.output.resolve()
if output.exists():
    raise SystemExit('Output must be a new, nonexistent directory; refusing to overwrite.')
output.mkdir(parents=True)

def write_member(project, name, data):
    relative = Path(name)
    if relative.is_absolute() or '..' in relative.parts:
        raise SystemExit('Unsafe archive member')
    target = output / project / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

with tarfile.open(args.oni_archive) as archive:
    if archive.pax_headers.get('comment') != manifest['oni']['commit']:
        raise SystemExit('ONI archive commit identity mismatch')
    for member in archive.getmembers():
        if member.isfile() and '/' in member.name:
            write_member('oni', member.name.split('/', 1)[1], archive.extractfile(member).read())

for project in ('processing', 'filters'):
    prefix = f"github.com/go-ap/{project}@{manifest[project]['version']}/"
    with zipfile.ZipFile(archives[project]) as archive:
        for name in archive.namelist():
            if name.startswith(prefix) and not name.endswith('/'):
                write_member(project, name[len(prefix):], archive.read(name))

for project, entries in manifest['files'].items():
    for name, hashes in entries.items():
        path = output / project / name
        if hashes['original_sha256'] is None:
            if path.exists():
                raise SystemExit(f'{project}/{name}: unexpected original file')
        elif digest(path.read_bytes()) != hashes['original_sha256']:
            raise SystemExit(f'{project}/{name}: original file checksum mismatch')
    subprocess.run(['patch', '--batch', '-p1', '-i', str(bundle / f'{project}.patch')],
                   cwd=output / project, check=True)
    for name, hashes in entries.items():
        if digest((output / project / name).read_bytes()) != hashes['patched_sha256']:
            raise SystemExit(f'{project}/{name}: patched file checksum mismatch')

# Relocatable local module replacement; never bake a workstation path into a patch.
go_mod = output / 'oni' / 'go.mod'
go_mod.write_text(go_mod.read_text() + '\nreplace github.com/go-ap/processing => ../processing\nreplace github.com/go-ap/filters => ../filters\n')
# API-only fixture: satisfy go:embed without fetching/building the ONI web UI.
static = output / 'oni' / 'static'
static.mkdir(exist_ok=True)
(static / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
print('Prepared verified experimental ONI, processing and filters sources; no build was run.')
