# 清理未使用旧版接口和 CLI

## 目标

只保留管理后台和 SkinForge 当前真实调用的服务端接口，删除旧版通用客户端、手工管理校验/激活入口和独立 CLI，减少未认证攻击面与维护成本。

## 已确认事实

- 服务端当前注册 39 个 HTTP/WebSocket 方法入口。
- 管理后台实际调用 25 个入口；除 `/api/cdk/validate`、`/api/cdk/activate` 外，其余受保护入口均有已挂载组件调用。
- SkinForge 实际调用 8 个入口：租户 validate、activate、announcement、feedback、feedback/query、cdk-events，以及 updater、hash。
- `/api/client/activate` 仅由旧 `cli/` 调用；`cli/` 不参与构建或部署，且用户已确认删除。
- 四个通用 `/api/client/*` 入口没有 SkinForge 调用，其中激活、校验操作默认 admin 租户。
- 当前工作区已有本轮删除 `cli/`、`.gitignore` 和 `.dockerignore` 的未提交改动。

## 删除范围

- 删除 `cli/` 独立 Rust 工具及其忽略规则。
- 删除以下路由：
  - `POST /api/cdk/validate`
  - `POST /api/cdk/activate`
  - `POST /api/client/validate`
  - `POST /api/client/activate`
  - `POST /api/client/feedback`
  - `POST /api/client/feedback/query`
- 删除仅服务上述路由的处理函数、兼容性测试和文档内容。
- 保留租户版本校验、租户激活、共享绑定逻辑和租户反馈逻辑。
- 同步 README、API 文档和相关 Trellis 代码规范。

## 验收标准

- 服务端路由表不再注册上述 6 个入口。
- SkinForge 使用的 8 个入口全部保留，路径和请求契约不变。
- 管理后台实际调用的 25 个入口全部保留。
- `cli/` 目录及项目级忽略规则均不存在。
- 后端格式化、测试、Clippy 和构建检查通过；前端构建通过。
- 全仓库搜索不再出现作为现行接口文档或实现的 6 个已删路径。

## 不在范围内

- 不删除匿名反馈历史数据，不修改数据库字段或迁移；现有匿名记录仍可由原有管理/租户查询逻辑读取。
- 不修改 SkinForge 仓库。
- 不删除任何租户接口、更新接口、哈希接口或管理后台正在调用的接口。
- 不根据本地代码直接断言外部未知调用；上线前仍建议检查反向代理访问日志。
