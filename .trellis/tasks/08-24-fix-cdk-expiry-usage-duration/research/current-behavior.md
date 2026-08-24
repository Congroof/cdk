# 当前授权与时长统计行为

## cdk-server

- `backend/src/handlers/cdk_events.rs`
  - WebSocket 握手时查询 CDK，要求 activated、机器码匹配且未过期。
  - 连接建立后只做 30 秒 Ping / 60 秒 Pong 超时，没有再次查询有效期。
- `backend/src/cdk_events.rs`
  - 注册表按 `(owner_id, cdk_id, machine_code)` 分组，支持同一 key 多连接。
  - 现有失效事件仅生成 `rebound`，注册表容量上限 3000。
- `backend/src/handlers/cdk.rs`
  - activate/validate 在业务校验完成前写入 `usage_logs`。
  - `machine_usage` 按 UTC 数据库日期分组，以当日最大请求时间减最小请求时间作为时长。
  - disable 当前只更新数据库，不通知在线连接。
  - update-validity 可延长 activated CDK 的 `expires_at`。
- `backend/src/handlers/banned.rs`
  - ban 当前只写数据库，不通知在线连接。
- `backend/src/db.rs`、`deploy/mysql-init/01_schema.sql`、`backend/migrations/`
  - Schema 需要在运行时建表、部署初始化和编号迁移三处同步。

## SkinForge

- `src-tauri/src/application/cdk_service.rs`
  - validate/activate 响应已经包含 `expires_at`。
- `src-tauri/src/application/license_service.rs`
  - 授权会话只保存 CDK、机器码和数据目录，没有保存过期时间。
  - 长循环维护 WebSocket；HTTP validate 只在连接被拒绝或断线宽限期触发。
- `src-tauri/src/domain/license.rs`
  - 已有 `Expired`、`Disabled` 原因，但 WebSocket 事件解析目前只识别 `rebound`。
- `src/features/cdk/components/CdkGate.tsx`
  - `cdkValidate()` 只在组件挂载时执行一次，没有定时器。

## 约束与结论

- 服务端握手已经拿到 `expires_at`，可为每条连接设置 Tokio deadline；到点只查询一次以确认是否在线续期，比固定周期查询所有 CDK 省资源。
- 时长应按注册表 key 去重，而不是按 socket 累加，否则重连重叠会翻倍。
- 每日聚合表每设备每天一行可显著减少磁盘占用；内存 checkpoint 每 5 分钟累计一次，断开时补写，异常退出最多损失一个周期。
- 当前前端把无时区数据库时间追加 `Z` 后转本地显示；每日归属应显式按 Asia/Shanghai 切分，活动时间继续保存 UTC。
