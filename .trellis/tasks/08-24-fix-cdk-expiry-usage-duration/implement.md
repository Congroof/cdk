# 实施计划

1. **数据库与聚合模块**
   - 新增 `cdk_usage_daily` 的运行时建表、009 迁移和部署初始化 SQL。
   - 实现 Asia/Shanghai 跨日区间拆分、聚合 upsert、365 天清理及单元测试。
2. **连接注册表与失效协议**
   - 注册表按 key 维护 usage checkpoint，提供周期 checkpoint、尾段提取、查询 pending 区间。
   - 泛化失效原因；保持有界队列、去重在线设备和敏感字段约束。
3. **WebSocket 生命周期**
   - 握手携带 `expires_at`，连接中加入到期 deadline。
   - 到期时单次复核并处理续期/过期；Pong 时低频落库，断开时补写尾段。
   - disable、ban、rebind 路径在数据库成功后主动关闭对应在线连接。
4. **管理统计**
   - `machine_usage` 合并每日聚合、旧 usage_logs 及当前内存尾段，保持响应兼容。
   - 必要时同步 usage overview 的 active/last-seen 语义和 API 文档。
5. **SkinForge 客户端**
   - 在 SkinForge 仓库建立对应 Trellis 任务并读取其 backend specs。
   - 会话携带 `expires_at`，到期主动复核；扩展失效原因解析和测试。
6. **验证**
   - cdk-server：`cargo fmt --check`、`cargo test`、`cargo check`，前端 `npm`/`pnpm` 现有 lint/build 命令。
   - SkinForge：`cargo fmt --check`、相关 Rust 测试、`cargo check`、`pnpm run build`。
   - 检查 migration/db.rs/mysql-init 三处 schema 一致、接口字段兼容、无逐心跳日志写入。
7. **回滚点**
   - 服务端新表为追加式，回滚代码无需删表。
   - 客户端 deadline 逻辑与服务端事件原因可独立回滚；旧客户端仍由服务端断连保障。
