# CDK Server API 文档

## 概览

CDK Server 提供 CDK（激活码）的生成、查询、激活、验证和管理功能。

- **Base URL**: `http://<host>/api`
- **Content-Type**: `application/json`
- **认证方式**: JWT Bearer Token（部分接口需要）

## 通用响应格式

**成功**：

```json
{
  "success": true,
  "data": { ... }
}
```

**失败**：

```json
{
  "success": false,
  "error": "错误描述"
}
```

| HTTP 状态码 | 含义 |
|---|---|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 无效 |
| 404 | 资源不存在 |
| 409 | 冲突（如 CDK 已绑定其他机器） |
| 500 | 内部服务器错误 |

---

## 认证

受保护的接口需要在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

Token 有效期为 **24 小时**，通过登录接口获取。

---

## 接口列表

| # | 方法 | 路径 | 认证 | 说明 |
|---|------|------|------|------|
| 1 | POST | `/api/auth/login` | 否 | 用户登录 |
| 2 | POST | `/api/cdk/generate` | 是 | 批量生成 CDK |
| 3 | GET | `/api/cdk/list` | 是 | 分页查询 CDK 列表 |
| 4 | GET | `/api/cdk/stats` | 是 | CDK 统计概览 |
| 5 | GET | `/api/cdk/export` | 是 | 导出 CDK 数据（最大 10000 条） |
| 6 | POST | `/api/cdk/validate` | 是 | 验证 CDK（管理端） |
| 7 | POST | `/api/cdk/activate` | 是 | 激活 CDK（管理端） |
| 8 | POST | `/api/cdk/disable` | 是 | 禁用 CDK |
| 9 | POST | `/api/cdk/update-validity` | 是 | 修改未使用 CDK 有效期 / 延长已激活 CDK 过期时间 |
| 10 | POST | `/api/client/validate` | 否 | 验证 CDK（客户端） |
| 11 | POST | `/api/client/activate` | 否 | 激活 CDK（客户端） |
| 12 | POST | `/api/client/feedback` | 否 | 提交用户反馈 |
| 13 | POST | `/api/client/u/{username}/feedback` | 否 | 提交指定用户归属的用户反馈 |
| 14 | GET | `/api/feedback/list` | 是 | 分页查询用户反馈 |
| 15 | POST | `/api/feedback/set-done` | 是 | 标记反馈是否已完成 |

> `/api/client/*` 和 `/api/cdk/validate|activate` 使用相同的处理逻辑，区别仅在于是否需要 JWT 认证。

---

## 1. 用户登录

### `POST /api/auth/login`

用户登录，获取 JWT Token。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

**调用示例**：

```bash
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**错误响应**：

```json
{
  "success": false,
  "error": "用户名或密码错误"
}
```

---

## 2. 批量生成 CDK

### `POST /api/cdk/generate`

批量生成 CDK 激活码。每个 CDK 格式为 5 组 5 位随机字符，如 `A1B2C-D3E4F-G5H6I-J7K8L-M9N0P`。

**请求头**：`Authorization: Bearer <token>`

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| count | number | 是 | 生成数量，范围 1-100 |
| valid_duration | number | 是 | 有效时长，必须大于 0 |
| valid_unit | string | 否 | 时长单位：`"days"`（默认）或 `"hours"` |
| remark | string | 否 | 备注信息 |

**调用示例**：

```bash
curl -X POST http://localhost/api/cdk/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{
    "count": 5,
    "valid_duration": 30,
    "valid_unit": "days",
    "remark": "测试批次"
  }'
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "codes": [
      "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
      "Q1R2S-T3U4V-W5X6Y-Z7A8B-C9D0E"
    ],
    "count": 5
  }
}
```

**错误响应**：

```json
{ "success": false, "error": "生成数量必须在 1-100 之间" }
{ "success": false, "error": "有效时长必须大于 0" }
{ "success": false, "error": "有效时长单位只能是 days 或 hours" }
```

---

## 3. 分页查询 CDK 列表

### `GET /api/cdk/list`

分页查询 CDK 列表，支持按状态过滤和关键词搜索。

**请求头**：`Authorization: Bearer <token>`

**Query 参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1，最小值 1 |
| page_size | number | 否 | 每页条数，默认 10，最大 50 |
| status | string | 否 | 状态过滤：`unused` / `activated` / `expired` / `disabled` |
| search | string | 否 | 搜索关键词（模糊匹配 code、machine_code、remark） |

**调用示例**：

```bash
# 基础查询
curl -X GET "http://localhost/api/cdk/list?page=1&page_size=20" \
  -H "Authorization: Bearer eyJhbGci..."

