FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    STORAGE_DIR=/data/uploads

WORKDIR /app

COPY requirements.lock ./requirements.lock
RUN python -m pip install --no-cache-dir --require-hashes -r requirements.lock

COPY . .

RUN addgroup --system --gid 10001 app \
    && adduser --system --uid 10001 --ingroup app app \
    && mkdir -p /data/uploads \
    && chown -R app:app /app /data/uploads

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '8000') + '/api/', timeout=3)" || exit 1

CMD ["sh", "-c", "exec python -m uvicorn server:app --host 0.0.0.0 --port \"${PORT:-8000}\" --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS}\""]
