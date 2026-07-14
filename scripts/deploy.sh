#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="/var/log/oksskolten-deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "=== Deploy started ==="
cd "$REPO_DIR"

log "Pulling latest code..."
git pull origin main

export GIT_COMMIT="$(git rev-parse --short HEAD)"
export GIT_TAG="$(git describe --tags --exact-match 2>/dev/null || echo unknown)"
export BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log "Rebuilding and restarting containers (commit ${GIT_COMMIT})..."
make prod

log "=== Deploy finished ==="