# 按状态过滤
curl -X GET "http://localhost/api/cdk/list?status=unused&page=1&page_size=10" \
  -H "Authorization: Bearer eyJhbGci..."

# 搜索
curl -X GET "http://localhost/api/cdk/list?search=A1B2C&page=1&page_size=10" \
  -H "Authorization: Bearer eyJhbGci..."
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
        "valid_duration": 30,
        "valid_unit": "days",
        "status": "unused",
        "machine_code": null,
        "remark": "测试批次",
        "created_at": "2026-05-13T12:00:00",
        "activated_at": null,
        "expires_at": null
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

---

## 4. CDK 统计概览

### `GET /api/cdk/stats`

获取各状态 CDK 数量的统计信息。

**请求头**：`Authorization: Bearer <token>`

**请求参数**：无

**调用示例**：

```bash
curl -X GET http://localhost/api/cdk/stats \
  -H "Authorization: Bearer eyJhbGci..."
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "total": 500,
    "unused": 300,
    "activated": 150,
    "expired": 40,
    "disabled": 10
  }
}
```

---

## 5. 导出 CDK 数据

### `GET /api/cdk/export`

导出 CDK 数据，支持按状态和日期范围过滤，单次最多导出 10000 条以防止内存溢出。

**请求头**：`Authorization: Bearer <token>`

**Query 参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 状态过滤：`unused` / `activated` / `expired` / `disabled` |
| date_from | string | 否 | 起始日期（含），格式 `YYYY-MM-DD` |
| date_to | string | 否 | 截止日期（含），格式 `YYYY-MM-DD` |

**调用示例**：

```bash
# 导出所有
curl -X GET "http://localhost/api/cdk/export" \
  -H "Authorization: Bearer eyJhbGci..."

# 按状态和日期导出
curl -X GET "http://localhost/api/cdk/export?status=activated&date_from=2026-05-01&date_to=2026-05-13" \
  -H "Authorization: Bearer eyJhbGci..."
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
        "valid_duration": 30,
        "valid_unit": "days",
        "status": "activated",
        "machine_code": "MACHINE-001",
        "remark": "测试批次",
        "created_at": "2026-05-01T10:00:00",
        "activated_at": "2026-05-02T15:30:00",
        "expires_at": "2026-06-01T15:30:00"
      }
    ]
  }
}
```

---

## 6. 验证 CDK

### `POST /api/cdk/validate`（需认证）
### `POST /api/client/validate`（无需认证）

验证 CDK 是否有效。两个路径的处理逻辑完全相同。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | CDK 激活码 |
| machine_code | string | 否 | 机器码（已激活的 CDK 用于校验绑定关系） |

**调用示例**：

```bash
# 管理端（需 Token）
curl -X POST http://localhost/api/cdk/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{
    "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
    "machine_code": "MACHINE-001"
  }'

# 客户端（无需 Token）
curl -X POST http://localhost/api/client/validate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
    "machine_code": "MACHINE-001"
  }'
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "valid": true,
    "status": "activated",
    "expires_at": "2026-06-01T15:30:00",
    "message": "CDK 有效"
  }
}
```

**验证逻辑**：

| CDK 状态 | 结果 | 说明 |
|----------|------|------|
| `disabled` | `valid: false` | CDK 已被禁用 |
| `unused` | `valid: true` | CDK 未使用，有效 |
| `activated` | 看情况 | 若已过期 → 自动更新为 expired 并返回无效；若提供了 machine_code 且不匹配 → 提示机器码不匹配，但支持换绑；其他情况 → 有效 |
| `expired` | `valid: false` | CDK 已过期 |

---

## 7. 激活 CDK

### `POST /api/cdk/activate`（需认证）
### `POST /api/client/activate`（无需认证）

激活 CDK 并绑定机器码。两个路径的处理逻辑完全相同。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | CDK 激活码 |
| machine_code | string | 是 | 机器码 |

**调用示例**：

```bash
# 管理端
curl -X POST http://localhost/api/cdk/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{
    "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
    "machine_code": "MACHINE-001"
  }'

# 客户端
curl -X POST http://localhost/api/client/activate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
    "machine_code": "MACHINE-001"
  }'
```

**成功响应（首次激活）**：

```json
{
  "success": true,
  "data": {
    "message": "CDK 激活成功",
    "expires_at": "2026-06-13T12:00:00"
  }
}
```

**成功响应（同一机器重复激活）**：

```json
{
  "success": true,
  "data": {
    "message": "CDK 已激活（同一机器）",
    "expires_at": "2026-06-13T12:00:00"
  }
}
```

**激活逻辑**：

