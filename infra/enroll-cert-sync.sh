#!/bin/sh
# Copies Caddy's certificate and key for SITE_DOMAIN out of the caddydata volume (mounted read-only)
# for the api, which signs the iPhone connection file with them. Caddy keeps the key 0600 root, and
# the api runs as `node` (uid 1000), so the copies are made readable for that user only. A renewal
# is picked up on the next pass; the api re-reads changed files and, while the new certificate and
# key are not yet both copied, keeps signing with the last good pair.
set -eu

src="/caddy-data/caddy/certificates/${CADDY_CERT_ISSUER}/${SITE_DOMAIN}"
dst=/enroll
interval="${ENROLL_CERT_SYNC_SECONDS:-300}"

# copy <from> <to>: atomically replaces <to> when <from> differs.
copy() {
  if [ -f "$1" ] && ! cmp -s "$1" "$2"; then
    cp "$1" "$2.tmp"
    chown 1000:1000 "$2.tmp"
    chmod 0400 "$2.tmp"
    mv -f "$2.tmp" "$2"
    echo "enroll-cert: updated $(basename "$2")"
  fi
}

while :; do
  copy "$src/$SITE_DOMAIN.key" "$dst/key.pem"
  copy "$src/$SITE_DOMAIN.crt" "$dst/cert.pem"
  # Until Caddy has the first certificate, look often.
  if [ -f "$dst/cert.pem" ] && [ -f "$dst/key.pem" ]; then sleep "$interval"; else sleep 5; fi
done
