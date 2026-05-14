# CDK 激活码管理系统

基于 Rust Axum + React + MySQL 的激活码（CDK）管理系统，支持生成、校验、激活（机器码绑定）和禁用。

## 技术栈

- **后端**: Rust + Axum + SQLx + MySQL
- **前端**: React 18 + TypeScript + Vite + TailwindCSS
- **认证**: JWT Bearer Token

## 快速开始


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
| POST | `/api/cdk/validate` | 校验 CDK 是否合法 | JWT |
| POST | `/api/cdk/activate` | 激活 CDK（绑定机器码） | JWT |
| POST | `/api/cdk/disable` | 禁用 CDK | JWT |

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

**校验 CDK：**
```bash
curl -X POST http://localhost:3000/api/cdk/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"code":"CDK-XXXX-XXXX-XXXX","machine_code":"optional-machine-id"}'
```

**激活 CDK：**
```bash
curl -X POST http://localhost:3000/api/cdk/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"code":"CDK-XXXX-XXXX-XXXX","machine_code":"MACHINE-ID-HERE"}'
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
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
