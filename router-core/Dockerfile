FROM public.ecr.aws/docker/library/rust:trixie AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libssl-dev pkg-config protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /router

ENV CARGO_INCREMENTAL=0 \
    CARGO_NET_RETRY=10 \
    RUSTUP_MAX_RETRIES=10 \
    RUST_BACKTRACE=short \
    CARGO_BUILD_JOBS=1 \
    CARGO_PROFILE_RELEASE_LTO=false \
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16

COPY . .

RUN cargo build \
    --release \
    --no-default-features \
    --features release \
    --features v1 \
    --bin router

FROM public.ecr.aws/docker/library/debian:trixie

ARG CONFIG_DIR=/local/config
ARG BIN_DIR=/local/bin

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libpq-dev curl procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /router/config/payment_required_fields_v2.toml ${CONFIG_DIR}/payment_required_fields_v2.toml
COPY --from=builder /router/target/release/router ${BIN_DIR}/router

ENV TZ=Etc/UTC \
    RUN_ENV=sandbox \
    CONFIG_DIR=${CONFIG_DIR} \
    SCHEDULER_FLOW=consumer \
    BINARY=router \
    RUST_MIN_STACK=6291456

RUN useradd --user-group --system --no-create-home --no-log-init app

USER app:app
WORKDIR ${BIN_DIR}
EXPOSE 8080
CMD ["./router"]
