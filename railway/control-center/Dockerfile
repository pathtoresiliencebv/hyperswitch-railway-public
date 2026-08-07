FROM docker.juspay.io/juspaydotin/hyperswitch-control-center@sha256:09f15c92903f8c749dd45a2818b16eeffe10ea99c6c6ed6af4b9e0580df02090

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
