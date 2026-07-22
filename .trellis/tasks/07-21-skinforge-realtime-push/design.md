# SkinForge CDK 单机换绑失效设计

## 1. 架构边界

```text
新机器 Tauri
  -> HTTP activate（CDK + new HWID）
  -> Nginx :80
  -> Axum transaction
       SELECT CDK FOR UPDATE
       UPDATE current machine
       INSERT binding history(old -> new, IP)
       COMMIT
  -> in-memory registry 定向发送 invalidated(old HWID)
  -> 旧机器 Tauri Rust 撤销授权
       删除 license.cdk
       停止受保护后台能力/在安全点终止任务
       emit cdk:license-state
  -> React CdkGate 回到激活页
```

服务端数据库是绑定关系的唯一权威来源。WebSocket 不传输权威 CDK 数据，只加速旧机器失效。

## 2. 服务端组件

### 2.1 绑定历史

新增 `cdk_binding_history`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT PK AI | 事件 ID |
| `cdk_id` | BIGINT | 当时的 CDK 行 ID |
| `cdk_code` | VARCHAR(64) | 便于 CDK 后续变化/删除后审计 |
| `event_type` | VARCHAR(20) | `activate` / `rebind` |
| `old_machine_code` | VARCHAR(256) NULL | 首次激活为空 |
| `new_machine_code` | VARCHAR(256) | 新绑定机器 |
| `client_ip` | VARCHAR(45) NULL | 受信 Nginx `X-Real-IP`，兼容 IPv6 |
| `created_by` | BIGINT | 租户用户 ID |
| `created_at` | DATETIME | 成功提交时间 |

索引覆盖 `cdk_id + created_at`、`cdk_code`、`new_machine_code`。建表同步写入 `backend/src/db.rs`、新编号 migration 与 `deploy/mysql-init/01_schema.sql`。

### 2.2 原子激活/换绑

把默认租户 `activate` 与 username-scoped `user_activate` 汇聚到一个内部函数：

1. 解析并校验输入、租户、封禁机器、来源 IP。
2. `pool.begin()`。
3. 按 `(code, created_by)` 执行 `SELECT ... FOR UPDATE`。
4. 在锁内重新检查 disabled、expired、same machine、unused/activated。
5. 首次激活或不同机器换绑时更新 `cdkeys` 并插入绑定历史。
6. commit。
7. 仅对成功 rebind，在 commit 后调用 registry 失效 `(owner_id, cdk_id, old_machine_code)`。
8. 返回既有成功 envelope，保持旧客户端兼容。

同一 CDK 并发 A -> B -> C 会按行锁顺序串行化：历史分别记录 A -> B、B -> C；通知也按各自提交后的旧绑定定向。

### 2.3 WebSocket 端点与认证

新增：

```text
GET /api/client/u/{username}/cdk-events
Authorization: Bearer <CDK>
X-SkinForge-Machine: <HWID>
```

- Handler 在 Upgrade 前解析 Header，按 username 找 owner，再查询 CDK。
- 仅 `activated`、未过期、未禁用且 `machine_code == HWID` 时升级。
- 认证失败返回 401/403，不泄露 CDK 是否存在的细节。
- CDK/HWID 不进入 URL、React、普通日志或错误响应。
- `WebSocketUpgrade` 设置 64KB frame/message 上限。

注册表：

```text
(owner_id, cdk_id, machine_code)
  -> { connection_id -> bounded sender(capacity=32) }
```

允许同机多个连接；全局 3000 连接。队列满、心跳超时或 writer 失败时关闭并清理连接。

### 2.4 协议

服务端业务事件：

```json
{
  "version": 1,
  "eventId": "uuid",
  "type": "cdkBindingInvalidated",
  "occurredAt": "2026-07-21T12:00:00Z",
  "payload": { "reason": "rebound" }
}
```

事件不包含 CDK、旧/新机器码或 IP。服务端发送事件后主动 Close；客户端收到已知 v1 事件立即撤权，未知 version/type 忽略并记录不含凭据的诊断。

