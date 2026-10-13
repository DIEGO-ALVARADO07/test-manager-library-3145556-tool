#!/usr/bin/env bash
# Runs the whole demo seeding against a stack started with `docker compose` from the infra repository.
# The past phase needs the API clock shifted back (ADR-006): the script restarts the api service twice.
#
# Usage: INFRA_DIR=../test-manager-library-3145556-infra ./seed/run-all.sh
set -euo pipefail

INFRA_DIR="${INFRA_DIR:-../test-manager-library-3145556-infra}"
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi

wait_for_api() {
  for _ in $(seq 1 60); do
    if curl -fs "${API_URL:-http://localhost:8000/api/v1}/health" > /dev/null; then return 0; fi
    sleep 2
  done
  echo "The API did not answer in time." >&2
  exit 1
}

echo "1/4 base data (real clock)"
(cd "$INFRA_DIR" && CLOCK_OFFSET_DAYS=0 docker compose up -d api)
wait_for_api
node seed/seed.mjs --phase=base

echo "2/4 past loans (API clock at -20 days)"
(cd "$INFRA_DIR" && CLOCK_OFFSET_DAYS=-20 docker compose up -d --force-recreate api)
wait_for_api
node seed/seed.mjs --phase=past

echo "3/4 present loans (real clock)"
(cd "$INFRA_DIR" && CLOCK_OFFSET_DAYS=0 docker compose up -d --force-recreate api)
wait_for_api
node seed/seed.mjs --phase=present

echo "4/4 evidence"
node seed/seed.mjs --phase=verify
