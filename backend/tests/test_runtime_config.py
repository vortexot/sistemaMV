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
        "STORAGE_BACKEND": "filesystem",
        "STORAGE_PERSISTENT": "true",
        'STORAGE_DIR': str(Path.cwd() / 'storage'),
        "GOOGLE_AUTH_ENABLED": "false",
        "MFA_ENCRYPTION_KEY": Fernet.generate_key().decode(),
        "MFA_REQUIRED": "true",
        "PAYMENTS_PAUSED": "true",
        "AUTH_EMAIL_WEBHOOK_URL": "https://mail.example/deliver",
        "AUTH_EMAIL_WEBHOOK_TOKEN": "a7f6c4d2e9b1a8f6c4d2e9b1a8f6c4d2",
        "AUTH_EMAIL_WEBHOOK_ALLOWED_HOSTS": "mail.example",
        "ORDER_RESERVATION_MINUTES": "15",
        "ORDER_RESERVATION_REAPER_SECONDS": "60",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)


def test_safe_production_configuration(monkeypatch):
    _production(monkeypatch)
    validate_production_config()
    assert cors_origins() == ["https://loja.example"]


def test_render_web_service_accepts_platform_proxy(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "*")
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_TYPE", "web")
    validate_production_config()


@pytest.mark.parametrize("service_type", ["worker", "pserv", ""])
def test_proxy_wildcard_is_rejected_outside_render_web_service(monkeypatch, service_type):
    _production(monkeypatch)
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "*")
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_TYPE", service_type)
    with pytest.raises(RuntimeError, match="Unsafe production configuration"):
        validate_production_config()


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
        ('STORAGE_BACKEND', 'memory'),
        ('CORS_ORIGINS', 'https://loja.example,*'),
        ('PUBLIC_ORIGIN', 'https://loja.example:invalid'),
        ("STORAGE_PERSISTENT", "false"),
        ("GOOGLE_AUTH_ENABLED", "true"),
        ("MFA_ENCRYPTION_KEY", "invalid"),
        ("MFA_REQUIRED", "false"),
        ("JWT_SECRET", "change-me"),
        ("MONGO_URL", "mongodb://127.0.0.1:27017"),
        ("DB_NAME", ""),
        ("AUTH_EMAIL_WEBHOOK_URL", "http://mail.example/deliver"),
        ("AUTH_EMAIL_WEBHOOK_TOKEN", "weak"),
        ("AUTH_EMAIL_WEBHOOK_ALLOWED_HOSTS", "other.example"),
        ("ORDER_RESERVATION_MINUTES", "0"),
        ("ORDER_RESERVATION_REAPER_SECONDS", "301"),
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


def test_enabled_pix_requires_a_valid_key(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv('PIX_ENABLED', 'true')
    monkeypatch.setenv('PIX_KEY', '')
    with pytest.raises(RuntimeError, match='PIX_KEY'):
        validate_production_config()

    monkeypatch.setenv('PIX_KEY', '+5561999999999')
    monkeypatch.setenv('PIX_RESERVATION_MINUTES', '60')
    validate_production_config()


def test_staging_can_disable_email_delivery(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv('APP_ENV', 'staging')
    monkeypatch.delenv('AUTH_EMAIL_WEBHOOK_URL')
    monkeypatch.delenv('AUTH_EMAIL_WEBHOOK_TOKEN')
    monkeypatch.delenv('AUTH_EMAIL_WEBHOOK_ALLOWED_HOSTS')
    validate_production_config()


def test_staging_rejects_partial_email_delivery_configuration(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv('APP_ENV', 'staging')
    monkeypatch.delenv('AUTH_EMAIL_WEBHOOK_TOKEN')
    with pytest.raises(RuntimeError, match='verified email delivery'):
        validate_production_config()


def test_resend_email_configuration(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv('AUTH_EMAIL_PROVIDER', 'resend')
    monkeypatch.setenv('RESEND_API_KEY', 're_' + 'a' * 32)
    monkeypatch.setenv('AUTH_EMAIL_FROM', 'MV Multimarcas <contato@loja.example>')
    validate_production_config()

    monkeypatch.setenv('RESEND_API_KEY', 'invalid')
    with pytest.raises(RuntimeError, match='Resend email delivery'):
        validate_production_config()


def test_enabled_correios_requires_credentials(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv('CORREIOS_ENABLED', 'true')
    monkeypatch.setenv('CORREIOS_ENV', 'production')
    with pytest.raises(RuntimeError, match='Correios requires'):
        validate_production_config()


def test_staging_accepts_correios_homologation_token(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv('APP_ENV', 'staging')
    monkeypatch.setenv('CORREIOS_ENABLED', 'true')
    monkeypatch.setenv('CORREIOS_ENV', 'homologation')
    monkeypatch.setenv('CORREIOS_ACCESS_TOKEN', 'delegated-test-token')
    validate_production_config()


def test_gridfs_storage_does_not_require_filesystem_path(monkeypatch):
    _production(monkeypatch)
    monkeypatch.setenv("STORAGE_BACKEND", "gridfs")
    monkeypatch.delenv("STORAGE_DIR")
    validate_production_config()
