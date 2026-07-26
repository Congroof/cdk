# 技术设计

## 路由边界

- 在 `backend/src/main.rs` 删除 2 个受保护旧入口和整个 4 路由通用 `client_routes`。
- 保留 `user_client_routes` 的 8 个 SkinForge 入口，不改变路径、认证或 DTO。
- 保留全部管理后台真实调用的受保护路由。

## 处理函数

- 删除 `handlers::cdk::validate` 和 `handlers::cdk::activate`；保留 `user_validate`、`user_activate`、`validate_client_version`、`activate_for_owner`。
- 删除 `handlers::feedback::submit` 和 `handlers::feedback::query_for_client`；保留租户提交/查询和后台管理函数。
- 保留 `ActivateRequest` 作为 `UserActivateRequest` 的扁平内部负载，不为删除路由做无关 DTO 重构。

## 数据兼容

- 不迁移 `user_feedback.created_by`，不删除 `NULL` 历史行。
- 租户反馈查询现有的匿名记录兼容语义保持不变。
- 已删除接口返回路由级 404；不新增 410 兼容处理。

## 文档与规范

- API 文档以租户 validate/activate/feedback 为唯一客户端契约。
- 删除旧 CLI 与通用 admin 租户路由的示例、说明和测试要求。

## 回滚

- 所有删除均为 Git 可恢复的源码/路由变更，无数据库迁移；可通过回退提交恢复。
