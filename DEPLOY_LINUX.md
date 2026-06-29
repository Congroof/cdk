# CDK Server 部署手册 (Linux)

本手册将指导你从零开始，在一台全新的 Linux 服务器（以 CentOS/Debian/Ubuntu 为例）上，使用 Docker 和 Docker Compose 部署 CDK Server。

## 1. 环境准备

在开始部署之前，请确保你的服务器已经安装了 `git`、`docker` 和 `docker-compose`。

### 1.1 安装 Git
如果你的服务器没有安装 Git，请先安装：

**CentOS:**
```bash
yum install git -y
```

**Debian/Ubuntu:**
```bash
apt update
apt install git -y
```

### 1.2 安装 Docker
如果你还没有安装 Docker，可以使用官方的一键安装脚本：

```bash
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
```
安装完成后，启动 Docker 并设置开机自启：
```bash
systemctl start docker
systemctl enable docker
```

### 1.3 安装 Docker Compose
下载并安装 Docker Compose：

```bash
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```
验证安装：
```bash
docker-compose --version
```

*(注意：如果下载缓慢，可以尝试使用国内镜像加速下载，或者直接使用包管理器如 `apt install docker-compose-plugin` 或 `yum install docker-compose-plugin`，然后使用 `docker compose` 命令代替 `docker-compose`)*

---

## 2. 获取代码

将项目代码克隆到服务器上（建议放在 `/opt` 或 `/var/www` 目录下）：

```bash
cd /opt
git clone https://github.com/你的用户名/cdk-server.git
cd cdk-server
```
*(如果国内访问 GitHub 缓慢，可以将仓库地址替换为代理地址，例如：`git clone https://ghproxy.net/https://github.com/你的用户名/cdk-server.git`)*

---

## 3. 配置 Docker 镜像加速（强烈推荐）

为了加快 Docker 构建和拉取镜像的速度，强烈建议配置国内的 Docker 镜像加速器。

创建或编辑 `/etc/docker/daemon.json`：

```bash
mkdir -p /etc/docker
cat <<EOF > /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://dockerproxy.com",
    "https://registry.docker-cn.com",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF
```

重启 Docker 服务使配置生效：

```bash
systemctl daemon-reload
systemctl restart docker
```

---

## 4. 构建与启动服务

在项目根目录（即 `docker-compose.yml` 所在的目录）下，执行以下命令：

```bash
docker-compose up -d --build
```

**这个过程会自动完成以下工作：**
1.  拉取 MySQL 8.0 镜像并启动数据库容器。
2.  自动执行 `deploy/mysql-init/01_schema.sql` 脚本，初始化数据库表结构和默认管理员账号。
3.  利用 Dockerfile 中的多阶段构建，在隔离的环境中编译 Rust 后端代码（已配置国内 Cargo 源加速）。
4.  在隔离的环境中编译 React 前端代码（已配置国内 npm 淘宝源加速）。
5.  将编译好的后端程序和前端静态文件打包到一个轻量级的 Debian 镜像中。
6.  配置 Nginx 代理前端静态文件和后端 API 接口。
7.  启动 `cdk-server` 容器。

*(注意：第一次构建时需要下载较多依赖，可能需要几分钟时间，请耐心等待。后续由于配置了依赖缓存，构建速度会非常快。)*

---

## 5. 验证部署

服务启动后，你可以通过以下方式验证是否部署成功：

### 5.1 查看容器状态
```bash
docker-compose ps
```
你应该能看到 `mysql` 和 `cdk-server` 两个容器的状态都是 `Up`。

### 5.2 查看服务日志
如果遇到问题，可以查看日志：
```bash
docker-compose logs -f cdk-server
```
如果看到类似 `Server running on 0.0.0.0:3000` 的输出，说明后端服务已正常启动。

### 5.3 访问管理后台
在浏览器中输入你的服务器 IP 地址（例如 `http://192.168.x.x`），即可访问 CDK Server 的管理后台。

**默认管理员账号：**
*   用户名：`admin`
*   密码：`admin123` *(请注意，实际密码取决于 `deploy/mysql-init/01_schema.sql` 中初始化的 bcrypt 哈希值)*

---

## 6. SkinForge 在线更新文件

Docker 镜像内的 Nginx 已预留 `/skinforge/` 静态目录，用来给 SkinForge 的
Tauri updater 提供 `latest.json` 和安装包下载。

宿主机目录：
```bash
./skinforge-updates
```

容器内目录：
```bash
/opt/skinforge-updates
```

访问地址：
```text
http://62.234.58.74/skinforge/latest.json
```

推荐目录结构：
```text
/opt/skinforge-updates/
  latest.json
  releases/
    1.2.0/
      SkinForge_1.2.0_x64-setup.exe
      SkinForge_1.2.0_x64-setup.exe.sig
```

`docker-compose.yml` 已经把宿主机 `./skinforge-updates` 挂载到容器内
`/opt/skinforge-updates`。以后只维护 Docker 部署即可：更新发布时只需要替换
这个目录里的文件，Nginx 会直接提供静态下载，不需要重启容器。

---

## 7. 日常维护

### 7.1 更新代码并重新部署
当你在本地修改了代码并推送到 Git 仓库后，在服务器上执行以下命令更新服务：

```bash
cd /opt/cdk-server
git pull origin main
docker-compose up -d --build
```
*(你的 MySQL 数据保存在 Docker 的数据卷中，重新构建和启动应用容器**不会**丢失数据。)*

### 7.2 停止服务
```bash
docker-compose down
```
*(这会停止并删除容器，但保留数据卷。)*

### 7.3 进入 MySQL 数据库
如果你需要手动执行 SQL 语句：
```bash
docker-compose exec mysql mysql -u root -pcdk-mysql-root-2026 -D cdk_server
```

---

## 8. 常见问题排查

*   **构建时 `cargo build` 卡住或极慢**：
    通常是网络问题。`Dockerfile` 中已经配置了中科大的 Cargo 镜像源（`sparse+https://mirrors.ustc.edu.cn/crates.io-index/`）。如果依然缓慢，请检查服务器网络。
*   **前端复制按钮不生效**：
    由于浏览器的安全策略，`navigator.clipboard` API 只能在 HTTPS 环境或 `localhost` 下工作。代码中已添加降级方案，但在某些严格的浏览器环境下可能仍受限。建议在生产环境为你的域名配置 HTTPS。
*   **时间显示不正确**：
    后端统一使用 UTC 时间处理逻辑。前端在显示时会自动将 UTC 时间转换为用户浏览器的本地时间。如果发现时间差了 8 小时，请检查前端代码中是否正确解析了带有 `'Z'` 后缀的 UTC 时间字符串。
