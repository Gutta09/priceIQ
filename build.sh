#!/usr/bin/env bash
# build.sh — builds the frontend, then starts FastAPI serving it at one origin.
# Usage: ./build.sh            local build + run
#        ./build.sh --docker   build and run via docker compose
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "--docker" ]]; then
  shift
  exec docker compose -f "$ROOT/docker-compose.yml" up --build "$@"
fi

echo ">>> Building React frontend…"
cd "$ROOT/frontend"
npm ci --silent
npm run build

# backend/main.py serves ../frontend/dist directly — no copy step needed.
echo ">>> Starting FastAPI (serves React at same origin)…"
cd "$ROOT/backend"
pip install -q -r requirements.txt
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
