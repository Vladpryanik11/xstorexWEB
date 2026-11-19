#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
curl --retry 10 --retry-delay 1 --retry-connrefused -kfsS "https://localhost/api/v1/health" | grep -q '"status":"ok"'
curl -kfsS "https://localhost/api/v1/catalog/home" | grep -q '"collections"'
curl -kfsS "https://localhost/" | grep -q 'Xstore'
docker compose -f docker-compose.yml --env-file ../.env exec -T worker zsign -v | grep -q '1.1.3'
# A guest tapping «Подключить iPhone» is sent to sign in, never handed the connection file.
curl -ksS -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://localhost/api/v1/enrollment/profile" |
  grep -qxF '302 https://localhost/signin?next=/get/iphone'
# Caddy's certificate reaches the api, readable by its user (CADDY_CERT_ISSUER=local for localhost).
for _ in $(seq 30); do
  docker compose -f docker-compose.yml --env-file ../.env exec -T api \
    sh -c 'test -r /run/enroll/cert.pem && test -r /run/enroll/key.pem' && break
  sleep 1
done
docker compose -f docker-compose.yml --env-file ../.env exec -T api \
  sh -c 'test -r /run/enroll/cert.pem && test -r /run/enroll/key.pem'
echo "smoke: ok"
