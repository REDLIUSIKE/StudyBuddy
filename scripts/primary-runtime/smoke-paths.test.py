"""Check payload files under ordinary and extended Windows paths."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('payload_smoke', Path(__file__).with_name('smoke.py'))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class PayloadFilePaths(unittest.TestCase):
    def test_existing_file(self):
        self.assertTrue(smoke.payload_file_exists(Path(__file__)))

    def test_missing_file_still_fails(self):
        self.assertFalse(smoke.payload_file_exists(Path(__file__).with_name('absent-payload.bin')))

    @unittest.skipUnless(sys.platform == 'win32', 'Windows path handling')
    def test_file_over_legacy_windows_path_limit(self):
        temp_root = '\\\\?\\' + str(Path(tempfile.gettempdir()).resolve())
        with tempfile.TemporaryDirectory(prefix='dsh-path-', dir=temp_root) as directory:
            nested = Path(directory).joinpath(*(['segment' * 8] * 5))
            nested.mkdir(parents=True)
            artifact = nested / 'payload.bin'
            artifact.write_bytes(b'checked payload')
            ordinary = Path(str(artifact).removeprefix('\\\\?\\'))
            self.assertGreater(len(str(ordinary)), 260)
            self.assertTrue(smoke.payload_file_exists(ordinary))


if __name__ == '__main__':
    unittest.main()
