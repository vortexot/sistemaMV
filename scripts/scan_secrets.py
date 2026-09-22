"""Read-only heuristic inventory. Emits locations/categories, never credential values."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'provider_token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|AKIA[A-Z0-9]{16})\b'),
    'jwt': re.compile(r'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b'),
    'literal_credential': re.compile(
        r'''(?im)(?:JWT_SECRET|PAYPAL_CLIENT_SECRET|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|'''
        r'''BOOTSTRAP_ADMIN_HASH|RESET_WEBHOOK_TOKEN|DATABASE_URL)[ \t]*["']?[ \t]*[:=][ \t]*'''
        r'''["']?([^\r\n"' ,}]{8,})'''
    ),
}
findings = []


def scan(text, location, scope):
    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group(1) if kind == 'literal_credential' else match.group()
            if (
                value in {'undefined', 'password', 'string', 'input.password', 'data.password', 'synthetic'}
                or '<password>' in value
                or value.startswith(('os.', 'env.', 'process.', 'await', 'z.', '[', '$', '<', 'Field', 'str', 'secrets.'))
            ):
                continue
            findings.append({'scope': scope, 'path': location, 'line': text.count('\n', 0, match.start()) + 1, 'category': kind})


def git(*args: str) -> bytes:
    return subprocess.check_output(['git', '-C', str(ROOT), *args], stderr=subprocess.DEVNULL)


count = 0
paths = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split(b'\0')
for raw_path in paths:
    if not raw_path:
        continue
    relative = raw_path.decode('utf-8', 'surrogateescape')
    path = ROOT / relative
    if not path.is_file() or path == Path(__file__).resolve() or path.suffix.lower() in {
        '.pyc', '.exe', '.dll', '.png', '.jpg', '.jpeg', '.webp', '.woff2', '.zip', '.lock'
    }:
        continue
    if path.stat().st_size > 10_000_000:
        continue
    data = path.read_bytes()
    if b'\0' in data:
        continue
    count += 1
    scan(data.decode('utf-8', 'replace'), relative, 'working-tree')

history_count = 0
for row in git('rev-list', '--objects', '--all').decode().splitlines():
    oid, _, name = row.partition(' ')
    if not name or Path(name).suffix.lower() in {'.lock', '.png', '.jpg', '.jpeg', '.webp', '.woff2', '.ico'}:
        continue
    if git('cat-file', '-t', oid).strip() != b'blob':
        continue
    data = git('cat-file', 'blob', oid)
    if len(data) <= 10_000_000 and b'\0' not in data:
        history_count += 1
        scan(data.decode('utf-8', 'replace'), name, 'git-blob:' + oid[:12])

report = {'tool': 'local heuristic scanner (not a complete secret detector)', 'working_files': count,
          'git_blobs': history_count, 'root_git_history': 'scanned', 'findings': findings}
target = ROOT / 'docs/security/secret-scan.json'
target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'files': count, 'git_blobs': history_count, 'candidates': len(findings), 'report': str(target.relative_to(ROOT))}))
