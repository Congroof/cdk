#!/bin/bash
set -e

# CDK Server 数据库迁移 - 旧服务器导出脚本
# 用法: ./migrate-export.sh [备份目录]

BACKUP_DIR="${1:-/tmp/cdk-migration}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/cdk_server_$TIMESTAMP.sql"
ARCHIVE_FILE="$BACKUP_DIR/cdk_migration_$TIMESTAMP.tar.gz"

echo "=== CDK Server 数据库迁移 - 导出 ==="
echo ""

mkdir -p "$BACKUP_DIR"

# 检测运行模式：Docker 还是本地 MySQL
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q mysql; then
    echo "[1/4] 检测到 Docker 部署模式"
    MYSQL_CONTAINER=$(docker ps --format '{{.Names}}' | grep mysql | head -1)

    echo "[2/4] 停止应用服务（防止迁移期间数据写入）..."
    docker compose stop cdk-server 2>/dev/null || docker stop $(docker ps --format '{{.Names}}' | grep cdk-server) 2>/dev/null || true
    echo "  ✓ 应用已停止"

    echo "[3/4] 导出数据库..."
    docker exec "$MYSQL_CONTAINER" mysqldump \
        -u root -p'cdk-mysql-root-2026' \
        --single-transaction \
        --set-gtid-purged=OFF \
        --routines \
        --triggers \
        --databases cdk_server > "$BACKUP_FILE"

elif command -v mysql &>/dev/null; then
    echo "[1/4] 检测到本地 MySQL 部署模式"

    # 从 .env 读取数据库连接信息
    ENV_FILE="/opt/cdk-server/backend/.env"
    if [ -f "$ENV_FILE" ]; then
        DB_URL=$(grep DATABASE_URL "$ENV_FILE" | cut -d= -f2-)
    else
        echo "  ⚠ 未找到 .env 文件，请输入数据库连接信息"
        read -p "  MySQL 用户名 [root]: " DB_USER
        DB_USER="${DB_USER:-root}"
        read -sp "  MySQL 密码: " DB_PASS
        echo ""
    fi

    echo "[2/4] 停止应用服务..."
    systemctl stop cdk-server 2>/dev/null || true
    echo "  ✓ 应用已停止"

    echo "[3/4] 导出数据库..."
    if [ -n "$DB_URL" ]; then
        DB_USER=$(echo "$DB_URL" | sed -n 's|mysql://\([^:]*\):.*|\1|p')
        DB_PASS=$(echo "$DB_URL" | sed -n 's|mysql://[^:]*:\([^@]*\)@.*|\1|p')
        DB_HOST=$(echo "$DB_URL" | sed -n 's|mysql://[^@]*@\([^:]*\):.*|\1|p')
        DB_PORT=$(echo "$DB_URL" | sed -n 's|mysql://[^@]*@[^:]*:\([0-9]*\)/.*|\1|p')
    else
        DB_HOST="127.0.0.1"
        DB_PORT="3306"
    fi

    mysqldump \
        -h "$DB_HOST" -P "$DB_PORT" \
        -u "$DB_USER" -p"$DB_PASS" \
        --single-transaction \
        --routines \
        --triggers \
        --databases cdk_server > "$BACKUP_FILE"
else
    echo "❌ 未检测到 Docker 或本地 MySQL，请确认部署方式"
    exit 1
fi

# 验证导出文件
if [ ! -s "$BACKUP_FILE" ]; then
    echo "❌ 导出失败：备份文件为空"
    exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
TABLE_COUNT=$(grep -c "^CREATE TABLE" "$BACKUP_FILE" || echo "0")
echo "  ✓ 导出完成: $BACKUP_FILE ($FILE_SIZE, $TABLE_COUNT 个表)"

# 打包（包含 .env 配置供参考）
echo "[4/4] 打包迁移文件..."
ENV_FILES=""
[ -f "/opt/cdk-server/backend/.env" ] && ENV_FILES="$ENV_FILES /opt/cdk-server/backend/.env"

tar -czf "$ARCHIVE_FILE" -C "$(dirname "$BACKUP_FILE")" "$(basename "$BACKUP_FILE")"
echo "  ✓ 归档: $ARCHIVE_FILE"

echo ""
echo "=== 导出完成 ==="
echo ""
echo "下一步："
echo "  1. 将归档传输到新服务器:"
echo "     scp $ARCHIVE_FILE user@新服务器:/tmp/"
echo ""
echo "  2. 在新服务器执行导入脚本:"
echo "     ./migrate-import.sh /tmp/$(basename "$ARCHIVE_FILE")"
echo ""
echo "  ⚠ 确认迁移成功后，再重启旧服务器的应用（或不再启动）"
echo ""
