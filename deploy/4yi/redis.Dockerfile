FROM redis:7-alpine
COPY deploy/4yi/redis-entrypoint.sh /usr/local/bin/office-redis-entrypoint.sh
ENTRYPOINT ["sh", "/usr/local/bin/office-redis-entrypoint.sh"]
