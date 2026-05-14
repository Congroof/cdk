.PHONY: setup dev dev-backend dev-frontend build build-cli db-init help

help: ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## 一键启动前后端（后端 + 前端并行）
	@echo "启动 CDK 管理系统..."
	@$(MAKE) dev-backend &
	@sleep 2
	@$(MAKE) dev-frontend