| CDK 状态 | 结果 |
|----------|------|
| `unused` | 激活成功，计算过期时间 = 当前时间 + valid_duration（根据 valid_unit 换算） |
| `activated` + 同一机器 | 返回已激活信息（幂等） |
| `activated` + 不同机器 | **换绑成功**：更新机器码为新机器，返回成功信息 |
| `activated` + 已过期 | 自动更新为 expired，返回已过期错误 |
| `expired` | **400**：`"CDK 已过期"` |
| `disabled` | **400**：`"CDK 已被禁用"` |

---

## 8. 禁用 CDK

### `POST /api/cdk/disable`

禁用指定 CDK。

**请求头**：`Authorization: Bearer <token>`

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | CDK 激活码 |

**调用示例**：

```bash
curl -X POST http://localhost/api/cdk/disable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{
    "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P"
  }'
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "message": "CDK 已禁用"
  }
}
```

**错误响应**：

```json
{ "success": false, "error": "CDK 不存在或已被禁用" }
```

---

## 9. 修改 CDK 有效期 / 延长过期时间

### `POST /api/cdk/update-validity`

修改未使用 CDK 的有效期配置，或延长已激活 CDK 的过期时间。仅支持 `unused` 和 `activated` 状态。

**请求头**：`Authorization: Bearer <token>`

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | CDK 激活码 |
| valid_duration | number | unused 时必填 | 新的有效时长，必须大于 0 |
| valid_unit | string | 否 | 时长单位：`"days"`（默认）或 `"hours"`，仅 unused 时使用 |
| extend_duration | number | activated 时必填 | 延长时长，必须大于 0 |
| extend_unit | string | 否 | 延长单位：`"days"`（默认）或 `"hours"`，仅 activated 时使用 |

**业务规则**：

- `unused`：更新 `valid_duration` / `valid_unit`，激活时按新配置计算 `expires_at`
- `activated`：在当前 `expires_at` 基础上延长指定时长
- `expired` / `disabled`：返回 400，不支持修改

**调用示例（修改未使用 CDK 有效期）**：

```bash
curl -X POST http://localhost/api/cdk/update-validity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{
    "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
    "valid_duration": 7,
    "valid_unit": "days"
  }'
```

**成功响应（unused）**：

```json
{
  "success": true,
  "data": {
    "message": "有效期已更新",
    "valid_duration": 7,
    "valid_unit": "days"
  }
}
```

**调用示例（延长已激活 CDK 过期时间）**：

```bash
curl -X POST http://localhost/api/cdk/update-validity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{
    "code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
    "extend_duration": 24,
    "extend_unit": "hours"
  }'
```

**成功响应（activated）**：

```json
{
  "success": true,
  "data": {
    "message": "过期时间已延长",
    "expires_at": "2026-06-14T15:30:00"
  }
}
```

**错误响应**：

```json
{ "success": false, "error": "CDK 不存在" }
{ "success": false, "error": "已过期 CDK 不支持修改过期时间" }
{ "success": false, "error": "已禁用 CDK 不支持修改有效期" }
```

---

## 10. 提交用户反馈

### `POST /api/client/feedback`
### `POST /api/client/u/{username}/feedback`

采集客户端用户反馈。接口无需 JWT 认证，适合在客户端内直接调用。

`/api/client/feedback` 会保存一条不绑定后台用户的反馈记录；`/api/client/u/{username}/feedback` 会把反馈记录绑定到指定用户名对应的用户，便于后续按业务归属处理。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| feedback_type | string | 否 | 反馈类型，默认 `general`，最长 32 字符。建议值：`general` / `bug` / `feature` / `payment` / `activation` |
| content | string | 是 | 反馈内容，不能为空，最长 5000 字符 |
| contact | string | 否 | 联系方式，最长 128 字符 |
| machine_code | string | 否 | 机器码，最长 256 字符 |
| cdk_code | string | 否 | CDK 激活码，最长 64 字符 |
| app_version | string | 否 | 客户端版本，最长 64 字符 |
| platform | string | 否 | 平台信息，最长 64 字符，如 `windows` / `macos` / `linux` |
| metadata | object | 否 | 扩展信息，会以 JSON 字符串保存，序列化后最长 10000 字符 |

**调用示例**：

```bash
curl -X POST http://localhost/api/client/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "feedback_type": "bug",
    "content": "点击激活后没有响应",
    "contact": "user@example.com",
    "machine_code": "MACHINE-001",
    "cdk_code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
    "app_version": "1.2.3",
    "platform": "windows",
    "metadata": {
      "os_version": "Windows 11",
      "locale": "zh-CN"
    }
  }'
```

