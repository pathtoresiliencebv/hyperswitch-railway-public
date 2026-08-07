FROM postgres:18-alpine

RUN apk add --no-cache aws-cli bash coreutils jq openssl

COPY backup.sh /usr/local/bin/backup.sh
COPY restore-test.sh /usr/local/bin/restore-test.sh
RUN chmod 0555 /usr/local/bin/backup.sh /usr/local/bin/restore-test.sh

USER postgres

ENTRYPOINT ["/usr/local/bin/backup.sh"]
