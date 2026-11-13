#!/bin/sh
set -eu
umask 077
: "${POSTGRES_PASSWORD:?required}"
: "${POSTGRES_TLS_CERT_B64:?required}"
: "${POSTGRES_TLS_KEY_B64:?required}"
mkdir -p /tmp/office-pg-tls
printf '%s' "$POSTGRES_TLS_CERT_B64" | base64 -d > /tmp/office-pg-tls/server.crt
printf '%s' "$POSTGRES_TLS_KEY_B64" | base64 -d > /tmp/office-pg-tls/server.key
chown -R postgres:postgres /tmp/office-pg-tls
unset POSTGRES_TLS_CERT_B64 POSTGRES_TLS_KEY_B64
exec /usr/local/bin/docker-entrypoint.sh postgres \
  -c ssl=on \
  -c ssl_cert_file=/tmp/office-pg-tls/server.crt \
  -c ssl_key_file=/tmp/office-pg-tls/server.key \
  -c hba_file=/etc/office-pg_hba.conf \
  -c password_encryption=scram-sha-256 \
  -c shared_buffers=128MB -c max_connections=40 -c work_mem=4MB
