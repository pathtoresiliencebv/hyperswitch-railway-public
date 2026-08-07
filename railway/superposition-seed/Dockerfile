FROM alpine:3.20

RUN apk add --no-cache bash curl jq yq

WORKDIR /seed

COPY superposition_seed.toml /seed/superposition_seed.toml
COPY seed_superposition.sh /seed/seed_superposition.sh

RUN chmod +x /seed/seed_superposition.sh

ENV SEED_FILE=/seed/superposition_seed.toml

CMD ["/bin/bash", "/seed/seed_superposition.sh"]