控制面：服务端每 30 秒 Ping，客户端处理 Ping/Pong；没有应用层 ACK。业务事件丢失由 60 秒租约和重连 DB 校验兜底。

### 2.5 Nginx

在 HTTP scope 定义 Upgrade map，`/api/` 代理增加：

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_read_timeout 75s;
```

保留现有 Host、X-Real-IP、X-Forwarded-For 与普通 HTTP 行为。

## 3. Tauri 客户端

### 3.1 Rust 授权状态

`AppState` 新增共享 `LicenseRuntime`，状态至少包括：

- `unchecked`
- `valid`
- `grace`（含 60 秒 deadline）
- `invalid`（`rebound` / `expired` / `disabled` / `missing`）

授权快照 DTO 使用 camelCase，只暴露状态、原因和 grace deadline；不暴露 CDK/HWID。提供 snapshot command，并通过 `cdk:license-state` 事件流同步 React。

### 3.2 连接 Manager

- `cdk_validate` / `cdk_activate` 成功后把 Rust-only session（CDK + HWID）发布给 manager。
- manager 使用 `tokio-tungstenite` 自定义 Request 连接 `ws://62.234.58.74/api/client/u/a/cdk-events`。
- 重连为带 jitter 的 1/2/4/8/.../60 秒退避。
- 握手成功和有效服务端心跳刷新授权确认时间。
- 连接异常进入 grace 并并行重连；60 秒仍未恢复则 fail closed。
- 握手被拒或 HTTP 复验得到 `hwid_mismatch` 时立即按 rebound 撤权，不等待 grace。
- App 启动无既有有效租约时仍先执行当前 HTTP 校验，网络不可达则保持 fail closed。

### 3.3 撤权与安全停止

统一 `LicenseService::revoke`：

1. 原子更新 Rust 授权快照，确保幂等。
2. 删除 app-data 下 `license.cdk`（best effort，失败需诊断但仍撤权）。
3. 停止连接 manager 当前 session。
4. 停止 `runoverlay`、自动选人和可安全取消的 overlay/live-client 循环。
5. 通知在途生成/应用任务在下一个安全检查点退出；禁止启动新的核心操作。
6. emit typed `cdk:license-state`。

核心命令入口和 Rust `AutoChampSelectService` 必须检查 `LicenseRuntime::is_valid()`；UI 门禁不是唯一保护层。

单个不可中断文件步骤允许完成；批量任务在 item/stage 之间检查 cancellation；apply prepare 完成后若已撤权，不得启动 `runoverlay`。

### 3.4 React 门禁

新增 CDK license hook：先读 snapshot，再订阅 `cdk:license-state`，正确清理异步 listener。`CdkGate`：

- `valid` 渲染主应用。
- `grace` 仍可显示主应用但不隐藏连接异常状态；到期事件后回门禁。
- `invalid/rebound` 立即卸载主应用并显示“此 CDK 已在其他设备激活，请重新输入 CDK”。
- 手动重新输入 CDK 成功后恢复 valid，并重新建立连接。

移除 30 分钟 React interval，授权生命周期统一由 Rust manager 管理。

## 4. 资源与容量

- 最大 3000 连接；预期 400～600 日用户，并为后续业务增长预留容量。
- 600 连接、30 秒心跳约 20 次控制帧/秒。
- bounded sender 32、64KB frame/message、无压缩，防止慢客户端与大消息导致无界内存。
- 不新增 Redis/MQ；历史写 MySQL，在线连接仅内存保存。

## 5. 失败矩阵

| 场景 | 行为 |
|---|---|
| 在线旧机器被换绑 | 明确事件后立即撤权、删 CDK、回门禁 |
| 旧机器离线时被换绑 | 下次启动/重连握手或 HTTP 校验立即失败 |
| WS 短暂断开 | 进入 60 秒 grace，恢复后继续 |
| WS 断开超过 60 秒 | fail closed，回门禁 |
| 推送队列满/发送失败 | 关闭旧连接；客户端由租约兜底 |
| DB 更新成功、推送失败 | 新绑定保留，不回滚；旧端 <= 60 秒失效 |
| 两台机器并发换绑 | 行锁串行化，历史与通知按提交顺序 |
| Nginx 不支持 Upgrade | 新客户端无法建立授权通道并在 60 秒后锁定；因此必须服务端先部署 |
| history INSERT 失败 | 整个绑定事务回滚，不返回换绑成功 |

