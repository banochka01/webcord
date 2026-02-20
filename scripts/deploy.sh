#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[WebCord] Starting one-command deploy..."

if ! command -v docker >/dev/null 2>&1; then
  echo "[WebCord] Docker is required but not installed." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "[WebCord] docker compose plugin (or docker-compose) is required." >&2
  exit 1
fi

chmod +x "$0"

echo "[WebCord] Building images and starting stack..."
$COMPOSE_CMD up -d --build --remove-orphans

echo "[WebCord] Done. Services status:"
$COMPOSE_CMD ps

echo "[WebCord] Frontend: http://localhost:5173"
echo "[WebCord] Backend:  http://localhost:3000"
