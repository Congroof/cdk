# 自定义 MOD 生产故障复盘

## Bug Analysis: SQLx/MySQL 运行时类型与启动迁移边界未被测试

### 1. Root Cause Category

- **Category**: D — Test Coverage Gap（主因）
- **Secondary**: E — Implicit Assumption；B — Cross-Layer Contract
- **具体原因**：项目使用运行时字符串 SQL，Rust 编译与纯函数单元测试不会验证 MySQL 返回列的真实 metadata。开发时把 `COUNT(*)`、`information_schema COUNT(*)` 和 `SELECT 1` 按“数值很小”推断为无符号小整数，忽略了 MySQL 实际分别暴露为 signed `BIGINT`。同时用字符串切片从 `DATABASE_URL` 提取库名，默认假定连接串没有 query 参数。

### 2. 为什么之前的修复仍然漏问题

1. 第一次修复只把预览列存在性 `COUNT(*)` 从错误的无符号类型改为 `i64`，没有系统搜索同一提交里的其他运行时 SQL 类型假设。
2. 第二次修复只改了 MOD 列表两个 `COUNT(*)`，仍没有执行重复导入路径；`SELECT 1` 解码到 `u8` 的同类错误继续存在。
3. 原测试全部是纯函数/序列化测试；`cargo test`、Clippy 和 TypeScript build 都不连接 MySQL，因此无法区分 Rust 声明类型与 MySQL 实际列类型。
4. 启动迁移只用无 query 的本地连接串验证，未覆盖生产常见的 `?ssl-mode=...` 形式；旧实现会把 query 拼进 `TABLE_SCHEMA` 比较，误判列不存在并再次 `ALTER TABLE`。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Test Coverage | 新增显式 MySQL 8 集成测试，覆盖有/无分类 COUNT、行解码、重复存在性、唯一约束和删除 | DONE |
| P0 | Architecture | 重复检查改为选择真实的 unsigned `file_id` 列，不再解码无类型语义的 `SELECT 1` 常量 | DONE |
| P0 | Runtime/Startup | 用 `MySqlConnectOptions` 解析连接串，保留 query 配置并取得真实 database name | DONE |
| P1 | Contract Test | 新增三份 MOD schema 必要字段/索引一致性测试 | DONE |
| P1 | Boundary Validation | 后端在 KDocs/数据库调用前校验 VARCHAR/TEXT/JS safe integer 边界，前端守卫同步 | DONE |
| P1 | Quality Gate | 清理历史 dead code，使严格 Clippy 重新成为可执行门禁 | DONE |
| P1 | Documentation | 更新数据库、质量与 SkinForge delivery spec，规定真实 MySQL 回归 | DONE |

### 4. Systematic Expansion

- **Similar Issues**：已搜索后端全部 `COUNT(*)`、`SELECT 1` 和 unsigned tuple；本次新增路径中除已修位置外未发现同类错误。
- **Design Improvement**：把 MOD 分页 SQL与重复检查提取为可直接调用的数据库函数，使集成测试覆盖生产查询本体，而不是复制一份测试 SQL。
- **Process Improvement**：任何新增/修改运行时 SQL，尤其 aggregate、literal、unsigned 和 nullable 列，都必须至少在 MySQL 8 执行一次；编译通过不能作为 SQLx 查询验证。
- **Operational Boundary**：本地验证不使用生产 Cookie。真实 KDocs 成功换链仍需上线前用生产同构凭证做一次只读 smoke test；本地已覆盖其解析、超时、错误映射和降级逻辑。

### 5. Evidence

- 一次性探针在修复前稳定复现：`SELECT 1` → `Option<(u8,)>` 报 `Rust type u8 ... is not compatible with SQL type BIGINT`。
- MySQL 8 新库：公开列表 200、分类筛选 200、非法分类 400、缺失下载 404、未鉴权管理列表 401。
- MySQL 8 旧表：最终代码启动后自动新增 `preview_file_id bigint unsigned NULL`，公开列表返回 200。
- 带 `?ssl-mode=preferred` 的连接串：最终代码正常启动并查询 MOD 列表。
- 最终 MySQL 集成测试：1 passed，覆盖 COUNT、行解码、重复约束和删除。
