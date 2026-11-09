.PHONY: help setup dev dev-db dev-backend dev-frontend stop build db-init reset-admin

SHELL := /bin/zsh
NVM_BIN := $(shell ls -d $(HOME)/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
DEV_PATH := $(HOME)/.cargo/bin:$(if $(NVM_BIN),$(NVM_BIN):)/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(PATH)
export PATH := $(DEV_PATH)

# 本地开发默认环境变量（可通过外部环境变量覆盖）
export DATABASE_URL ?= mysql://cdk:cdk-db-password-2026@127.0.0.1:3306/cdk_server
export JWT_SECRET ?= cdk-server-jwt-secret-key-2026
export KDOCS_CREDENTIAL_KEY ?= e0sOU49Pi2Z7ftWM1dXaTsDGOI7Z2hvS5ChLOuwidv0=
export SERVER_ADDR ?= 127.0.0.1:3000
export SKINFORGE_HASH_SYNC_ENABLED ?= false
export SKINFORGE_HASH_MIRROR_DIR := $(CURDIR)/skinforge-updates/hashes

help: ## 显示帮助信息
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## 安装前端依赖并预编译后端
	@export PATH="$(DEV_PATH)"; \
	echo "==> [1/2] 安装前端依赖..."; \
	(cd frontend && npm install) && \
	echo "==> [2/2] 检查并预编译后端..." && \
	(cd backend && cargo check)

dev-db: ## 启动本地 MySQL 数据库容器并等待就绪
	@export PATH="$(DEV_PATH)"; \
	echo "==> 启动本地 MySQL 容器 (端口 3306)..."; \
	mkdir -p "$(SKINFORGE_HASH_MIRROR_DIR)"; \
	docker compose up -d mysql; \
	echo "==> 等待 MySQL TCP 服务就绪..."; \
	for i in {1..45}; do \
		if docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -ucdk -pcdk-db-password-2026 cdk_server -e "SELECT 1" >/dev/null 2>&1; then \
			echo "==> MySQL 已就绪 (mysql://cdk:***@127.0.0.1:3306/cdk_server)"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "错误: MySQL 启动超时，请检查 docker compose logs mysql"; exit 1

db-init: dev-db ## 初始化或同步本地数据库表结构与默认管理员账号
	@export PATH="$(DEV_PATH)"; \
	echo "==> 同步数据库 Schema 与默认管理员账号 (若未创建则默认: admin / C%ht\$$n9*2FrkG0)..."; \
	sed 's/INSERT INTO users/INSERT IGNORE INTO users/' deploy/mysql-init/01_schema.sql | \
		docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -uroot -pcdk-mysql-root-2026 cdk_server 2>/dev/null || true; \
	echo "==> 数据库就绪"

reset-admin: dev-db ## 重置本地 admin 账号密码为默认密码 (C%ht$n9*2FrkG0)
	@export PATH="$(DEV_PATH)"; \
	docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -uroot -pcdk-mysql-root-2026 cdk_server -e \
		"INSERT INTO users (username, password_hash) VALUES ('admin', '\$$2b\$$12\$$07POrj7ENvN/d1teHn9jfunobCrrh/WHoSAeIgKKXOv4/1Q4GV3rG') ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);" 2>/dev/null; \
	echo "==> 已将 admin 密码重置为: C%ht\$$n9*2FrkG0"

dev-backend: ## 单独启动 Rust 后端服务 (http://127.0.0.1:3000)
	@export PATH="$(DEV_PATH)"; \
	mkdir -p "$(SKINFORGE_HASH_MIRROR_DIR)"; \
	echo "==> 启动后端服务 (http://$(SERVER_ADDR))..."; \
	cd backend && cargo run

dev-frontend: ## 单独启动 Vite 前端开发服务 (http://localhost:5173)
	@export PATH="$(DEV_PATH)"; \
	if [ ! -d "frontend/node_modules" ]; then \
		echo "==> 检测到 frontend/node_modules 不存在，正在自动安装依赖..."; \
		(cd frontend && npm install); \
	fi; \
	echo "==> 启动前端服务 (http://localhost:5173)..."; \
	cd frontend && npm run dev -- --host 0.0.0.0

dev: dev-db db-init ## 一键启动完整本地开发环境（数据库 + 后端 + 前端）
	@export PATH="$(DEV_PATH)"; \
	echo ""; \
	echo "============================================================"; \
	echo "  🚀 CDK 管理系统本地开发环境启动中..."; \
	echo "  • 前端预览地址: http://localhost:5173"; \
	echo "  • 后端 API 地址: http://127.0.0.1:3000"; \
	echo "  • 默认管理员号: admin"; \
	echo "  • 默认管理员密: C%ht\$$n9*2FrkG0"; \
	echo "  (按 Ctrl+C 可同时停止前后端服务)"; \
	echo "============================================================"; \
	echo ""; \
	trap 'kill 0' INT TERM EXIT; \
		$(MAKE) dev-backend & \
		$(MAKE) dev-frontend & \
		wait

stop: ## 停止本地前后端进程及 MySQL 容器
	@export PATH="$(DEV_PATH)"; \
	echo "==> 停止本地开发服务..."; \
	pkill -f "target/debug/cdk-server" 2>/dev/null || true; \
	pkill -f "vite" 2>/dev/null || true; \
	docker compose stop mysql; \
	echo "==> 已停止所有本地开发服务"

build: ## 构建前端生产产物与后端 Release 二进制
	@export PATH="$(DEV_PATH)"; \
	(cd frontend && npm run build) && \
	(cd backend && cargo build --release)
