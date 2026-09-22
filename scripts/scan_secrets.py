"""Read-only heuristic inventory. Emits locations/categories, never credential values."""
import ast
import hashlib
import json
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GIT = ROOT / '.local/sites-preparation/git/cmd/git.exe'
PATTERNS = {
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'provider_token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|AKIA[A-Z0-9]{16})\b'),
    'jwt': re.compile(r'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b'),
    'literal_credential': re.compile(r'''(?im)(?:JWT_SECRET|PAYPAL_CLIENT_SECRET|BOOTSTRAP_ADMIN_HASH|RESET_WEBHOOK_TOKEN|password|senha)\s*["']?\s*[:=]\s*["']?([^\r\n"' ,}]{8,})'''),
}
findings = []


def scan(text, location, scope):
    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group(1) if kind == 'literal_credential' else match.group()
            if value in {'undefined', 'password', 'string', 'input.password', 'data.password'} or value.startswith(('os.', 'env.', 'await', 'z.', '[', '$', 'Field', 'str')):
                continue
            findings.append({'scope': scope, 'path': location, 'line': text.count('\n', 0, match.start()) + 1, 'category': kind})


count = 0
excluded = {'node_modules', '.venv', '.git', '__pycache__', 'mongo-data', 'uv-cache', 'mongodb'}
for directory, dirs, files in __import__('os').walk(ROOT):
    dirs[:] = [d for d in dirs if d not in excluded and not (d in ('git', 'plugin') and 'sites-preparation' in directory)]
    for filename in files:
        path = Path(directory) / filename
        if path == Path(__file__).resolve() or filename.endswith(('.pyc', '.exe', '.dll', '.png', '.jpg', '.webp', '.woff2', '.zip')):
            continue
        if path.suffix in ('.gz', '.tgz'):
            try:
                with tarfile.open(path) as archive:
                    for member in archive:
                        if member.isfile() and member.size <= 5_000_000 and member.name.endswith(('.js', '.json', '.env', '.txt', '.md')):
                            data = archive.extractfile(member).read()
                            if b'\0' not in data:
                                scan(data.decode('utf-8', 'replace'), str(path.relative_to(ROOT)) + ':' + member.name, 'archive')
            except tarfile.TarError:
                pass
            continue
        if path.stat().st_size > 10_000_000:
            continue
        data = path.read_bytes()
        if b'\0' in data:
            continue
        count += 1
        scan(data.decode('utf-8', 'replace'), str(path.relative_to(ROOT)), 'working-tree')

history_count = 0
if GIT.exists():
    def git(*args):
        return subprocess.check_output([str(GIT), '-C', str(ROOT/'sites'), *args], stderr=subprocess.DEVNULL)
    for row in git('rev-list', '--objects', '--all').decode().splitlines():
        oid, _, name = row.partition(' ')
        if not name or name.endswith(('yarn.lock', '.png', '.jpg', '.webp', '.woff2', '.ico')):
            continue
        if git('cat-file', '-t', oid).strip() != b'blob':
            continue
        data = git('cat-file', 'blob', oid)
        if b'\0' not in data:
            history_count += 1
            scan(data.decode('utf-8', 'replace'), name, 'git-blob:' + oid[:12])

report = {'tool': 'local heuristic scanner (not a complete secret detector)', 'working_files': count,
          'git_blobs': history_count, 'root_git_history': 'absent; sites/.git scanned', 'findings': findings}
target = ROOT / 'docs/security/secret-scan.json'
target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'files': count, 'git_blobs': history_count, 'candidates': len(findings), 'report': str(target.relative_to(ROOT))}))
