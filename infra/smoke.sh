#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
curl --retry 10 --retry-delay 1 --retry-connrefused -kfsS "https://localhost/api/v1/health" | grep -q '"status":"ok"'
curl -kfsS "https://localhost/api/v1/catalog/home" | grep -q '"collections"'
curl -kfsS "https://localhost/" | grep -q 'Xstore'
docker compose -f docker-compose.yml exec -T worker zsign -v | grep -q '1.1.3'
echo "smoke: ok"
