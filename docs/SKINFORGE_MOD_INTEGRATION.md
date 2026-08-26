# SkinForge 自定义 MOD 对接文档

本文面向管理后台、客户端和服务端接入方，描述自定义 MOD 的发布、列表、预览图、下载与下架流程。

## 1. 接入概览

- API Base URL：`https://<your-domain>/api`
- 请求与响应格式：`application/json`
- 管理接口：需要管理员 JWT
- 客户端列表与下载地址接口：无需鉴权
- MOD 文件和预览图均保存在云文档中，本服务只保存稳定的文件标识和展示元数据
- MOD 文件下载地址与预览图地址均为临时地址，不应持久化或长期缓存
- 当前只支持 `map`、`skin`、`accessory` 三种分类

### 分类枚举

| 接口值 | 展示名称 |
|---|---|
| `map` | 地图 |
| `skin` | 皮肤 |
| `accessory` | 饰品 |

## 2. 标准响应格式

成功响应：

```json
{
  "success": true,
  "data": {}
}
```

失败响应：

```json
{
  "success": false,
  "error": "错误描述"
}
```

常见状态码：

| 状态码 | 含义 |
|---|---|
| `200` | 请求成功 |
| `400` | 参数、清单或云文档目录校验失败 |
| `401` | 管理接口未携带有效 JWT |
| `404` | MOD 不存在或已下架 |
| `409` | 相同 `fileId + linkId` 的 MOD 已导入 |
| `503` | 云文档临时地址生成失败或超时 |
| `500` | 服务端内部错误 |

## 3. 客户端公开接口（无鉴权）

客户端通常只需对接下面两个接口：先分页获取 MOD 元数据，再使用条目 `id` 获取临时下载地址。

### 3.1 获取 MOD 列表

```http
GET /api/client/skinforge/mods?page=1&page_size=10&category=map
```

#### Query 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | non-negative integer | 否 | `1` | 页码；传 `0` 时按 1 处理 |
| `page_size` | non-negative integer | 否 | `10` | 每页数量；`0` 按 1 处理，大于 50 按 50 处理 |
| `category` | string | 否 | - | `map`、`skin` 或 `accessory`；不传表示全部分类 |

列表固定按 `createdAt DESC, id DESC` 排序。

#### 成功响应

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 42,
        "category": "map",
        "fileName": "summer-map.zip",
        "fileSize": 15728640,
        "previewUrl": "https://...temporary-thumbnail-url...",
        "createdAt": "2026-08-26T10:00:00"
      },
      {
        "id": 41,
        "category": "skin",
        "fileName": "example-skin.fantome",
        "fileSize": 5242880,
        "previewUrl": null,
        "createdAt": "2026-08-26T09:00:00"
      }
    ],
    "total": 2,
    "page": 1,
    "page_size": 10
  }
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer | MOD 的公开稳定 ID，用于请求下载地址 |
| `category` | string | MOD 分类枚举 |
| `fileName` | string | 文件名，同时作为首版展示名称 |
| `fileSize` | integer | 文件大小，单位为字节 |
| `previewUrl` | string \| null | 临时预览图地址；未配置或生成失败时为 `null` |
| `createdAt` | string | 服务端记录的创建时间 |
| `total` | integer | 当前筛选条件下的总条数 |
| `page` | integer | 服务端实际采用的页码 |
| `page_size` | integer | 服务端实际采用的每页数量 |

响应头包含 `Cache-Control: no-store`。`previewUrl` 可能过期，客户端应直接使用本次列表响应中的值；图片加载失败时显示占位图，刷新列表后可重新获取。预览图服务异常不会导致列表失败，受影响条目的 `previewUrl` 会降级为 `null`。

公开列表不会返回 `fileId`、`linkId`、`previewFileId`、文件摘要或 MOD 文件的临时下载地址。

### 3.2 获取 MOD 临时下载地址

```http
GET /api/client/skinforge/mods/{id}/download
```

示例：

```http
GET /api/client/skinforge/mods/42/download
```

成功响应：

```json
{
  "success": true,
  "data": {
    "url": "https://...temporary-oss-url..."
  }
}
```

该接口返回 JSON，不返回 302 跳转，也不代理文件内容。客户端应在用户开始下载时调用接口，并立即使用 `data.url` 下载文件。响应头包含 `Cache-Control: no-store`，不要把临时地址写入数据库或作为永久地址保存。

当 MOD 不存在或已经下架时返回 `404`：

```json
{
  "success": false,
  "error": "MOD 不存在"
}
```

### 3.3 客户端 TypeScript 示例

```ts
type ModCategory = 'map' | 'skin' | 'accessory';

interface ModListItem {
  id: number;
  category: ModCategory;
  fileName: string;
  fileSize: number;
  previewUrl: string | null;
  createdAt: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

const API_BASE = 'https://<your-domain>/api';

export async function getMods(page = 1, category?: ModCategory) {
  const query = new URLSearchParams({
    page: String(page),
    page_size: '10',
  });
  if (category) query.set('category', category);

  const response = await fetch(
    `${API_BASE}/client/skinforge/mods?${query.toString()}`,
    { cache: 'no-store' },
  );
  if (!response.ok) throw new Error(`获取 MOD 列表失败：${response.status}`);

  return response.json() as Promise<ApiEnvelope<{
    items: ModListItem[];
    total: number;
    page: number;
    page_size: number;
  }>>;
}

export async function getModDownloadUrl(id: number) {
  const response = await fetch(
    `${API_BASE}/client/skinforge/mods/${id}/download`,
    { cache: 'no-store' },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? '获取下载地址失败');
  return (body as ApiEnvelope<{ url: string }>).data.url;
}
```

