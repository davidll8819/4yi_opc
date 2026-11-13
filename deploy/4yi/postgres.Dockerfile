FROM postgres:17-alpine
COPY deploy/4yi/postgres-entrypoint.sh /usr/local/bin/office-postgres-entrypoint.sh
COPY deploy/4yi/pg_hba.conf /etc/office-pg_hba.conf
ENTRYPOINT ["sh", "/usr/local/bin/office-postgres-entrypoint.sh"]
