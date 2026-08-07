FROM ghcr.io/pathtoresiliencebv/hyperswitch-railway-public@sha256:0aaa8afae1edc10e44507a250c3721369a98eda78f132d683614f04f54b104b6

WORKDIR /usr/src/app
COPY start-web.sh /usr/local/bin/start-web.sh
RUN chmod +x /usr/local/bin/start-web.sh

EXPOSE 9050
CMD ["/usr/local/bin/start-web.sh"]
