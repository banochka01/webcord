#!/usr/bin/env sh
set -eu

APP_DIR=${APP_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
REMOTE=${REMOTE:-origin}
BRANCH=${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}
if [ -z "${COMPOSE_FILE:-}" ]; then
  if [ -f "$APP_DIR/docker-compose.prod.yml" ]; then
    COMPOSE_FILE=docker-compose.prod.yml
  else
    COMPOSE_FILE=docker-compose.yml
  fi
fi
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8080/api/health}
BACKUP_DIR=${BACKUP_DIR:-/opt/webcord_backups}
ALLOW_DIRTY=${ALLOW_DIRTY:-0}

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

cd "$APP_DIR"

if [ ! -f ".env" ]; then
  echo ".env is missing in $APP_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
DIRTY=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  DIRTY=1
  git diff --binary > "$BACKUP_DIR/pre-deploy-$STAMP.patch" || true
  echo "Saved dirty worktree patch: $BACKUP_DIR/pre-deploy-$STAMP.patch"
fi

if [ "$DIRTY" = "1" ] && [ "$ALLOW_DIRTY" != "1" ]; then
  echo "Refusing deploy with dirty tracked files. Commit/stash them or run ALLOW_DIRTY=1 scripts/deploy.sh." >&2
  exit 1
fi

echo "[1/4] fetching $REMOTE/$BRANCH"
git fetch "$REMOTE" "$BRANCH"

echo "[2/4] checking out deploy revision"
git checkout -B "$BRANCH" "FETCH_HEAD"

echo "[3/4] building and starting containers"
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo "[4/4] waiting for health: $HEALTH_URL"
i=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 40 ]; then
    docker compose -f "$COMPOSE_FILE" ps
    docker compose -f "$COMPOSE_FILE" logs --tail=80 backend frontend
    echo "Healthcheck failed: $HEALTH_URL" >&2
    exit 1
  fi
  sleep 3
done

docker compose -f "$COMPOSE_FILE" ps
echo "Deploy complete: $(git rev-parse --short HEAD)"
