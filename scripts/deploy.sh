#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="compose.prod.yaml"
LOG_FILE="/var/log/oksskolten-deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "=== Deploy started ==="
cd "$REPO_DIR"

log "Pulling latest code..."
git pull origin main

log "Rebuilding and restarting containers..."
docker compose -f "$COMPOSE_FILE" up -d --build

log "=== Deploy finished ==="
