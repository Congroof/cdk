# 技术设计

## 边界

- `cdk-server` 保留现有 `ActivateRequest`，供通用和管理端激活入口继续使用。
- 为租户激活入口增加独立的请求契约，包含 `code`、`machine_code`、`version`，避免破坏旧 CLI。
- `user_activate` 在任何数据库查询和绑定写入之前复用现有 SemVer 校验函数。
- 现有 `validate`、`user_validate` 的最低版本常量同步提升到 `2.5.3`。
- SkinForge 激活请求发送 `env!("CARGO_PKG_VERSION")`，并将应用包版本升到 `2.5.3`。

## 数据流

`CdkGate` → `cdk_activate` → `CdkService::activate` → `POST /api/client/u/{username}/activate` → JSON 反序列化要求 `version` → SemVer 最低版本校验 → 原激活逻辑。

## 兼容性

- `/api/client/activate` 与 `/api/cdk/activate` 请求体不变。
- `/api/client/u/{username}/activate` 从本任务起要求 `version`。
- `2.5.2` 及更早 SkinForge 客户端无法通过 validate 或 activate，符合已确认产品意图。

## 回滚

- 服务端可通过恢复租户激活请求类型和移除入口校验回滚。
- SkinForge 的请求字段为向后兼容的客户端侧新增，但服务端回滚后会忽略额外 JSON 字段。
