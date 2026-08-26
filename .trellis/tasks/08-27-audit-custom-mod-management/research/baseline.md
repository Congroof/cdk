# 审计基线（2026-08-27）

## 提交范围

- `00a77ca`：自定义 MOD 分类管理主功能
- `4672921`：临时链接生产超时与缓存加固
- `c00308e`：预览图支持
- `62fd450`：预览字段检查类型修复
- `51ca1c3`：MOD 列表计数类型修复

## 已执行门禁

- `cargo test`：40 passed。
- `npm run lint`：通过。
- `npm run build`：通过；仅有既存的大 chunk 警告。
- `cargo clippy --all-targets --all-features -- -D warnings`：失败，原因是 `UsageOverview` 与 `User` 两个历史未使用模型触发 `dead_code`，与 MOD diff 无直接关系，但最终质量门禁仍需处理或明确。

## 已确认的覆盖缺口

- 现有 MOD 测试均未连接 MySQL，因而未捕获两次已在生产出现的 SQLx/MySQL 运行时解码错误。
- 缺少全新 schema 与旧 schema 自动升级测试。
- 缺少实际列表 SQL、唯一约束和删除的集成测试。
- 缺少路由级分页 envelope/字段命名测试。
- 前端没有专用测试脚本，关键交互目前仅由 lint/build 间接覆盖。

## 环境状态

- Docker CLI 可用，但本机 Docker/OrbStack daemon 尚未运行；真实 MySQL 8 验证需要启动本地容器运行时。
