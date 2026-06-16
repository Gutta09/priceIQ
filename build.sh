#!/usr/bin/env bash
# build.sh — builds frontend, copies dist into backend, then starts uvicorn
# Usage: ./build.sh [--docker]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "--docker" ]]; then
  docker compose -f "$ROOT/docker-compose.yml" up --build "$@"
  exit 0
fi

echo ">>> Building React frontend…"
cd "$ROOT/frontend"
npm ci --silent
npm run build

echo ">>> Copying dist to backend/frontend/dist…"
mkdir -p "$ROOT/backend/frontend/dist"
cp -r "$ROOT/frontend/dist/." "$ROOT/backend/frontend/dist/"

echo ">>> Starting FastAPI (serves React at same origin)…"
cd "$ROOT/backend"
pip install -q -r requirements.txt
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
