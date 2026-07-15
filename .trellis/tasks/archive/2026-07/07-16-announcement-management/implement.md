# 实施清单

1. 新增公告数据库表：启动建表、迁移文件、Docker 初始化 schema。
2. 新增公告模型和 handler，实现当前管理员读取、upsert 保存、按用户名公开读取。
3. 注册受保护管理路由和免鉴权客户端路由。
4. 更新 `API.md`，记录字段、状态码、请求响应和 curl 示例。
5. 新增前端类型和 `AnnouncementEditor`，接入 Dashboard 新标签。
6. 增加可独立测试的输入校验单元测试。
7. 运行后端 `cargo fmt --check`、`cargo check`、`cargo test`、`cargo clippy`。
8. 运行前端 lint 和 build，检查跨层字段一致性。
9. 核对 migration、启动建表和 Docker schema 三处结构完全一致。

## 风险点

- 管理端和客户端路由不能误放到同一鉴权边界。
- upsert 必须依赖 `created_by` 唯一约束，避免并发创建重复公告。
- 公开接口不能返回停用草稿或管理员内部字段。
- 前端正文只能按纯文本编辑和展示。

## 验证命令

```bash
cd backend && cargo fmt --check && cargo check && cargo test && cargo clippy
cd frontend && npm run lint && npm run build
```
