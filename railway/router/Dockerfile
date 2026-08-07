FROM ghcr.io/pathtoresiliencebv/hyperswitch-railway-public@sha256:abc8a953ad48d997b8fc5d735c280c613083c9d2ac3757d6af63f50dedbdc3eb

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && curl --proto '=https' --tlsv1.2 -LsSf https://github.com/diesel-rs/diesel/releases/download/v2.3.5/diesel_cli-installer.sh | sh \
    && cp /root/.cargo/bin/diesel /usr/local/bin/diesel \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /local

COPY config /local/config
COPY migrations /local/migrations
COPY start-router.sh /usr/local/bin/start-router.sh

RUN chmod +x /usr/local/bin/start-router.sh

USER app

EXPOSE 8080

CMD ["/usr/local/bin/start-router.sh"]
