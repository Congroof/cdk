FROM rust:1.88-bookworm AS backend-builder
WORKDIR /build

RUN mkdir -p /usr/local/cargo && \
    echo '[source.crates-io]\n\
replace-with = "ustc"\n\
\n\
[source.ustc]\n\
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"' > /usr/local/cargo/config.toml

COPY backend/ .
RUN cargo build --release

FROM node:20-bookworm AS frontend-builder
WORKDIR /build

RUN npm config set registry https://registry.npmmirror.com

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM debian:bookworm-slim

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y ca-certificates nginx && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /build/target/release/cdk-server /usr/local/bin/cdk-server
COPY --from=frontend-builder /build/dist /var/www/html
COPY deploy/nginx-docker.conf /etc/nginx/sites-available/default

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
