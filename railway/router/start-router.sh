#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required for Hyperswitch migrations}"

echo "Running Hyperswitch database migrations..."
diesel migration run --database-url "$DATABASE_URL" --migration-dir /local/migrations

echo "Starting Hyperswitch router..."
exec /local/bin/router -f /local/config/railway.toml
