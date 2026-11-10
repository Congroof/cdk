# CDK 激活码管理系统

基于 Rust Axum + React + MySQL 的激活码（CDK）管理系统，支持生成、校验、激活（机器码绑定）和禁用。

## 服务迁移

新旧后台发布同一新版、旧服务保持原业务代码、新版直连新服务器，详见
[双后台发布与迁移清单](docs/SERVER_MIGRATION.md)。过渡期共用迁移后的数据库，不增加迁移代理。

## 技术栈

- **后端**: Rust + Axum + SQLx + MySQL
- **前端**: React 18 + TypeScript + Vite + TailwindCSS
- **认证**: JWT Bearer Token

## 快速开始

### 方式一：本地一键启动（推荐）

确保本地已安装 Docker、Rust (`cargo`) 与 Node.js，在项目根目录直接执行：

```bash
make dev
```

会自动启动本地 MySQL 容器、同步表结构与默认管理员账号（`admin` / `C%ht$n9*2FrkG0`），并同时拉起 Rust 后端（`http://127.0.0.1:3000`）与 Vite 前端（`http://localhost:5173`）。停止服务可执行 `make stop`，重置本地管理员密码可执行 `make reset-admin`。

---

### 方式二：手动分步启动

### 1. 准备 MySQL 数据库

```bash
mysql -u root -p < backend/migrations/001_init.sql
```

### 2. 插入管理员账号

npx -y bcrypt-cli 'your_password' 10

```sql
USE cdk_server;
INSERT INTO users (username, password_hash) VALUES (
  'admin',
  '$2a$10$nc5QaF1/30vEBPShPf0adezpd5oPEvk0KBiSPGmc8A.DiM273z3uK'
);
```

> 如需自定义密码，可以使用在线 bcrypt 生成工具或在代码中使用 `bcrypt::hash("你的密码", 12)` 生成。

### 3. 配置后端环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入实际的数据库连接信息和 JWT 密钥
```

环境变量说明：

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | MySQL 连接字符串 | `mysql://root:password@127.0.0.1:3306/cdk_server` |
| `JWT_SECRET` | JWT 签名密钥 | `your-super-secret-key` |
| `SERVER_ADDR` | 服务监听地址 | `0.0.0.0:3000` |
| `KDOCS_CREDENTIAL_KEY` | Base64 编码的 32 字节 AES-256-GCM 主密钥，部署后必须保持不变 | `openssl rand -base64 32` |
| `SKINFORGE_HASH_SYNC_ENABLED` | 是否启用启动及周期 Hash 同步 | `true` |
| `SKINFORGE_HASH_SOURCE_URL` | CommunityDragon Hash 源地址 | `https://raw.communitydragon.org/data/hashes/lol/hashes.game.txt` |
| `SKINFORGE_HASH_MIRROR_DIR` | Hash 私有 staging 目录，不由 Nginx 暴露 | `/opt/skinforge-updates/hashes` |
| `SKINFORGE_HASH_SYNC_INTERVAL_HOURS` | Hash 周期同步间隔 | `24` |

### 4. 启动后端

```bash
cd backend
cargo run
```

### 5. 启动前端（开发模式）

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器默认运行在 `http://localhost:5173`，API 请求会自动代理到后端 `http://127.0.0.1:3000`。

### 6. 前端构建（生产）

```bash
cd frontend
npm run build
```

构建产物在 `frontend/dist/` 目录，可以部署到 Nginx 等静态服务器。

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 管理员登录 | 无 |
| POST | `/api/cdk/generate` | 批量生成 CDK | JWT |
| GET | `/api/cdk/list` | 分页查询 CDK 列表 | JWT |
| POST | `/api/cdk/disable` | 禁用 CDK | JWT |
| POST | `/api/client/u/{username}/validate` | SkinForge 校验 CDK | 无 |
| POST | `/api/client/u/{username}/activate` | SkinForge 激活 CDK | 无 |
| GET/POST | `/api/skinforge/kdocs-settings` | 查询或更新加密的云文档配置 | JWT |
| GET/POST | `/api/skinforge/release` | 查询或发布最新 SkinForge Windows 版本 | JWT |
| GET/POST | `/api/skinforge/mods` | 分页查询或导入自定义 MOD | JWT |
| DELETE | `/api/skinforge/mods/{id}` | 下架自定义 MOD | JWT |
| GET | `/api/skinforge/hash-status` | 查询 Hash 同步状态 | JWT |
| POST | `/api/skinforge/hash-sync` | 手动触发 Hash 同步 | JWT |
| GET | `/api/client/skinforge/update/{target}/{arch}/{version}` | Tauri 动态更新信息 | 无 |
| GET | `/api/client/skinforge/hash` | 当前 Hash TXT/gzip OSS 元数据 | 无 |
| GET | `/api/client/skinforge/mods` | 自定义 MOD 公开分页列表 | 无 |
| GET | `/api/client/skinforge/mods/{id}/download` | 获取 MOD 临时 OSS 地址 | 无 |
| GET (WebSocket) | `/api/client/u/{username}/cdk-events` | CDK 换绑失效事件 | `Authorization: Bearer <CDK>` + `X-SkinForge-Machine` |

自定义 MOD 的客户端与管理端完整对接方式见
[`docs/SKINFORGE_MOD_INTEGRATION.md`](docs/SKINFORGE_MOD_INTEGRATION.md)。

### 接口示例

**登录：**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**生成 CDK：**
```bash
curl -X POST http://localhost:3000/api/cdk/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"count":5,"valid_days":30,"remark":"测试批次"}'
```

**禁用 CDK：**
```bash
curl -X POST http://localhost:3000/api/cdk/disable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"code":"CDK-XXXX-XXXX-XXXX"}'
```

## CDK 状态说明

| 状态 | 含义 |
|------|------|
| `unused` | 未使用，可激活 |
| `activated` | 已激活，绑定了机器码 |
| `expired` | 已过期 |
| `disabled` | 已禁用（管理员手动禁用） |

## 生产部署

### Docker 部署与运维更新

#### 1. 全量部署 / 更新前后端（会重启后端容器）

```bash
git pull
docker compose up -d --build   # 旧版可使用 docker-compose up -d --build
```

#### 2. 仅更新前端静态资源（零停机热更新，不断开在线客户端连接）

当仅修改了 `frontend/` 前端代码而未改动 `backend/` 后端时，可只编译前端构建阶段并将产物热替换进正在运行的 `cdk-server` 容器 `/var/www/html/`，全程不重启容器、不断开客户端 WebSocket：

```bash
git pull && \
docker build --target frontend-builder -t cdk-frontend-builder . && \
CID=$(docker compose ps -q cdk-server 2>/dev/null || docker-compose ps -q cdk-server) && \
TMP_ID=$(docker create cdk-frontend-builder) && \
rm -rf /tmp/cdk-dist && docker cp "$TMP_ID:/build/dist" /tmp/cdk-dist && \
docker rm "$TMP_ID" && \
docker cp /tmp/cdk-dist/. "$CID:/var/www/html/" && \
rm -rf /tmp/cdk-dist && \
echo "✅ 前端零停机热更新完成！"
```

---

### 宿主机 Nginx 反向代理示例

建议使用 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 75s;
    }
}
```

`$connection_upgrade` 需要在 Nginx 的 `http` 作用域定义：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
```

当前示例保留 HTTP/WS 明文链路；CDK Header 仍可能被网络监听，生产环境后续应迁移到 HTTPS/WSS。
