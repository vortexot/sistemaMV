"""Re-encrypt staff TOTP seeds during a controlled Fernet key rotation.

Dry-run is the default. The script prints counts only and never prints a seed or key.
"""

import argparse
import asyncio
import os

from cryptography.fernet import Fernet, InvalidToken
from motor.motor_asyncio import AsyncIOMotorClient


def cipher(name: str) -> Fernet:
    value = os.getenv(name, '')
    if not value:
        raise RuntimeError(f'{name} is required')
    return Fernet(value.encode())


async def run(apply: bool) -> None:
    current = cipher('MFA_ENCRYPTION_KEY')
    previous = cipher('MFA_ENCRYPTION_KEY_PREVIOUS')
    if os.environ['MFA_ENCRYPTION_KEY'] == os.environ['MFA_ENCRYPTION_KEY_PREVIOUS']:
        raise RuntimeError('Current and previous MFA keys must differ')

    client = AsyncIOMotorClient(os.environ['MONGO_URL'], tz_aware=True, serverSelectionTimeoutMS=5000)
    database = client[os.environ['DB_NAME']]
    counts = {'current': 0, 'previous': 0, 'updated': 0, 'unreadable': 0}
    try:
        async for user in database.users.find(
            {'role': {'$in': ['admin', 'atendente']}, 'mfa_enabled': True},
            {'_id': 0, 'id': 1, 'mfa_secret': 1},
        ):
            encrypted = user.get('mfa_secret', '')
            try:
                current.decrypt(encrypted.encode())
                counts['current'] += 1
                continue
            except InvalidToken:
                pass
            try:
                plaintext = previous.decrypt(encrypted.encode())
            except InvalidToken:
                counts['unreadable'] += 1
                continue
            counts['previous'] += 1
            if apply:
                result = await database.users.update_one(
                    {'id': user['id'], 'mfa_secret': encrypted},
                    {'$set': {'mfa_secret': current.encrypt(plaintext).decode()}},
                )
                counts['updated'] += result.modified_count
        print(' '.join(f'{name}={value}' for name, value in counts.items()))
        if counts['unreadable']:
            raise RuntimeError('Unreadable MFA seeds found; keep the previous key and investigate')
    finally:
        client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='write re-encrypted values; default is read-only')
    asyncio.run(run(parser.parse_args().apply))
