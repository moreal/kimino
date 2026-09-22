#!/usr/bin/env python3
"""Build and operate the explicitly patched, isolated two-actor C2S fixture."""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import ssl
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / 'dev' / 'oni-follow'
PROJECT = 'kimino-c2s-follow'
CADDY = 'caddy@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d'
PASSWORD = 'kimino-follow-local-only'
MAX_RESPONSE = 1_048_576


def fail(message):
    raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def output(command):
    return subprocess.check_output(command, stderr=subprocess.DEVNULL, text=True).strip()


def atomic(path, data):
    temporary = path.with_name(path.name + '.new')
    temporary.write_bytes(data)
    os.replace(temporary, path)


class LoopbackHTTPS(http.client.HTTPSConnection):
    """Keep canonical TLS SNI/Host while connecting only to host loopback."""
    def connect(self):
        sock = socket.create_connection(('127.0.0.1', self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class Fixture:
    def __init__(self, args):
        self.directory = args.directory.resolve()
        self.port = args.port
        default_directory = (ROOT / '.local/c2s-follow').resolve()
        suffix = sha((str(self.directory) + ":" + str(self.port)).encode())[:10]
        self.project = PROJECT if self.directory == default_directory and self.port == 18448 else PROJECT + "-" + suffix
        if self.port < 1024 or self.port > 65535 or self.port in (8443, 18447):
            fail('Use an unreserved port from 1024–65535; 8443 and 18447 belong to existing fixtures.')
        self.manifest = json.loads((BUNDLE / 'manifest.json').read_text())
        parts = [BUNDLE / name for name in ('manifest.json', 'oni.patch', 'processing.patch', 'filters.patch', 'prepare.py', 'Dockerfile')]
        self.fingerprint = sha(b''.join(p.read_bytes() for p in parts))
        self.image = 'kimino-oni-follow:58be49b-' + self.fingerprint[:12]
        self.cache = Path(os.environ.get('KIMINO_FOLLOW_CACHE_DIR', self.directory / 'cache')).resolve()
        self.source = self.directory / 'source' / self.fingerprint[:12]
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        marker = self.directory / 'fixture.json'
        if not marker.exists() and any((self.directory / name).exists() for name in ('compose.yaml', 'Caddyfile', 'root.crt')):
            fail('Directory contains an unmanaged fixture; refusing to replace its configuration.')
        if marker.exists():
            state = json.loads(marker.read_text())
            if state.get('project') != self.project or state.get('port') != self.port:
                fail('Fixture directory identity differs; choose its original port and directory.')

    def compose(self, *arguments, **kwargs):
        return run(['docker', 'compose', '--project-name', self.project, '-f', str(self.directory / 'compose.yaml'), *arguments], **kwargs)

    def render(self):
        text = (ROOT / 'compose.follow.yaml').read_text().replace('name: kimino-c2s-follow\n', 'name: ' + self.project + '\n', 1)
        values = {
            '${KIMINO_FOLLOW_PORT:-18448}': str(self.port),
            '${KIMINO_FOLLOW_IMAGE:-kimino-oni-follow:58be49b-reviewed}': self.image,
            '${KIMINO_FOLLOW_FIXTURE_DIR:-./.local/c2s-follow}': json.dumps(str(self.directory))[1:-1],
        }
        for old, new in values.items():
            text = text.replace(old, new)
        if '${' in text:
            fail('Unresolved fixture configuration variable.')
        atomic(self.directory / 'compose.yaml', text.encode())
        atomic(self.directory / 'Caddyfile', (BUNDLE / 'Caddyfile.template').read_text().replace('FOLLOW_PORT', str(self.port)).encode())
        atomic(self.directory / 'fixture.json', (json.dumps({'project': self.project, 'port': self.port, 'image': self.image, 'bundle': self.fingerprint}, indent=2) + '\n').encode())

    def archive(self, project):
        spec = self.manifest[project]
        downloads = self.cache / 'downloads'
        downloads.mkdir(parents=True, exist_ok=True)
        path = downloads / spec['archive_basename']
        if not path.exists():
            request = urllib.request.Request(spec['archive_url'], headers={'User-Agent': 'Kimino-C2S-fixture'})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read(64 * 1024 * 1024 + 1)
            if len(data) > 64 * 1024 * 1024 or sha(data) != spec['archive_sha256']:
                fail(f'{project}: downloaded archive checksum or size mismatch.')
            atomic(path, data)
        if sha(path.read_bytes()) != spec['archive_sha256']:
            fail(f'{project}: cached archive checksum mismatch; no build attempted.')
        return path

    def verify_sources(self):
        # The local module replacement is part of the reviewed build, not optional
        # metadata. Reconstruct all module files from checksum-verified originals.
        with tarfile.open(self.archive('oni')) as archive:
            member = next(m for m in archive.getmembers() if m.isfile() and m.name.count('/') == 1 and m.name.endswith('/go.mod'))
            original_oni_mod = archive.extractfile(member).read()
        original_modules = {}
        for project in ('processing', 'filters'):
            with zipfile.ZipFile(self.archive(project)) as archive:
                member = 'github.com/go-ap/' + project + '@' + self.manifest[project]['version'] + '/go.mod'
                original_modules[project] = archive.read(member)
        expected_modules = {
            'oni': original_oni_mod + b'\nreplace github.com/go-ap/processing => ../processing\nreplace github.com/go-ap/filters => ../filters\n',
            **original_modules,
        }
        for project, expected in expected_modules.items():
            if (self.source / project / 'go.mod').read_bytes() != expected:
                fail(f'{project}/go.mod: prepared module configuration changed; refusing to build.')
        for project, entries in self.manifest['files'].items():
            for name, hashes in entries.items():
                path = self.source / project / name
                if not path.is_file() or sha(path.read_bytes()) != hashes['patched_sha256']:
                    fail(f'{project}/{name}: prepared source changed; refusing to build.')

    def prepare(self):
        archives = {project: self.archive(project) for project in ('oni', 'processing', 'filters')}
        for project in archives:
            if sha((BUNDLE / f'{project}.patch').read_bytes()) != self.manifest[project]['patch_sha256']:
                fail(f'{project}: patch checksum mismatch.')
        if not self.source.exists():
            run([sys.executable, str(BUNDLE / 'prepare.py'), '--oni-archive', str(archives['oni']),
                 '--processing-archive', str(archives['processing']), '--filters-archive', str(archives['filters']), '--output', str(self.source)])
        self.verify_sources()
        self.render()
        print('Pinned originals and patched source hashes verified.', flush=True)

    def build(self):
        self.prepare()
        run([sys.executable, str(ROOT / "scripts/c2s-follow-fixture.test.py")])
        go = os.environ.get('KIMINO_FOLLOW_GO', 'go')
        try:
            version = output([go, 'version'])
        except (OSError, subprocess.CalledProcessError):
            fail('Go 1.26.x is unavailable; set KIMINO_FOLLOW_GO to its executable.')
        if 'go1.26.' not in version:
            fail('This fixture build requires Go 1.26.x (validated with 1.26.5). Set KIMINO_FOLLOW_GO if needed.')
        env = os.environ.copy()
        env.update({'GOMODCACHE': str(self.cache / 'go-mod'), 'GOCACHE': str(self.cache / 'go-cache'),
                    'GOEXPERIMENT': 'greenteagc', 'CGO_ENABLED': '0', 'GOWORK': 'off', 'GOENV': 'off', 'GOFLAGS': ''})
        # Tests run on the host; only the final binary is cross-compiled.
        env.pop('GOOS', None)
        env.pop('GOARCH', None)
        run([go, 'test', '-mod=mod', '-count=1', './...'], cwd=self.source / 'filters', env=env)
        run([go, 'test', '-mod=mod', '-tags', 'dev', '-run', 'TestKimino|Undo|Negating|BuildOutbox', '-count=1', '.'],
            cwd=self.source / 'processing', env=env)
        run([go, 'test', '-mod=mod', '-tags', 'dev,ssh,tui', '-run', '^(TestProbeReceivedIn|TestOwnCollection|TestProbePrivate|TestProbeProxy|TestProbeFollower)', '-count=1', '.'],
            cwd=self.source / 'oni', env=env)
        self.verify_sources()
        build = self.directory / 'build'
        build.mkdir(exist_ok=True)
        env.update({'GOOS': 'linux', 'GOARCH': 'amd64'})
        run([go, 'build', '-mod=mod', '-tags', 'dev,ssh,tui', '-ldflags',
             '-X git.sr.ht/~mariusor/oni.Version=master-58be49b-kimino-follow-fixture', '-o', str(build / 'oni'), './cmd/oni'],
            cwd=self.source / 'oni', env=env)
        shutil.copyfile(BUNDLE / 'Dockerfile', build / 'Dockerfile')
        run(['docker', 'build', '--pull=false', '--platform', 'linux/amd64', '--label',
             'io.kimino.follow.bundle=' + self.fingerprint, '-t', self.image, str(build)])
        atomic(self.directory / 'build.json', (json.dumps({'image': self.image, 'bundle': self.fingerprint,
            'go': version, 'binary_sha256': sha((build / 'oni').read_bytes())}, indent=2) + '\n').encode())
        print('Experimental follow image built and narrow regression tests passed.', flush=True)

    def has_image(self):
        try:
            label = output(['docker', 'image', 'inspect', '--format', '{{ index .Config.Labels "io.kimino.follow.bundle" }}', self.image])
            return label == self.fingerprint
        except subprocess.CalledProcessError:
            return False

    def up(self):
        if not self.has_image():
            self.build()
        else:
            self.prepare()
        try:
            output(['docker', 'image', 'inspect', CADDY])
        except subprocess.CalledProcessError:
            run(['docker', 'pull', CADDY])
        self.compose('up', '-d', '--pull', 'never', 'gateway')
        deadline = time.monotonic() + 60
        while True:
            try:
                certificate = subprocess.check_output(['docker', 'compose', '--project-name', self.project, '-f',
                    str(self.directory / 'compose.yaml'), 'exec', '-T', 'gateway', 'cat',
                    '/data/caddy/pki/authorities/local/root.crt'], stderr=subprocess.DEVNULL, timeout=5)
                ssl.create_default_context(cadata=certificate.decode())
                atomic(self.directory / 'root.crt', certificate)
                break
            except (OSError, ValueError, subprocess.SubprocessError):
                if time.monotonic() >= deadline:
                    fail('Temporary gateway CA was not ready after 60 seconds.')
                time.sleep(1)
        self.compose('up', '-d', '--pull', 'never')
        self.seed()
        self.env()

    def request(self, actor, path, payload=None, token=None):
        if actor not in ('alice', 'bob') or not path.startswith('/') or path.startswith('//'):
            fail('Unsupported isolated request destination.')
        context = ssl.create_default_context(cafile=str(self.directory / 'root.crt'))
        connection = LoopbackHTTPS(actor + '.test', self.port, timeout=10, context=context)
        headers = {'Accept': 'application/activity+json, application/json'}
        body = None
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if payload is not None:
            body = urllib.parse.urlencode(payload).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        try:
            connection.request('GET' if body is None else 'POST', path, body=body, headers=headers)
            response = connection.getresponse()
            data = response.read(MAX_RESPONSE + 1)
            if response.status != 200 or len(data) > MAX_RESPONSE:
                fail(f'{actor}: bootstrap request rejected ({response.status}).')
            value = json.loads(data)
            if not isinstance(value, dict):
                fail(f'{actor}: invalid bootstrap response shape.')
            return value
        finally:
            connection.close()

    def seed(self):
        # Only readiness GETs are retried. OAuth tokens stay in this call's memory.
        for actor in ('alice', 'bob'):
            deadline = time.monotonic() + 60
            while True:
                try:
                    profile = self.request(actor, '/')
                    if profile.get('id') != f'https://{actor}.test:{self.port}/':
                        fail('Actor canonical identity mismatch.')
                    break
                except (OSError, ValueError, RuntimeError, http.client.HTTPException):
                    if time.monotonic() >= deadline:
                        fail(f'{actor}: actor readiness did not pass within 60 seconds.')
                    time.sleep(1)
            token_response = self.request(actor, '/oauth/token', {'grant_type': 'client_credentials',
                'client_id': profile['id'], 'client_secret': PASSWORD})
            token = token_response.get('access_token')
            if not isinstance(token, str) or not token:
                fail(f'{actor}: OAuth did not return a token.')
            self.request(actor, '/inbox', token=token)
        print('Both isolated actors and authenticated inboxes verified; no tokens saved.', flush=True)

    def down(self):
        if not (self.directory / 'fixture.json').exists() or not (self.directory / 'compose.yaml').exists():
            fail('No managed follow fixture configuration in this directory.')
        self.compose('down')
        print('Only the follow fixture stopped; volumes retained.', flush=True)

    def env(self):
        print('export KIMINO_FOLLOW_FIXTURE_DIR=' + shlex.quote(str(self.directory)))
        print('export KIMINO_FOLLOW_PORT=' + str(self.port))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'build', 'up', 'seed', 'down', 'env'))
    parser.add_argument('--directory', type=Path, default=Path(os.environ.get('KIMINO_FOLLOW_FIXTURE_DIR', ROOT / '.local/c2s-follow')))
    parser.add_argument('--port', type=int, default=int(os.environ.get('KIMINO_FOLLOW_PORT', '18448')))
    args = parser.parse_args()
    try:
        getattr(Fixture(args), args.command)()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError, http.client.HTTPException) as exc:
        # Never emit request/response bodies or exception representations containing headers.
        message = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        print('Follow fixture failed: ' + message, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
