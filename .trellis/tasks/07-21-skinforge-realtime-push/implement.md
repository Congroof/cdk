# 实施计划

## 当前实现状态（2026-07-21）

已完成：服务端绑定历史三处 schema、原子 activate/rebind、IP 记录、内存注册表、WS 认证/心跳/边界、Nginx 配置与 API 文档；桌面管理后台 CDK 绑定详情、成功绑定次数聚合、设备汇总、换绑时间线、IP 审计与有界分页；SkinForge Rust 授权运行态、60 秒 grace、抖动退避、HTTP 复验、明确换绑立即撤权、本地 CDK 删除、安全点检查、AutoChampSelect/生成/应用保护、React snapshot/event 门禁与固定提示；两仓库规格已同步。

本地验证已完成：cdk-server `cargo fmt --check`、`cargo check`、20 项测试、默认 `cargo clippy`；cdk-server 管理前端全量 ESLint、TypeScript/Vite 生产构建；SkinForge `cargo fmt --check`、`cargo check`、132 项测试、TypeScript/Vite 生产构建、两仓库 `git diff --check`。cdk-server 严格 `clippy -D warnings` 仍被 4 个既有 baseline warning 阻塞（两个未使用结构、两个旧 `manual_clamp`）。

仍需在部署环境完成：MySQL 事务/并发集成测试、Nginx `nginx -t` 和实际 101 Upgrade、A -> B 端到端换绑、59/60 秒断网边界、600 连接/15 分钟 RSS 容量测试。当前机器无本地 nginx，Docker 也无缓存 nginx 镜像，因此未伪造这些结果。

## 阶段 A：cdk-server 数据与原子换绑

- [ ] 新增 `cdk_binding_history` 启动建表、编号 migration 与 Docker 初始化 schema，保持三处一致。
- [ ] 增加成功绑定历史模型/SQL，覆盖首次激活与 rebind；失败/同机重复激活不写成功历史。
- [ ] 增加可信 `X-Real-IP` 提取 helper，只接受可解析 IPv4/IPv6，不记录任意原始 Header。
- [ ] 抽取共享 activate workflow，使默认 admin 与 username-scoped 两条入口复用同一业务逻辑。
- [ ] 在事务内用 `(code, created_by) SELECT ... FOR UPDATE` 串行化；绑定更新和 history INSERT 同事务提交。
- [ ] 添加并发/状态矩阵测试：unused、same machine、rebind、disabled、expired、并发 rebind、history 失败回滚。

## 阶段 B：cdk-server WebSocket

- [ ] 为 Axum 0.8 开启 `ws` feature。
- [ ] 新增 typed WS protocol、连接注册表和 bounded per-connection command channel。
- [ ] 实现 3000 全局连接上限、32 队列、64KB frame/message、30 秒 heartbeat 与幂等清理。
- [ ] 新增 `/api/client/u/{username}/cdk-events`，从 Rust-only Header 解析 CDK/HWID，并在 Upgrade 前校验当前数据库绑定。
- [ ] rebind commit 后向 `(owner_id, cdk_id, old_machine)` 的全部连接发送 v1 invalidated + close。
- [ ] 单元测试 Header 校验、协议序列化、注册/清理、多连接定向、容量上限、队列满与未知连接。

## 阶段 C：Nginx 与服务端文档

- [ ] 更新 `deploy/nginx-docker.conf` 与 `deploy/nginx.conf`，显式转发 Upgrade/Connection，设置 75 秒 read timeout。
- [ ] 更新 README/API 文档：WS 路由、Header、协议、部署顺序、HTTP 明文风险与资源上限。
- [ ] 增加/更新 `.trellis/spec/backend/` 的 CDK 绑定与 WS 契约，确保未来修改两条 activate 路径时不会漏通知。

## 阶段 D：SkinForge Rust 授权运行时

- [ ] 在 `domain` 定义 typed license snapshot、失效原因、WS envelope/parser；保持 CDK/HWID 不可序列化到前端。
- [ ] 在 `AppState` 增加授权快照、session watch/cancellation 和安全停止信号。
- [ ] 实现 `CdkConnectionManager`：自定义 Header、ws:// 地址、heartbeat、jitter backoff、60 秒 grace、重连 DB 复验。
- [ ] 让 `cdk_validate` / `cdk_activate` / `cdk_remove` 驱动统一 Rust 授权状态，并新增 snapshot command。
- [ ] 实现幂等 revoke：删除 `license.cdk`、停止连接、emit `cdk:license-state`。
- [ ] 在 setup 中只启动一个 manager，记录其状态所有权和退出方式。
- [ ] Domain 单元测试协议解析、未知版本/类型、状态迁移、60 秒 deadline 与重复 revoke。

