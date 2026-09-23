"""Same-origin browser writes, bounded bodies, and non-sensitive response headers."""

import os
import uuid

from starlette.responses import JSONResponse

from lib.audit import audit_event
from lib.runtime_config import cors_origins


class HttpSecurity:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)

        scope.setdefault('state', {})['request_id'] = uuid.uuid4().hex
        headers = dict(scope['headers'])
        unsafe = scope['method'] not in ('GET', 'HEAD', 'OPTIONS')

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                route = getattr(scope.get('route'), 'path', 'unmatched')
                if unsafe and scope['path'].startswith('/api/admin/'):
                    audit_event(
                        'ADMIN_SENSITIVE_ACTION',
                        actor_id=scope.get('state', {}).get('audit_actor'),
                        outcome=str(message['status']),
                        request_id=scope['state']['request_id'],
                        details={'method': scope['method'], 'route': route},
                    )
                extra = [
                    (b'x-content-type-options', b'nosniff'),
                    (b'x-frame-options', b'DENY'),
                    (b'referrer-policy', b'no-referrer'),
                    (b'permissions-policy', b'camera=(), microphone=(), geolocation=()'),
                    (b'content-security-policy', b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
                ]
                if scope['path'].startswith('/api/') and not scope['path'].startswith('/api/files/'):
                    extra.append((b'cache-control', b'no-store'))
                if os.getenv('APP_ENV') in {'staging', 'production'}:
                    extra.append((b'strict-transport-security', b'max-age=31536000; includeSubDomains'))
                names = {key for key, _ in extra}
                message['headers'] = [item for item in message['headers'] if item[0] not in names] + extra
            await send(message)

        async def reject(detail: str, status: int, outcome: str):
            audit_event(
                'AUTHORIZATION_DENIED',
                outcome=outcome,
                request_id=scope['state']['request_id'],
                details={'method': scope['method'], 'path': scope['path']},
            )
            await JSONResponse({'detail': detail}, status)(scope, receive, secure_send)

        if unsafe:
            allowed = set(cors_origins())
            public_origin = os.getenv('PUBLIC_ORIGIN', '').rstrip('/')
            if public_origin:
                allowed.add(public_origin)
            origin = headers.get(b'origin', b'').decode('latin1')
            if (origin and origin not in allowed) or headers.get(b'sec-fetch-site') == b'cross-site':
                return await reject('Origem nao permitida.', 403, 'origin_denied')
            if scope['path'] != '/api/files/upload' and headers.get(b'content-type', b'').split(b';')[0] != b'application/json':
                return await reject('Use application/json.', 415, 'content_type_denied')
            limit = 8 * 1024 * 1024 + 65536 if scope['path'] == '/api/files/upload' else 65536
            chunks, size = [], 0
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body', b'')
                size += len(chunk)
                if size > limit:
                    return await reject('Solicitacao acima do limite.', 413, 'body_too_large')
                chunks.append(chunk)
                if not message.get('more_body'):
                    break

            async def buffered_receive():
                if chunks:
                    data = b''.join(chunks)
                    chunks.clear()
                    return {'type': 'http.request', 'body': data, 'more_body': False}
                return await receive()
        else:
            buffered_receive = receive

        await self.app(scope, buffered_receive, secure_send)
