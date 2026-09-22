"""Only initialize the new loopback test instance provided by test-security.ps1."""
import sys
import time
from pymongo import MongoClient
port = int(sys.argv[1])
assert 1024 < port < 65536
client = MongoClient(f'mongodb://127.0.0.1:{port}/?directConnection=true', serverSelectionTimeoutMS=1000)
for attempt in range(30):
    try:
        client.admin.command('ping')
        break
    except Exception:
        time.sleep(.5)
client.admin.command('replSetInitiate', {'_id': 'security_test', 'members': [{'_id': 0, 'host': f'127.0.0.1:{port}'}]})
for attempt in range(40):
    if client.admin.command('hello').get('isWritablePrimary'):
        print('Isolated Mongo replica ready (synthetic data only).')
        break
    time.sleep(.5)
else:
    raise RuntimeError('Replica not ready')
client.close()
