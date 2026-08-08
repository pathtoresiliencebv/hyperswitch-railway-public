FROM ghcr.io/pathtoresiliencebv/hyperswitch-railway-public@sha256:56a687b4d23e7a6cb49114924f5e257fcfbd33ad1f28f5c67aea9365996f2819

WORKDIR /app

COPY policy.mjs server.mjs ./

ENV NODE_ENV=production

EXPOSE 8080

USER node

CMD ["node", "server.mjs"]
