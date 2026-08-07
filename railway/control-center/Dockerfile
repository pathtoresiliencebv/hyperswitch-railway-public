FROM ghcr.io/pathtoresiliencebv/hyperswitch-railway-public@sha256:abc84be6827f41fb098d9cb83f37c96c5cdbc673a121417e7eb9509efe01fa8b

USER root

WORKDIR /usr/src/app

COPY dashboard.toml.template /tmp/dashboard-config.toml.template
COPY dashboard_theme.json /tmp/dashboard-theme.json
COPY start-control-center.sh /usr/local/bin/start-control-center.sh
COPY secure-proxy.mjs /usr/local/lib/secure-proxy.mjs

RUN chmod +x /usr/local/bin/start-control-center.sh

ENV configPath=/tmp/dashboard-config.toml
ENV themeConfigPath=/tmp/dashboard-theme.json

EXPOSE 9001

USER appuser

ENTRYPOINT []
CMD ["/usr/local/bin/start-control-center.sh"]
