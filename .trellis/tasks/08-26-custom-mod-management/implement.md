# 自定义 MOD 分类管理——实施计划

1. 数据库
   - 新增 `010_create_skinforge_mods.sql`。
   - 同步 `backend/src/db.rs` 启动建表与 `deploy/mysql-init/01_schema.sql`。
2. 后端模型与处理器
   - 在 SkinForge 模型中加入 MOD 清单、分类、数据库 Row、管理/公开 DTO、分页查询类型。
   - 实现清单校验与分类解析，复用已有 ID 校验和 KDocs 换链探测逻辑。
   - 实现鉴权的分页列表、导入、删除接口。
   - 实现无鉴权的分页元数据和按 ID 获取临时 URL 接口。
   - 在 `main.rs` 注册 protected/public 路由。
3. 前端
   - 在共享类型中加入 MOD 清单与分页响应类型。
   - 新建 `SkinforgeModManager`，实现 JSON 导入、分类子标签、分页列表、文件大小展示和确认删除。
   - 在 Dashboard 添加“自定义 MOD”Tab。
4. 文档
   - 更新 `API.md`、`README.md` 的管理/公开接口与 JSON 示例。
   - 若实现确认形成稳定交付约束，更新 SkinForge delivery spec。
5. 验证
   - `cargo fmt --check`
   - `cargo test`
   - `cargo clippy --all-targets --all-features -- -D warnings`（若项目环境支持）
   - 前端 lint 与 production build。
   - 检查迁移、启动 schema、Docker init schema 字段与索引一致。
   - 检查 API 字段命名与 TypeScript 类型一致。

## 风险与回滚点

- KDocs 临时 URL 绝不能落库或进入公开列表。
- 动态分页 SQL 的筛选绑定顺序需覆盖有/无 category 两条路径。
- MySQL 唯一约束错误需映射为 409，而不是 500。
- 删除当前页最后一项时前端页码需正确回退。
- 每完成数据库、后端 API、前端三个阶段之一即可单独回滚对应改动；新表保留不会影响旧服务。
