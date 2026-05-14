#!/bin/bash
set -e

echo "=== CDK Server 部署脚本 ==="

# 1. 安装系统依赖
echo "[1/7] 安装系统依赖..."
apt update -y
apt install -y curl build-essential pkg-config libssl-dev nginx

# 2. 安装 Rust
if ! command -v rustc &> /dev/null; then
    echo "[2/7] 安装 Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
else
    echo "[2/7] Rust 已安装，跳过"
fi

# 3. 安装 Node.js
if ! command -v node &> /dev/null; then
    echo "[3/7] 安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "[3/7] Node.js 已安装，跳过"
fi

# 4. 创建项目目录
echo "[4/7] 创建项目目录..."
mkdir -p /opt/cdk-server

# 5. 构建后端
echo "[5/7] 构建后端（Release 模式）..."
cd /opt/cdk-server/backend
cargo build --release
cp target/release/cdk-server ./cdk-server

# 6. 构建前端
echo "[6/7] 构建前端..."
cd /opt/cdk-server/frontend
npm install
npm run build

# 7. 配置 systemd 服务
echo "[7/7] 配置 systemd 服务..."
cp /opt/cdk-server/deploy/cdk-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable cdk-server

# 配置 Nginx
cp /opt/cdk-server/deploy/nginx.conf /etc/nginx/sites-available/cdk-server
ln -sf /etc/nginx/sites-available/cdk-server /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "=== 部署完成 ==="
echo ""
echo "后续步骤："
echo "  1. 编辑 /opt/cdk-server/backend/.env 配置数据库连接"
echo "  2. 编辑 /etc/nginx/sites-available/cdk-server 替换域名"
echo "  3. 启动服务: systemctl start cdk-server"
echo "  4. 查看状态: systemctl status cdk-server"
echo "  5. 查看日志: journalctl -u cdk-server -f"
echo ""
