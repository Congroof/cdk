# CDK 换绑实时失效技术研究

## 代码事实

### cdk-server

- 后端是 Axum 0.8 + Tokio + SQLx 0.8 + MySQL 8，Nginx 与 Axum 运行在同一容器。
- 公网只映射 80；Axum 3000 未直接暴露。Nginx 已覆盖 `X-Real-IP` 并追加 `X-Forwarded-For`，后端可把 `X-Real-IP` 视为受信代理输入。
- 两条客户端激活路径都可能修改绑定：`/api/client/activate`（默认 admin 租户）与 `/api/client/u/{username}/activate`（显式租户）。当前 SkinForge 使用后者。
- 当前激活处理先写 attempt 型 `usage_logs`，再读取 CDK；已激活且机器不同会直接 `UPDATE cdkeys SET machine_code = ? WHERE id = ?`，没有事务行锁。
- `usage_logs` 不能表达一次成功换绑的 old -> new 关系，需要独立的成功绑定历史。

### SkinForge

- Tauri 2 Rust 已有 Tokio、`tokio-tungstenite`、`futures-util` 与 `tokio-util`，无需新增 WebSocket 客户端运行时。
- LCU manager 已提供长连接、重试、事件解析和 Tauri emit 的可复用结构。
- `CdkGate` 启动校验，之后每 30 分钟校验；网络错误会在校验发生时关闭主 UI。
- `AppState` 已管理长任务状态与多个取消信号；`runoverlay` 有现成停止路径。
- Rust `AutoChampSelectService` 由 LCU 后台 manager 直接驱动，即使 React 主界面卸载也可能继续动作，因此失效必须在 Rust 侧设授权检查，不能只隐藏 UI。

## 官方能力确认

- Axum WebSocket 由 `axum::extract::ws` 提供，需开启 `ws` feature；`WebSocketUpgrade` 支持 `max_frame_size`、`max_message_size` 与 `on_upgrade`，socket 可 split 为并行读写任务：<https://docs.rs/axum/latest/axum/extract/ws/>
- Nginx 反向代理不会自动转发 hop-by-hop 的 `Upgrade` / `Connection` Header，必须显式配置；官方说明：<https://nginx.org/en/docs/http/websocket.html>
- MySQL 普通 `SELECT` 不会保护“读取后再更新”的业务；事务内 `SELECT ... FOR UPDATE` 会锁住目标索引记录直至提交/回滚，适合串行化同一 CDK 的并发换绑：<https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html>
- SQLx `Transaction` 支持显式 commit/rollback，未提交事务 drop 时回滚：<https://docs.rs/sqlx/latest/sqlx/struct.Transaction.html>
- `tokio-tungstenite` 可用自定义 HTTP Request 建连并添加认证 Header：<https://docs.rs/tokio-tungstenite/latest/tokio_tungstenite/fn.connect_async.html>
- Tauri Rust 可通过 typed event 把授权快照发送给前端：<https://v2.tauri.app/develop/calling-frontend/>

## 方案结论

1. 不引入 Redis、MQTT 或消息队列。单实例内存注册表当前按 <= 3000 在线连接设置硬上限。
2. WebSocket Upgrade 前使用 Rust-only Header 中的租户路径、CDK 与 HWID查询数据库；不把 CDK 放入 query string 或 React。
3. 注册表键使用 `(owner_id, cdk_id, machine_code)`，值允许多个 connection id，确保同机多实例全部收到失效。
4. 每连接使用容量 32 的 bounded channel；注册表全局上限 3000；消息/帧上限 64KB；不开压缩。
5. 服务端每 30 秒发送心跳，Nginx `proxy_read_timeout` 设为 75 秒；客户端最长 60 秒没有服务端授权确认即 fail closed。
6. 换绑使用事务 + `SELECT ... FOR UPDATE`。绑定更新和历史 INSERT 同事务提交；提交成功后再 best-effort 通知旧机器，推送失败不回滚新绑定。
7. 在线失效消息是加速器，数据库校验和客户端短租约才是可靠性兜底，因此不需要离线消息表或 ACK 补发。
8. 客户端授权状态必须在 Rust `AppState` 中作为唯一运行时快照；React 只订阅 typed snapshot，不持有 CDK/HWID。
9. 明确失效立即撤权并删除 `license.cdk`；网络异常进入 60 秒 grace。安全停止协调器立即停止 overlay/可取消循环，在文件任务阶段边界停止。

## 已接受限制

- HTTP/WS 明文传输不能抵御链路监听和篡改。
- 允许仅凭 CDK 自由换绑，因此旧用户仍可手动换回。
- 失效事件不持久化；离线客户端由后续校验和租约锁定。
- IP 是网络线索而非人员身份，可能变化、共享或受 VPN/代理影响。
