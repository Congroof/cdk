# 技术设计

## 1. 总体方案

本次同时修改 `cdk-server` 与 SkinForge：服务端负责权威过期截止、在线连接失效和低频时长聚合；客户端保存到期时间并在本地 deadline 到达时主动复核，形成双层保障。

## 2. 服务端授权连接

### 握手与 deadline

- WebSocket 握手查询返回 `cdk_id` 与 `expires_at`。
- `handle_socket` 为该 `expires_at` 建立 Tokio sleep deadline，不做每分钟数据库轮询。
- deadline 到达时查询一次当前 CDK：
  - 若管理员已续期且新时间在未来，重置 deadline；
  - 若已过期，将状态收敛为 `expired`，广播 `expired` 失效事件并关闭该绑定的全部连接；
  - 若已禁用、换绑、删除或机器码不匹配，发送相应失效事件并关闭连接。

### 主动失效

- 将事件构造从仅 `rebound` 泛化为受控原因：`rebound`、`expired`、`disabled`、`banned`。
- disable 成功提交后，对原绑定发送 `disabled`。
- ban 成功提交后，对该 owner/machine 的连接发送 `banned`。
- 保持现有事件 envelope 与敏感字段禁入规则，旧客户端即使不识别新原因，也会因 socket 关闭后重连失败而失效。

## 3. 在线时长跟踪

### 内存去重

- 注册表继续以 `(owner_id, cdk_id, machine_code)` 为 key。
- 每个 key 维护连接集合及 `last_usage_checkpoint`；第一条 socket 建立开始计时，最后一条 socket 断开才结束，重叠连接不重复计时。
- 每条连接收到 Pong 时可请求 checkpoint；注册表只允许同一 key 每 5 分钟返回一次新区间。
- 最后一条连接断开、绑定失效时返回未落库尾段并立即持久化。
- 查询详情时从注册表读取尚未落库区间并叠加到响应。

### 每日聚合表

新增 `cdk_usage_daily`：

```text
created_by, machine_code, usage_date,
duration_seconds, first_active, last_active, updated_at
UNIQUE(created_by, machine_code, usage_date)
```

- 一个在线区间按 Asia/Shanghai 午夜拆分。
- 使用 `INSERT ... ON DUPLICATE KEY UPDATE` 累加秒数并维护首次/末次活动。
- 时间戳以 UTC DATETIME 保存；`usage_date` 是 Asia/Shanghai 自然日。
- 每 24 小时清理 365 天前的 `cdk_usage_daily` 与 `usage_logs`。
- 不保存 Ping/Pong 明细，不新增永久 session 行。

### 查询兼容

- `GET /api/cdk/machine-usage` 响应字段保持不变。
- 有聚合数据的日期以 `duration_seconds` 为准；旧日期没有聚合数据时继续回退到历史 request 首末差，避免历史图表突然清空。
- `requests` 和关联 CDK 继续来自 `usage_logs`；在线时长不再由请求数推导。
- 当天响应叠加注册表中的未 checkpoint 尾段，因此页面刷新能看到接近实时的累计时长。

## 4. SkinForge 到期处理

- `LicenseSession` 保存解析后的 UTC `expires_at`。
- validate/activate 成功授权时必须把响应的 `expires_at` 传入会话，缺失或无法解析视为无效响应。
- 连接监控在 WebSocket 消息、session 变化之外同时等待本地到期 deadline。
- 本地 deadline 到达后执行一次 `/validate`：续期则用新 deadline 重建会话；过期/禁用/换绑则立即失效；网络错误采用既有短宽限逻辑但不无限延长授权。
- 事件解析明确映射 `expired`、`disabled`、`banned`、`rebound`。

## 5. 资源预算

- 不为每个连接固定周期查询 CDK；自然到期每个 deadline 只查询一次。
- 时长持久化上限约为每个不同在线绑定每 5 分钟一次 upsert；3000 个 key 的理论上限约 10 次写入/秒，实际随在线量下降。
- 注册表每个 key 只增加少量时间字段，无无界队列；既有连接数与队列容量限制保持不变。
- 每设备每天仅一个聚合行，365 天清理保证统计表和请求日志有界。

## 6. 兼容与回滚

- 新表使用独立迁移，旧 `usage_logs` 不改列，接口 DTO 不改字段。
- 服务端可先于新客户端部署：旧客户端在服务端关闭过期 socket 后会重连并走现有拒绝/validate 路径。
- 回滚代码时新聚合表可保留，不影响旧版本；迁移不删除历史数据。
