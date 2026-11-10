# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS frontend-dependencies
WORKDIR /frontend
RUN chown node:node /frontend
COPY --chown=node:node frontend/package.json frontend/package-lock.json ./
USER node
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 npm ci

FROM frontend-dependencies AS frontend-builder
COPY frontend/ ./
RUN npm run build

FROM frontend-dependencies AS frontend-dev
ENV NODE_ENV=development
COPY --chown=node:node frontend/ ./
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM python:3.11-slim-bookworm@sha256:a83ba18aef0f865b1a4a611c2cf460fe446f2795673bbb9fe43be570439e3b39 AS python-builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1 VIRTUAL_ENV=/opt/venv
RUN python -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
COPY requierments.txt /tmp/requierments.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install --no-compile -r /tmp/requierments.txt

FROM python:3.11-slim-bookworm@sha256:a83ba18aef0f865b1a4a611c2cf460fe446f2795673bbb9fe43be570439e3b39 AS backend-dev
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 AUDIT_DB_PATH=/app/runtime/audit.db UPLOAD_DIR=/app/uploads
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home app
WORKDIR /app
COPY --from=python-builder /opt/venv /opt/venv
COPY --chown=app:app app ./app
COPY --chown=app:app data/sample_kb ./data/sample_kb
COPY --chown=app:app ingest_sample_kb.py ./ingest_sample_kb.py
RUN mkdir -p /app/runtime /app/uploads && chown app:app /app/runtime /app/uploads
USER app
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]

FROM python:3.11-slim-bookworm@sha256:a83ba18aef0f865b1a4a611c2cf460fe446f2795673bbb9fe43be570439e3b39 AS runtime
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 APP_ENV=production AUDIT_DB_PATH=/app/runtime/audit.db UPLOAD_DIR=/app/uploads
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home app
WORKDIR /app
COPY --from=python-builder /opt/venv /opt/venv
COPY --chown=app:app app ./app
COPY --chown=app:app data/sample_kb ./data/sample_kb
COPY --chown=app:app ingest_sample_kb.py ./ingest_sample_kb.py
COPY --from=frontend-builder --chown=app:app /frontend/dist ./frontend/dist
RUN mkdir -p /app/runtime /app/uploads && chown app:app /app/runtime /app/uploads
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
