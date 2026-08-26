# 自定义 MOD 分类管理——技术设计

## 架构边界

功能复用全局 SkinForge 云文档配置和 `KdocsClient::resolve_download_url`，但使用独立的多行 MOD 表、模型、管理组件和 API。服务端只持久化稳定文件标识与元数据，不缓存、不记录临时 OSS URL，也不代理大文件。

## 数据流

### 导入

`本地 JSON → 前端结构预检 → POST manifest → 服务端完整校验 → 校验 group/parent 与全局 KDocs 配置一致 → 检查 file_id/link_id 重复 → 动态换链并探测 → 插入数据库 → 返回记录`

前端预检只用于即时反馈，服务端是最终校验边界。

### 列表

`category/page/page_size → SQL COUNT + 分页查询 → 管理或公开 DTO → 页面/客户端`

管理和公开列表复用相同分页规则。公开 DTO 只暴露 `id/category/fileName/fileSize/createdAt`。

### 下载

`公开 MOD id → 查询稳定 file_id/link_id → KDocs 动态换链 → 返回临时 URL JSON`

列表阶段不换链；每次下载地址请求都重新生成 URL。找不到记录返回 404，换链失败返回 503。

### 删除

`管理员确认 → DELETE id → 删除数据库行 → 公开列表立即不可见`

云文档源文件保持不变，可重新导入原 JSON。

## 数据库设计

新增 `skinforge_mods`：

| 字段 | 类型/约束 | 用途 |
|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT PK | 公开稳定标识 |
| `category` | VARCHAR(32) NOT NULL | `map/skin/accessory` |
| `file_id` | BIGINT UNSIGNED NOT NULL | KDocs 文件标识 |
| `link_id` | VARCHAR(128) NOT NULL | KDocs link/cid |
| `link_url` | TEXT NULL | 原始清单元数据 |
| `file_name` | VARCHAR(255) NOT NULL | 展示名称 |
| `file_size` | BIGINT UNSIGNED NOT NULL | 展示大小 |
| `created_by` | BIGINT NOT NULL | 导入管理员 |
| `created_at` | DATETIME DEFAULT NOW() | 排序时间 |

约束与索引：

- `UNIQUE(file_id, link_id)` 保证重复导入在并发下仍被拒绝。
- `INDEX(category, created_at, id)` 支持分类倒序分页。
- category 由服务端枚举校验，不依赖数据库 ENUM，保持 SQLx 行类型简单。
- 启动建表、编号迁移和 Docker 初始化 SQL 必须同步。

## API 与序列化

- Rust 和 TypeScript 均使用 camelCase JSON；数据库保持 snake_case。
- 管理接口位于现有 JWT protected router。
- 公开列表与下载地址接口位于 `/api/client/skinforge/...` 无鉴权 router。
- 列表响应使用项目标准 `success/data` envelope；下载地址数据为 `{ "url": "..." }`，同样置于 `data`。
- 分页：`page` 默认 1；`page_size` 默认 10、最小 1、最大 50；非法 category 返回 400。
- 排序固定为 `created_at DESC, id DESC`，确保同时间戳结果稳定。

## 校验与错误

- `schemaVersion == 1`、`product == "skinforge-mod"`。
- category 仅允许 `map/skin/accessory`。
- file/group/parent ID 是正整数；link ID、文件名非空；文件大小大于 0。
- MOD 清单不要求 SHA-1/SHA-256，数据库与接口也不保存或暴露摘要。
- group/parent 必须匹配服务端全局 KDocs 设置。
- 重复文件返回 409；不存在的删除/下载记录返回 404；KDocs 换链失败返回 503。
- 入库前换链并探测，避免发布不可访问文件。

## 前端设计

- Dashboard 新增独立 `mods` Tab，渲染 `SkinforgeModManager`。
- 页面顶部提供 JSON 选择/导入区域。
- 提供“全部 / 地图 / 皮肤 / 饰品”子标签；切换分类后重置到第 1 页。
- 表格展示分类中文标签、文件名、格式化文件大小、导入时间和删除操作。
- 删除前二次确认；成功后刷新当前页，若删除最后一条导致页码越界则回退一页。
- loading、空列表、导入中和删除中状态均明确禁用重复操作。

## 兼容性与运维

- 现有 release/hash 表和接口不变。
- 继续使用同一份加密 KDocs Cookie 和目录设置，不新增秘密配置。
- 临时 URL 不入库、不记录日志、不经 Nginx 大文件代理。
- 回滚代码不会删除新表；旧版本可忽略该表。需要彻底回滚时人工备份后删表。

## 测试重点

- 清单三类成功路径及非法 schema/product/category/ID/size。
- 重复 file_id/link_id 冲突。
- 分页边界、分类筛选、稳定排序和公开字段白名单。
- 删除成功/不存在、下载成功/不存在/换链失败。
- 前端 JSON 类型守卫、分类切换、分页和删除交互。
- 数据库三处 schema 一致，现有 SkinForge 行为不回归。