```bash
curl -X POST http://localhost/api/client/u/admin/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "feedback_type": "feature",
    "content": "希望增加离线激活说明"
  }'
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "id": 1,
    "message": "反馈已提交"
  }
}
```

**错误响应**：

```json
{ "success": false, "error": "反馈内容不能为空" }
{ "success": false, "error": "反馈内容过长" }
{ "success": false, "error": "用户不存在" }
```

---

## 11. 查询用户反馈

### `GET /api/feedback/list`

分页查询用户反馈列表，用于后台反馈处理页。该接口需要 JWT 认证，会返回当前登录用户归属的反馈，以及未绑定用户的通用反馈。

**请求头**：`Authorization: Bearer <token>`

**Query 参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1，最小值 1 |
| page_size | number | 否 | 每页条数，默认 10，最大 50 |
| feedback_type | string | 否 | 反馈类型过滤，如 `general` / `bug` / `feature` / `payment` / `activation` |
| is_done | boolean | 否 | 完成状态过滤：`true` 已完成，`false` 待处理 |
| search | string | 否 | 搜索关键词（模糊匹配 content、contact、machine_code、cdk_code） |

**调用示例**：

```bash
curl -X GET "http://localhost/api/feedback/list?page=1&page_size=10&is_done=false" \
  -H "Authorization: Bearer eyJhbGci..."
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "feedback_type": "bug",
        "content": "点击激活后没有响应",
        "contact": "user@example.com",
        "machine_code": "MACHINE-001",
        "cdk_code": "A1B2C-D3E4F-G5H6I-J7K8L-M9N0P",
        "app_version": "1.2.3",
        "platform": "windows",
        "metadata": {
          "os_version": "Windows 11"
        },
        "created_by": null,
        "is_done": false,
        "done_at": null,
        "created_at": "2026-06-30T15:30:00"
      }
    ],
    "total": 1,
    "pending": 1,
    "done": 0,
    "page": 1,
    "page_size": 10
  }
}
```

---

## 12. 标记反馈完成状态

### `POST /api/feedback/set-done`

标记反馈是否已完成。该接口需要 JWT 认证。

**请求头**：`Authorization: Bearer <token>`

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 反馈记录 ID |
| is_done | boolean | 是 | 是否已完成 |

**调用示例**：

```bash
curl -X POST http://localhost/api/feedback/set-done \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{
    "id": 1,
    "is_done": true
  }'
```

**成功响应**：

```json
{
  "success": true,
  "data": {
    "message": "反馈已标记完成"
  }
}
```

当 `is_done` 为 `false` 时，`message` 为 `"反馈已标记待处理"`。

**错误响应**：

```json
{ "success": false, "error": "反馈记录不存在" }
```

---

## CDK 数据模型

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 自增主键 |
| code | string | CDK 激活码（唯一） |
| valid_duration | number | 有效时长数值 |
| valid_unit | string | 时长单位：`days` 或 `hours` |
| status | string | 状态：`unused` / `activated` / `expired` / `disabled` |
| machine_code | string \| null | 绑定的机器码 |
| remark | string \| null | 备注 |
| created_at | string | 创建时间 |
| activated_at | string \| null | 激活时间 |
| expires_at | string \| null | 过期时间 |

## 用户反馈数据模型

表名：`user_feedback`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 自增主键 |
| feedback_type | string | 反馈类型，默认 `general` |
| content | string | 反馈内容 |
| contact | string \| null | 联系方式 |
| machine_code | string \| null | 机器码 |
| cdk_code | string \| null | CDK 激活码 |
| app_version | string \| null | 客户端版本 |
| platform | string \| null | 平台信息 |
| metadata | object \| null | 扩展信息；库内以 JSON 文本存储，查询接口反序列化为 JSON 对象返回；非法 JSON 时返回 `null` |
| created_by | number \| null | 归属用户 ID；直接调用 `/api/client/feedback` 时为空 |
| is_done | boolean | 是否已完成，默认 `false` |
| done_at | string \| null | 标记完成时间；重新打开后为空 |
| created_at | string | 创建时间 |

## CDK 状态流转

```
unused ──激活──► activated ──到期──► expired
  │                  │
  └──禁用──► disabled ◄──禁用──┘
```

---

## 服务器配置

| 环境变量 | 必填 | 默认值 | 说明 |
|----------|------|--------|------|
| DATABASE_URL | 是 | - | MySQL 连接地址，格式 `mysql://user:pass@host:port/db` |
| JWT_SECRET | 是 | - | JWT 签名密钥 |
| SERVER_ADDR | 否 | `0.0.0.0:3000` | 服务监听地址 |
