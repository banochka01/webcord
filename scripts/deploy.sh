#!/usr/bin/env sh
set -eu

echo "[1/3] stopping old containers if any"
docker compose down || true

echo "[2/3] building and starting"
docker compose up -d --build

echo "[3/3] status"
docker compose ps

echo "Done. Open: http://SERVER_IP:8080 or through your external nginx domain."
