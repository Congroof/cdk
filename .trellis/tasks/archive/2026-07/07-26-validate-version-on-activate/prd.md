# 激活接口校验客户端最低版本

## 目标

补齐 CDK 首次激活链路的客户端最低版本校验，避免旧客户端通过激活成功直接进入主界面，绕过现有的 validate 版本门禁。

## 已确认事实

- 服务端最低客户端版本当前为 `2.5.0`，本任务将其提升到 `2.5.3`；现有版本门禁只在 `validate` 与 `user_validate` 中执行。
- SkinForge 启动时的已有 CDK 校验会向 `/api/client/u/{username}/validate` 发送编译版本 `CARGO_PKG_VERSION`。
- SkinForge 首次输入 CDK 时调用 `/api/client/u/{username}/activate`，请求体目前只有 `code` 和 `machine_code`。
- 激活成功后 SkinForge 直接授权本地会话并进入主界面，因此当前可以绕过最低版本限制。
- SkinForge 当前工作区包版本仍为 `2.5.2`，本任务需要同步升级为 `2.5.3`。

## 需求

- SkinForge 的激活请求携带编译时包版本 `CARGO_PKG_VERSION`。
- 服务端最低客户端版本更新为 `2.5.3`，`2.5.2` 及以下版本均视为不受支持。
- SkinForge 应用版本同步升级为 `2.5.3`。
- 仅 SkinForge 使用的租户激活入口 `/api/client/u/{username}/activate` 强制要求并校验版本。
- 服务端在执行任何租户激活副作用（绑定机器、写入历史等）之前校验客户端版本。
- 缺失版本、非法 SemVer、低于 `2.5.3` 的激活请求必须失败，且不得激活或修改绑定。
- 版本错误沿用现有 validate 接口的错误文案和 HTTP 错误语义。
- 更新受影响的 API 文档和自动化测试。

## 验收标准

- SkinForge `2.5.3` 输入有效 CDK 可以正常激活并进入主界面。
- 激活请求未携带 `version` 时失败。
- 激活请求携带非法版本或低于 `2.5.3` 的版本时失败。
- 激活请求携带 `2.5.3` 或更高 SemVer 时保持原有激活行为。
- 已有 CDK 的 validate 行为保持不变。
- 服务端相关测试及 SkinForge Rust 检查通过。

## 暂不包含

- 动态配置最低版本。
- 改变激活成功后的界面流程。
- 修改通用 `/api/client/activate`、管理端 `/api/cdk/activate` 或仓库内旧 CLI 的激活契约。
