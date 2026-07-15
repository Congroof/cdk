# 技术设计

## 数据模型

新增 `announcements` 表，每个后台用户最多一条记录：

```text
id BIGINT AUTO_INCREMENT PRIMARY KEY
title VARCHAR(128) NOT NULL
content TEXT NOT NULL
is_enabled BOOLEAN NOT NULL DEFAULT TRUE
created_by BIGINT NOT NULL UNIQUE
created_at DATETIME DEFAULT NOW()
updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
```

沿用项目现有模式，同时更新：

- `backend/src/db.rs` 启动建表
- 新增 `backend/migrations/006_create_announcements.sql`
- `deploy/mysql-init/01_schema.sql`

## 后端边界

新增 `models/announcement.rs` 与 `handlers/announcement.rs`。

### 管理端读取

```text
GET /api/announcement
Authorization: Bearer <token>
```

根据 `Claims.sub` 解析当前用户，只查询 `created_by = current_user_id`。无公告返回：

```json
{"success":true,"data":null}
```

### 管理端保存

```text
POST /api/announcement
Authorization: Bearer <token>
Content-Type: application/json

{"title":"...","content":"...","is_enabled":true}
```

校验纯文本长度后使用 MySQL upsert，以 `created_by` 唯一索引保证每个管理员只有一条公告。返回保存后的完整公告。

### 客户端公开读取

```text
GET /api/client/u/{username}/announcement
```

先解析用户名；用户不存在返回 404。只返回该用户已启用的公告；未创建或已停用返回 `data: null`。公开响应只包含 `title`、`content`、`updated_at`，不暴露 `created_by`。

## 前端

- 新增 `AnnouncementEditor` 组件。
- Dashboard 新增 `announcement` 标签和公告图标。
- 进入标签时加载管理端公告。
- 无公告时显示创建说明；已有公告时显示最后更新时间和修改状态。
- 表单包含标题输入框、正文多行文本框、启用开关、保存按钮和字符计数。
- 复用现有 Axios 实例自动携带 JWT，并使用现有 Toast 反馈成功或失败。

## 兼容与安全

- 公开 GET 路由不挂 JWT 中间件；管理端 GET/POST 路由必须位于 protected Router。
- 前后端均把内容作为纯文本，不使用 `dangerouslySetInnerHTML`。
- 新表为增量创建，不修改现有业务表和数据。
- 客户端接口保持稳定 envelope：`{"success":true,"data":...}`。

## 回滚

- 应用回滚后新增表可保留，不影响旧版本。
- 前端标签和新增路由随应用版本回滚消失；现有 API 不受影响。