## 6. 发布与回滚

发布顺序必须是：数据库/服务端代码 -> Nginx Upgrade -> 验证 WS -> 发布 Tauri 客户端。旧客户端继续使用 HTTP 校验，不受新增端点影响。

回滚客户端后恢复旧 30 分钟校验；服务端新增表和 WS 路由可保留。若回滚服务端，必须同时避免向依赖 WS 租约的新客户端发布，否则新客户端会 fail closed。

## 7. 已接受权衡

- 保持 HTTP/WS 明文。
- 直接换绑，不做管理员授权或防抢回。
- 60 秒可用性/单机约束折中。
- IP 仅用于审计线索。
- 单实例内存注册表；多实例扩展不在本期。

## 8. 管理后台绑定历史可视化

### 8.1 管理端 API

新增 JWT 保护的管理端查询：

```text
GET /api/cdk/{cdk_id}/binding-history?page=1&page_size=50
```

查询必须同时约束 `cdkeys.id = cdk_id` 与当前 JWT 用户对应的 `created_by`；不存在或不属于当前租户统一返回 404。接口不接受 CDK 明文作为路径参数，复用列表已返回的数值 ID。

响应包含：

- `summary`：当前机器码、历史不同机器数、成功绑定总次数、换绑次数。
- `machines`：按 `new_machine_code` 分组的成功绑定次数、首次/最近绑定时间、是否当前机器。
- `events`：分页后的成功绑定时间线，包含事件类型、旧/新机器码、客户端 IP、发生时间。
- `pagination`：`total`、`page`、`page_size`。

汇总与时间线均以 `cdk_binding_history` 为权威来源，不读取 `usage_logs`。事件按 `created_at DESC, id DESC` 稳定排序；`page_size` 默认 50、最大 100。机器汇总按最近绑定时间最多返回 100 台，完整数量保留在 `summary.machine_count`，前端在发生截断时明确提示，避免任一响应字段无界增长。

### 8.2 桌面交互

`CDKTable` 操作区为每行增加“绑定详情”。点击后按 CDK ID 请求数据并打开 `CdkBindingHistoryModal`：

1. 顶部四张紧凑汇总卡：当前机器、历史机器、成功绑定、换绑次数。
2. 设备汇总表：机器码、成功绑定次数、首次绑定、最近绑定、当前标记。
3. 时间线：首次激活显示“首次绑定到 B”；换绑显示“A → B”，并展示请求 IP 与时间。
4. 未使用或无历史数据时展示明确空状态；加载失败使用现有 Toast，弹窗保留可重试/关闭能力。
5. 仅修改桌面 `Dashboard` / `CDKTable` 相关组件；`MobileCdk` 不接入该能力。

### 8.3 兼容与安全

- 新接口位于现有 protected router 下，沿用 JWT 中间件。
- 不修改 `/api/cdk/list` 响应，不影响现有桌面、移动端和导出调用。
- IP 仅对所属租户管理员返回，不进入公开客户端接口、WebSocket 消息或日志新增字段。
- 旧数据库若尚未执行 migration 008，则接口会失败；部署顺序保持先迁移/启动建表，再发布前端。

### 8.4 验证

- 后端单元测试覆盖分页边界、聚合映射和租户约束可测试部分；有 MySQL 时补集成断言：首次绑定、A→B→A、空历史、跨租户不可见。
- 前端生产构建与类型检查覆盖新增 DTO/组件；人工检查长机器码、IPv4/IPv6、空 IP、空历史、加载和翻页状态。
- 回归现有 CDK 列表、编辑有效期、禁用、搜索和移动端列表不受影响。
