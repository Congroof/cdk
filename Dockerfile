FROM rust:1.88-bookworm AS backend-builder
WORKDIR /build

RUN mkdir -p /usr/local/cargo && \
    echo '[source.crates-io]\n\
replace-with = "ustc"\n\
\n\
[source.ustc]\n\
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"' > /usr/local/cargo/config.toml

# 优化：利用 Docker 缓存机制，先只拷贝 Cargo.toml 和 Cargo.lock (如果有) 编译依赖
COPY backend/Cargo.toml backend/Cargo.lock* backend/
RUN mkdir -p backend/src && echo "fn main() {}" > backend/src/main.rs && \
    cd backend && cargo build --release && \
    rm -rf src

# 然后再拷贝真正的源代码进行编译
COPY backend/ backend/
# 触摸一下 main.rs 确保它的修改时间是最新的，触发重新编译
RUN touch backend/src/main.rs && cd backend && cargo build --release

FROM node:20-bookworm AS frontend-builder
WORKDIR /build

RUN npm config set registry https://registry.npmmirror.com

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM debian:bookworm-slim

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y ca-certificates nginx && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /opt/skinforge-updates/hashes

COPY --from=backend-builder /build/backend/target/release/cdk-server /usr/local/bin/cdk-server
COPY --from=frontend-builder /build/dist /var/www/html
COPY deploy/nginx-docker.conf /etc/nginx/sites-available/default

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
