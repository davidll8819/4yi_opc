#!/bin/sh
set -eu
umask 077
: "${REDIS_PASSWORD:?required}"
: "${REDIS_TLS_CERT_B64:?required}"
: "${REDIS_TLS_KEY_B64:?required}"
# Safe literal in redis.conf; provision with openssl rand -hex 32.
case "$REDIS_PASSWORD" in *[!a-zA-Z0-9]*|'') echo 'REDIS_PASSWORD must be alphanumeric' >&2; exit 1;; esac
[ "${#REDIS_PASSWORD}" -ge 32 ] || exit 1
mkdir -p /tmp/office-redis-tls
printf '%s' "$REDIS_TLS_CERT_B64" | base64 -d > /tmp/office-redis-tls/server.crt
printf '%s' "$REDIS_TLS_KEY_B64" | base64 -d > /tmp/office-redis-tls/server.key
cat > /tmp/office-redis-tls/redis.conf <<EOF
bind 0.0.0.0
protected-mode yes
port 0
tls-port 6379
tls-cert-file /tmp/office-redis-tls/server.crt
tls-key-file /tmp/office-redis-tls/server.key
tls-auth-clients no
requirepass $REDIS_PASSWORD
dir /data
appendonly yes
appendfsync everysec
maxmemory 768mb
maxmemory-policy noeviction
EOF
chown -R redis:redis /tmp/office-redis-tls
unset REDIS_PASSWORD REDIS_TLS_CERT_B64 REDIS_TLS_KEY_B64
exec /usr/local/bin/docker-entrypoint.sh redis-server /tmp/office-redis-tls/redis.conf
