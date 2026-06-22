#!/bin/bash
set -e

# CDK Server 数据库迁移 - 新服务器导入脚本
# 用法: ./migrate-import.sh <归档文件路径>
#
# 前提条件：新服务器已通过 docker compose 或 setup.sh 部署好基础环境

ARCHIVE_FILE="$1"
WORK_DIR="/tmp/cdk-import-$$"

echo "=== CDK Server 数据库迁移 - 导入 ==="
echo ""

if [ -z "$ARCHIVE_FILE" ]; then
    echo "用法: $0 <归档文件路径>"
    echo "  例: $0 /tmp/cdk_migration_20260622_120000.tar.gz"
    exit 1
fi

if [ ! -f "$ARCHIVE_FILE" ]; then
    echo "❌ 文件不存在: $ARCHIVE_FILE"
    exit 1
fi

# 解压
mkdir -p "$WORK_DIR"
echo "[1/5] 解压归档文件..."
tar -xzf "$ARCHIVE_FILE" -C "$WORK_DIR"
SQL_FILE=$(find "$WORK_DIR" -name "*.sql" | head -1)

if [ -z "$SQL_FILE" ]; then
    echo "❌ 归档中未找到 SQL 文件"
    exit 1
fi
echo "  ✓ SQL 文件: $SQL_FILE ($(du -h "$SQL_FILE" | cut -f1))"

# 检测并等待 MySQL 就绪
echo "[2/5] 等待 MySQL 就绪..."
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q mysql; then
    MYSQL_CONTAINER=$(docker ps --format '{{.Names}}' | grep mysql | head -1)
    echo "  检测到 Docker MySQL 容器: $MYSQL_CONTAINER"

    for i in $(seq 1 30); do
        if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null; then
            echo "  ✓ MySQL 已就绪"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "❌ MySQL 启动超时，请检查容器状态"
            exit 1
        fi
        sleep 2
    done
    MODE="docker"
elif command -v mysql &>/dev/null; then
    echo "  检测到本地 MySQL"
    MODE="local"
    read -p "  MySQL 用户名 [root]: " DB_USER
    DB_USER="${DB_USER:-root}"
    read -sp "  MySQL 密码: " DB_PASS
    echo ""
    DB_HOST="127.0.0.1"
    DB_PORT="3306"
else
    echo "❌ 未检测到 MySQL，请先部署基础环境"
    echo "  Docker 部署: docker compose up -d mysql"
    echo "  本地部署: 先运行 setup.sh 安装 MySQL"
    exit 1
fi

# 停止应用（避免应用的 bootstrap 和导入冲突）
echo "[3/5] 停止应用服务..."
if [ "$MODE" = "docker" ]; then
    docker compose stop cdk-server 2>/dev/null || true
else
    systemctl stop cdk-server 2>/dev/null || true
fi
echo "  ✓ 应用已停止"

# 导入数据
echo "[4/5] 导入数据库（这会覆盖已有的 cdk_server 数据库）..."
read -p "  确认导入？已有数据将被覆盖 [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "  已取消"
    rm -rf "$WORK_DIR"
    exit 0
fi

if [ "$MODE" = "docker" ]; then
    docker exec -i "$MYSQL_CONTAINER" mysql -u root -p'cdk-mysql-root-2026' < "$SQL_FILE"
else
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" < "$SQL_FILE"
fi
echo "  ✓ 数据导入完成"

# 验证
echo "[5/5] 验证导入结果..."
if [ "$MODE" = "docker" ]; then
    TABLES=$(docker exec "$MYSQL_CONTAINER" mysql -u root -p'cdk-mysql-root-2026' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cdk_server';" 2>/dev/null)
    CDK_COUNT=$(docker exec "$MYSQL_CONTAINER" mysql -u root -p'cdk-mysql-root-2026' -N -e "SELECT COUNT(*) FROM cdk_server.cdkeys;" 2>/dev/null)
    USER_COUNT=$(docker exec "$MYSQL_CONTAINER" mysql -u root -p'cdk-mysql-root-2026' -N -e "SELECT COUNT(*) FROM cdk_server.users;" 2>/dev/null)
else
    TABLES=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cdk_server';" 2>/dev/null)
    CDK_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -e "SELECT COUNT(*) FROM cdk_server.cdkeys;" 2>/dev/null)
    USER_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -e "SELECT COUNT(*) FROM cdk_server.users;" 2>/dev/null)
fi

echo "  ✓ 表数量: $TABLES"
echo "  ✓ CDK 记录: $CDK_COUNT"
echo "  ✓ 用户记录: $USER_COUNT"

# 启动应用
echo ""
read -p "是否立即启动应用服务？[Y/n]: " START
START="${START:-Y}"
if [ "$START" = "y" ] || [ "$START" = "Y" ]; then
    if [ "$MODE" = "docker" ]; then
        docker compose up -d cdk-server
    else
        systemctl start cdk-server
    fi
    echo "  ✓ 应用已启动"
    sleep 3
    echo ""
    echo "  健康检查:"
    if curl -sf http://localhost:80 >/dev/null 2>&1 || curl -sf http://localhost:3000 >/dev/null 2>&1; then
        echo "  ✓ 服务响应正常"
    else
        echo "  ⚠ 服务暂未响应，请稍后检查: docker compose logs -f cdk-server"
    fi
fi

# 清理
rm -rf "$WORK_DIR"

echo ""
echo "=== 迁移完成 ==="
echo ""
echo "后续确认事项："
echo "  1. 访问管理后台，确认数据完整"
echo "  2. 用已有 CDK 测试验证接口"
echo "  3. 确认无误后，可关闭旧服务器"
echo ""
