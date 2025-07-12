# Dockerfile
FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin tile-proxy-rust

FROM debian:bookworm-slim AS runtime
WORKDIR /app

# Install curl and CA certs for the tile prefill script
RUN apt-get update \
    && apt-get install -y curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/tile-proxy-rust /usr/local/bin

# COPY scripts/prefill_nasa_tiles.sh /app/scripts/prefill_nasa_tiles.sh
# COPY scripts/prefill_run.sh /app/scripts/prefill_run.sh

# RUN chmod +x /app/scripts/prefill_run.sh
# RUN chmod +x /app/scripts/prefill_nasa_tiles.sh

RUN mkdir -p /data/logs

# Optional: run prefill script at startup if desired (commented out for safety)
ENTRYPOINT ["/usr/local/bin/tile-proxy-rust"]
# CMD ["/app/scripts/prefill_run.sh"]