## 阶段 E：安全停止与命令保护

- [ ] 核心生成/应用命令入口检查 Rust license state；失效后拒绝新操作。
- [ ] `AutoChampSelectService` 和其他独立于 React 的自动动作在执行前检查授权。
- [ ] 失效时停止现有 `runoverlay` 与可安全取消循环。
- [ ] 为批量生成/应用准备增加阶段边界 cancellation；当前原子文件步骤结束后退出，撤权后不得启动下一阶段或 `runoverlay`。
- [ ] 测试撤权期间的新命令拒绝、apply prepare 后不启动 overlay、批量任务在 item 边界停止、重复 stop/revoke 安全。

## 阶段 F：SkinForge React 门禁

- [ ] 在共享 TS 类型定义 license snapshot/event payload。
- [ ] 增加 snapshot + event hook，按项目规范处理异步 listener cleanup。
- [ ] 重构 `CdkGate` 使用 Rust 授权状态，移除 30 分钟 interval。
- [ ] rebound 立即卸载主 UI并显示“此 CDK 已在其他设备激活，请重新输入 CDK”。
- [ ] grace 到期回门禁；手动重新激活成功后恢复主 UI 和连接。
- [ ] 验证激活成功后使用说明等既有 transition 行为不回归。

## 阶段 G：验证与容量检查

- [ ] cdk-server：`cargo fmt --check`、`cargo check`、`cargo test`、`cargo clippy`。
- [ ] cdk-server 前端（若文档/后台无代码变更可仅 build 基线确认）：`npm run build`。
- [ ] SkinForge：`cargo fmt --check`、`cargo test`、`cargo check`、`pnpm run build`。
- [ ] Docker 构建并执行 `nginx -t`；验证普通 HTTP API 和 101 Upgrade 共存。
- [ ] 端到端：A 激活并连接 -> B 换绑 -> A 立即锁定并删除本地 CDK -> B 保持有效。
- [ ] 断网：A 进入 grace，59 秒内恢复保持有效；超过 60 秒锁定。
- [ ] 离线换绑：A 离线，B 换绑，A 下次启动/连接立即锁定。
- [ ] 并发换绑：A -> B/C 并发，检查最终 DB、history 顺序、响应与定向事件一致。
- [ ] 用同一合法绑定建立 600 个空闲连接，保持至少 15 分钟，记录 cdk-server RSS、容器总内存、心跳稳定性和清理后的连接数；不得出现持续无界增长。

## 阶段 H：桌面后台绑定历史可视化

- [x] 增加绑定历史查询 DTO 与 `GET /api/cdk/{cdk_id}/binding-history` handler；按 JWT 租户校验 CDK 所有权。
- [x] 基于 `cdk_binding_history` 计算当前机器、历史机器数、成功绑定总次数、换绑次数和按机器聚合统计。
- [x] 时间线使用 `created_at DESC, id DESC` 稳定分页，默认 50、最大 100；空历史返回成功空结构。
- [x] 更新 `API.md`，记录管理端请求、响应、统计口径、分页和租户隔离。
- [x] 增加前端绑定历史 DTO、API 调用与 `CdkBindingHistoryModal`。
- [x] 在桌面 `CDKTable` 操作区增加“绑定详情”，实现汇总卡、设备表、事件时间线、空态、加载态和翻页。
- [x] 保持 `MobileCdk` 不变；回归 CDK 列表搜索、分页、编辑有效期与禁用交互。
- [x] 后端验证 `cargo fmt --check`、`cargo check`、`cargo test`、`cargo clippy`；前端验证 lint、类型检查/生产构建和 `git diff --check`。

## 风险点与回滚点

- 数据事务重构：保持响应 envelope/错误文案兼容；失败可先回滚共享 workflow，但不能保留非原子 rebind + push 的半方案。
- Nginx 必须先于客户端发布；未完成 101 验证不得发布依赖租约的新客户端。
- Rust 授权状态替换 React interval：保留明确的 snapshot seed，防止监听注册前丢事件。
- 安全停止不得在线程任意位置强杀文件写入；若 cancellation 验证不完整，先只在已证明安全的阶段边界启用。
- 回滚时服务端新表可保留；客户端回滚恢复旧 30 分钟校验。
