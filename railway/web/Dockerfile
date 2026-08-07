FROM docker.juspay.io/juspaydotin/hyperswitch-web@sha256:9ae538bd55ff9a4ec096629f070ea1f936802c29b5a4ff0b91656061275c54ad

WORKDIR /usr/src/app
COPY start-web.sh /usr/local/bin/start-web.sh
RUN chmod +x /usr/local/bin/start-web.sh

EXPOSE 9050
CMD ["/usr/local/bin/start-web.sh"]
