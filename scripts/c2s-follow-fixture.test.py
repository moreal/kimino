#!/usr/bin/env python3
"""Offline guards for the maintained fixture's preparation and project isolation."""
import io
import json
from pathlib import Path
import runpy
import tarfile
import tempfile
import types
import unittest
import zipfile

MODULE = runpy.run_path(str(Path(__file__).with_name('c2s-follow-fixture.py')))
Fixture = MODULE['Fixture']


class ModuleIntegrity(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='kimino-follow-integrity-')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.fixture = Fixture.__new__(Fixture)
        self.fixture.source = self.directory / 'source'
        self.fixture.manifest = {'processing': {'version': 'v0.0.0-probe'}, 'filters': {'version': 'v0.0.0-probe'}, 'files': {}}
        self.original = {'oni': b'module example.test/oni\n', 'processing': b'module github.com/go-ap/processing\n', 'filters': b'module github.com/go-ap/filters\n'}
        with tarfile.open(self.directory / 'oni.tar.gz', 'w:gz') as archive:
            info = tarfile.TarInfo('oni-pinned/go.mod')
            info.size = len(self.original['oni'])
            archive.addfile(info, io.BytesIO(self.original['oni']))
        with zipfile.ZipFile(self.directory / 'processing.zip', 'w') as archive:
            archive.writestr('github.com/go-ap/processing@v0.0.0-probe/go.mod', self.original['processing'])
        with zipfile.ZipFile(self.directory / 'filters.zip', 'w') as archive:
            archive.writestr('github.com/go-ap/filters@v0.0.0-probe/go.mod', self.original['filters'])
        self.fixture.archive = lambda project: self.directory / ('oni.tar.gz' if project == 'oni' else project + '.zip')
        for project in self.original:
            folder = self.fixture.source / project
            folder.mkdir(parents=True)
            content = self.original[project]
            if project == 'oni':
                content += b'\nreplace github.com/go-ap/processing => ../processing\nreplace github.com/go-ap/filters => ../filters\n'
            (folder / 'go.mod').write_bytes(content)

    def test_original_modules_and_relative_fork_pass(self):
        self.fixture.verify_sources()

    def test_removing_processing_replace_is_rejected(self):
        (self.fixture.source / 'oni/go.mod').write_bytes(self.original['oni'])
        with self.assertRaisesRegex(RuntimeError, 'oni/go.mod'):
            self.fixture.verify_sources()

    def test_repointing_processing_replace_is_rejected(self):
        path = self.fixture.source / 'oni/go.mod'
        path.write_bytes(path.read_bytes().replace(b'../processing', b'../stock-processing'))
        with self.assertRaisesRegex(RuntimeError, 'oni/go.mod'):
            self.fixture.verify_sources()

    def test_processing_module_change_is_rejected(self):
        path = self.fixture.source / 'processing/go.mod'
        path.write_bytes(path.read_bytes() + b'\nreplace example.test/dependency => ../other\n')
        with self.assertRaisesRegex(RuntimeError, 'processing/go.mod'):
            self.fixture.verify_sources()

    def test_removing_filters_replace_is_rejected(self):
        path = self.fixture.source / 'oni/go.mod'
        path.write_bytes(path.read_bytes().replace(b'replace github.com/go-ap/filters => ../filters\n', b''))
        with self.assertRaisesRegex(RuntimeError, 'oni/go.mod'):
            self.fixture.verify_sources()

    def test_filters_module_change_is_rejected(self):
        path = self.fixture.source / 'filters/go.mod'
        path.write_bytes(path.read_bytes() + b'\nreplace example.test/dependency => ../other\n')
        with self.assertRaisesRegex(RuntimeError, 'filters/go.mod'):
            self.fixture.verify_sources()


class ProjectIsolation(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='kimino-follow-isolation-')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def fixture(self, name='one', port=18449):
        return Fixture(types.SimpleNamespace(directory=self.directory / name, port=port))

    def test_directory_and_port_determine_independent_projects(self):
        first = self.fixture()
        self.assertEqual(first.project, self.fixture().project)
        self.assertNotEqual(first.project, self.fixture('two').project)
        self.assertNotEqual(first.project, self.fixture(port=18450).project)

    def test_existing_unmanaged_configuration_is_preserved(self):
        path = self.directory / 'one'
        path.mkdir()
        (path / 'compose.yaml').write_text('name: existing-experiment\n')
        with self.assertRaisesRegex(RuntimeError, 'unmanaged fixture'):
            self.fixture()
        self.assertEqual((path / 'compose.yaml').read_text(), 'name: existing-experiment\n')

    def test_rendered_contract_has_concrete_json_commands_and_loopback_port(self):
        fixture = self.fixture()
        fixture.render()
        config = (fixture.directory / 'compose.yaml').read_text()
        commands = [json.loads(line.split('command:', 1)[1]) for line in config.splitlines() if line.startswith('    command:')]
        self.assertEqual(len(commands), 2)
        for command in commands:
            self.assertEqual(command[command.index('--pw') + 1], MODULE['PASSWORD'])
            self.assertIn(':18449/', command[command.index('--url') + 1])
        self.assertNotIn('${', config)
        self.assertIn('127.0.0.1:18449:18449', config)
        self.assertEqual(json.loads((fixture.directory / 'fixture.json').read_text())['project'], fixture.project)


if __name__ == '__main__':
    unittest.main()