推荐客户端流程：

1. 请求公开列表并展示 `fileName`、格式化后的 `fileSize` 和 `previewUrl`。
2. `previewUrl === null` 或图片加载失败时显示本地占位图。
3. 用户点击下载时，使用 `id` 请求临时下载地址。
4. 收到地址后立即发起下载；失败时重新请求一次下载地址，不复用旧地址。

## 4. 管理接口（JWT）

管理接口必须携带：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

使用前需先在管理后台完成全局 KDocs Cookie、`groupId` 和 `parentId` 配置。MOD 清单中的目录必须与服务端配置一致。

### 4.1 导入一个 MOD

```http
POST /api/skinforge/mods
```

请求体：

```json
{
  "manifest": {
    "schemaVersion": 1,
    "product": "skinforge-mod",
    "category": "map",
    "artifact": {
      "fileId": "123456789",
      "linkId": "LINK_ID",
      "linkUrl": null,
      "fileName": "summer-map.zip",
      "fileSize": 15728640,
      "groupId": "2144952871",
      "parentId": "541664465686",
      "previewFileId": "554861507785"
    }
  }
}
```

清单字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schemaVersion` | integer | 是 | 固定为 `1` |
| `product` | string | 是 | 固定为 `skinforge-mod` |
| `category` | string | 是 | `map`、`skin` 或 `accessory` |
| `artifact.fileId` | string | 是 | 十进制正整数 KDocs 文件 ID |
| `artifact.linkId` | string | 是 | MOD 文件的 KDocs Link ID，非空且不超过 128 个字符 |
| `artifact.linkUrl` | string \| null | 否 | 原始链接元数据；没有时可省略或传 `null`，UTF-8 不超过 65535 字节 |
| `artifact.fileName` | string | 是 | 非空且不超过 255 个字符；扩展名不限制 |
| `artifact.fileSize` | integer | 是 | 文件字节数，范围 `1..=9007199254740991`，保证 JavaScript 可精确表示 |
| `artifact.groupId` | string | 是 | 十进制正整数，必须匹配服务端 KDocs 配置 |
| `artifact.parentId` | string | 是 | 十进制正整数，必须匹配服务端 KDocs 配置 |
| `artifact.previewFileId` | string \| null | 否 | 独立预览图片的十进制正整数 KDocs 文件 ID |

没有预览图时，可以省略 `previewFileId`，也可以传 `null`：

```json
{
  "previewFileId": null
}
```

服务端导入时会：

1. 校验 schema、product、分类及必填字段。
2. 校验清单目录与服务端 KDocs 配置一致。
3. 检查 `fileId + linkId` 是否已经存在。
4. 动态生成 MOD 文件临时地址并探测其可访问性。
5. 保存元数据；不保存真实 MOD、预览图或临时 URL。

`previewFileId` 只校验为正整数，导入时不检查图片是否能生成缩略图。单次导入只支持一个 MOD；JSON 中不需要 `sha1` 或 `sha256`。

导入成功返回新条目的列表字段。因为导入响应不执行缩略图换链，其中 `previewUrl` 为 `null`；刷新管理列表后才会生成预览图地址。

### 4.2 获取管理列表

```http
GET /api/skinforge/mods?page=1&page_size=10&category=skin
Authorization: Bearer <token>
```

分页参数、筛选条件、响应字段及 `Cache-Control: no-store` 行为与公开列表一致。

### 4.3 下架 MOD

```http
DELETE /api/skinforge/mods/{id}
Authorization: Bearer <token>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

下架会硬删除数据库记录，使其立即从管理列表和公开列表消失，但不会删除云文档中的 MOD 文件或预览图。使用原 JSON 可以再次导入，重新导入后会获得新的 `id`。

## 5. 完整调用示例

### 获取公开列表

```bash
curl 'https://<your-domain>/api/client/skinforge/mods?page=1&page_size=10&category=map'
```

### 获取临时下载地址

```bash
curl 'https://<your-domain>/api/client/skinforge/mods/42/download'
```

### 管理员导入

```bash
curl -X POST 'https://<your-domain>/api/skinforge/mods' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  --data-binary @mod-request.json
```

其中 `mod-request.json` 的顶层必须为 `{ "manifest": ... }`。如果管理后台选择的是只包含清单本体的 JSON，前端会自动包装为该请求结构。

### 管理员下架

```bash
curl -X DELETE 'https://<your-domain>/api/skinforge/mods/42' \
  -H 'Authorization: Bearer <token>'
```

## 6. 对接注意事项

1. 公开列表与下载地址接口均无鉴权，可直接由客户端调用。
2. 只有管理列表、导入和下架接口需要管理员 JWT。
3. 不要从 `fileName` 推断 MOD 类型，类型以 `category` 为准。
4. `fileSize` 单位为字节，展示格式由客户端自行转换。
5. `previewUrl` 和下载 `url` 都是临时地址，客户端不得长期缓存。
6. 获取下载地址成功不代表地址永久有效；应在实际下载前即时获取。
7. 列表中的 `id` 是服务端记录 ID，不是 KDocs `fileId`。
8. 删除后旧 `id` 立即失效，再次导入会产生新 `id`。
9. 当前接口不提供自定义名称、描述、版本、摘要或安装逻辑。
10. 服务端只返回下载地址，客户端负责文件下载、进度展示和安装处理。
