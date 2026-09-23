import pytest
from pathlib import Path
from cryptography.fernet import Fernet

from lib.runtime_config import cors_origins, validate_production_config


def _production(monkeypatch):
    values = {
        "APP_ENV": "production",
        "JWT_SECRET": "7a83d16c42e95f08b13a74c962d05e17a4f09c38",
        "MONGO_URL": "mongodb+srv://service:synthetic@database.example/app",
        "DB_NAME": "mv_multimarcas",
        "PUBLIC_ORIGIN": "https://loja.example",
        "CORS_ORIGINS": "https://loja.example",
        "FORWARDED_ALLOW_IPS": "10.0.0.0/24",
        "STORAGE_PERSISTENT": "true",
        'STORAGE_DIR': str(Path.cwd() / 'storage'),
        "GOOGLE_AUTH_ENABLED": "false",
        "MFA_ENCRYPTION_KEY": Fernet.generate_key().decode(),
        "MFA_REQUIRED": "true",
        "PAYMENTS_PAUSED": "true",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)


def test_safe_production_configuration(monkeypatch):
    _production(monkeypatch)
    validate_production_config()
    assert cors_origins() == ["https://loja.example"]


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("PUBLIC_ORIGIN", "http://loja.example"),
        ("CORS_ORIGINS", "*"),
        ("FORWARDED_ALLOW_IPS", "*"),
        ('FORWARDED_ALLOW_IPS', '0.0.0.0/0'),
        ('FORWARDED_ALLOW_IPS', '::/0'),
        ('STORAGE_DIR', ''),
        ('STORAGE_DIR', 'relative/uploads'),
        ('CORS_ORIGINS', 'https://loja.example,*'),
        ('PUBLIC_ORIGIN', 'https://loja.example:invalid'),
        ("STORAGE_PERSISTENT", "false"),
        ("GOOGLE_AUTH_ENABLED", "true"),
        ("MFA_ENCRYPTION_KEY", "invalid"),
        ("MFA_REQUIRED", "false"),
        ("JWT_SECRET", "change-me"),
        ("MONGO_URL", "mongodb://127.0.0.1:27017"),
        ("DB_NAME", ""),
    ],
)
def test_unsafe_production_configuration_fails_closed(monkeypatch, key, value):
    _production(monkeypatch)
    monkeypatch.setenv(key, value)
    with pytest.raises(RuntimeError, match="Unsafe production configuration"):
        validate_production_config()


def test_staging_rejects_live_paypal(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv('APP_ENV', 'staging')
    monkeypatch.setenv('PAYMENTS_PAUSED', 'false')
    monkeypatch.setenv('PAYPAL_MODE', 'live')
    monkeypatch.setenv('PAYPAL_CLIENT_ID', 'synthetic-client')
    monkeypatch.setenv('PAYPAL_CLIENT_SECRET', 'synthetic-secret')
    with pytest.raises(RuntimeError, match='staging can only use'):
        validate_production_config()
