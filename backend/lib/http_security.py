"""Same-origin browser writes, bounded bodies, and non-sensitive response headers."""
import os
import json
import logging
import uuid
from starlette.responses import JSONResponse


class HttpSecurity:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = dict(scope['headers'])
        unsafe = scope['method'] not in ('GET', 'HEAD', 'OPTIONS')
        if unsafe:
            allowed = {s.strip().rstrip('/') for s in os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')}
            allowed.add(os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000').rstrip('/'))
            origin = headers.get(b'origin', b'').decode('latin1')
            # No origin is permitted for non-browser API clients; browser cross-site writes are denied.
            if (origin and origin not in allowed) or headers.get(b'sec-fetch-site') == b'cross-site':
                return await JSONResponse({'detail': 'Origem não permitida.'}, 403)(scope, receive, send)
            if scope['path'] != '/api/files/upload' and headers.get(b'content-type', b'').split(b';')[0] != b'application/json':
                return await JSONResponse({'detail': 'Use application/json.'}, 415)(scope, receive, send)
            limit = 8 * 1024 * 1024 + 65536 if scope['path'] == '/api/files/upload' else 65536
            chunks, size = [], 0
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body', b'')
                size += len(chunk)
                if size > limit:
                    return await JSONResponse({'detail': 'Solicitação acima do limite.'}, 413)(scope, receive, send)
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

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                route = getattr(scope.get('route'), 'path', 'unmatched')
                if unsafe and (scope['path'].startswith('/api/admin/') or scope['path'].startswith('/api/auth/') or scope['path'].startswith('/api/payments/')):
                    logging.getLogger('security.audit').info(json.dumps({'event': 'security_operation', 'request_id': uuid.uuid4().hex,
                        'actor_id': scope.get('state', {}).get('audit_actor'), 'method': scope['method'], 'route': route, 'status': message['status']}))
                extra = [(b'x-content-type-options', b'nosniff'), (b'x-frame-options', b'DENY'),
                         (b'referrer-policy', b'no-referrer')]
                if scope['path'].startswith('/api/') and not scope['path'].startswith('/api/files/'):
                    extra.append((b'cache-control', b'no-store'))
                if os.getenv('APP_ENV') == 'production':
                    extra.append((b'strict-transport-security', b'max-age=31536000'))
                message['headers'] = [h for h in message['headers'] if h[0] not in {k for k, _ in extra}] + extra
            await send(message)
        await self.app(scope, buffered_receive, secure_send)
