# A short-lived resolver, not a bot service. Bump these together with dependency updates.
FROM oven/bun:1.4.5 AS bun
FROM ghcr.io/astral-sh/uv:0.13.9 AS uv
FROM rust:1.100.0-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=uv /uv /usr/local/bin/uv
COPY resolve.py /opt/dependencies/resolve.py
ENV HOME=/tmp/home CARGO_HOME=/tmp/cargo UV_CACHE_DIR=/tmp/uv \
    UV_PYTHON_INSTALL_DIR=/tmp/python GIT_CONFIG_NOSYSTEM=1
WORKDIR /tmp
ENTRYPOINT ["python3", "/opt/dependencies/resolve.py"]
