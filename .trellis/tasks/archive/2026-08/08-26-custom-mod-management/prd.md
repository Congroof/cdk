# 自定义 MOD 分类管理

## 目标与用户价值

在现有管理后台新增“自定义 MOD”页签，让管理员只导入云文档产出的 JSON 元数据即可发布 MOD，不在本服务存储真实文件；客户端可通过无鉴权接口读取 MOD 列表，并获得按现有 SkinForge 逻辑动态生成的临时 OSS 下载地址。

## 已确认事实

- 现有 SkinForge release 发布流程会保存云文档文件的 `file_id`、`link_id` 和展示元数据，并使用服务端保存的云文档 Cookie 动态换取临时 OSS 下载地址。
- 管理后台已有 SkinForge 页签及 release JSON 导入模式，可复用交互与校验思路。
- 管理端接口位于鉴权路由下，客户端公开接口位于 `/api/client/...`。

## 功能需求

### 管理后台

- 新增“自定义 MOD”Tab。
- Tab 内提供“全部 / 地图 / 皮肤 / 饰品”四个子标签；切换时按分类请求分页数据。
- 管理员通过选择 JSON 文件导入 MOD 元数据，不上传或持久化真实 MOD 文件。
- 每份 JSON 只描述并导入一个 MOD，不支持批量导入。
- 分类由 JSON 的 `category` 字段提供，服务端严格限制为 `map`、`skin`、`accessory`。
- MOD JSON 使用独立清单格式：

```json
{
  "schemaVersion": 1,
  "product": "skinforge-mod",
  "category": "map",
  "artifact": {
    "fileId": "FILE_ID",
    "linkId": "LINK_ID",
    "linkUrl": "LINK_URL",
    "fileName": "example.zip",
    "fileSize": 123456,
    "groupId": "GROUP_ID",
    "parentId": "PARENT_ID",
    "previewFileId": "PREVIEW_FILE_ID"
  }
}
```

- `artifact` 复用现有 release 清单的云文档字段结构；MOD 清单不包含版本、平台、签名和更新说明。
- MOD 可通过 `artifact.previewFileId` 可选配一张预览图；预览图是云文档中的独立文件，拥有单独的文件 ID，不在本服务存储图片内容或临时缩略图 URL。字段缺失或为 `null` 表示无预览图。
- 导入时不调用缩略图接口验证预览图；仅当 `previewFileId` 存在时校验其为正整数，避免可选预览服务异常阻塞 MOD 发布。
- 不限制 MOD 文件扩展名；服务端只要求文件名非空、文件大小大于零，并在入库前动态换链探测源文件可访问。
- 仅允许以下三种固定分类：
  - `map`：地图
  - `skin`：皮肤
  - `accessory`：饰品
- 列表至少展示：分类、文件名、文件大小。
- 首版不提供自定义名称、描述、封面等内容，直接以文件名作为展示名称；这些扩展字段留待后续设计。
- 每条 MOD 提供删除/下架按钮；确认后硬删除数据库记录，但不删除云文档中的源文件，后续可通过原 JSON 重新导入。

### 服务端

- 持久化每个 MOD 的云文档定位信息（至少 `file_id`、`link_id`）以及列表展示所需元数据。
- 以 `file_id + link_id` 组合作为文件唯一标识；每次导入创建独立条目，相同组合重复导入时拒绝并提示已存在，不提供覆盖或版本更新语义。
- 下载地址不落库；请求时沿用现有云文档逻辑动态换取临时 OSS 地址。
- 提供鉴权的管理接口用于导入、查询和删除 MOD。
- 提供无鉴权的公开列表接口，供后续客户端接入；列表只返回 MOD 元数据，不在列表阶段批量换取临时 OSS 地址。
- 公开列表支持可选分类筛选参数 `category=map|skin|accessory`；不传时返回全部。
- 公开列表必须分页，默认按创建时间倒序；具体分页参数与上限沿用项目现有接口风格。
- 公开列表条目返回 MOD `id`，不额外返回固定格式的 `downloadUrl`；客户端使用约定路由和 `id` 请求临时下载地址。
- 列表查询需批量调用云文档缩略图接口，将配置了预览图且成功换取缩略图地址的 MOD 返回 `previewUrl`；没有预览图或单个缩略图生成失败时返回 `null`。
- 缩略图接口整体失败或部分文件出现在 `failed` 中时，列表继续成功返回；受影响条目的 `previewUrl` 为 `null`，管理后台显示占位图，后续刷新重新尝试。
- MOD JSON、数据库和公开接口均不包含 SHA-1/SHA-256；首版不提供下载文件摘要校验。
- 每个 MOD 提供稳定的无鉴权下载地址获取接口；调用时才通过 `file_id + link_id` 动态换取临时 OSS 地址，并返回 `{ "url": "..." }` JSON，由客户端自行下载。
- 删除表示硬删除数据库记录并立即从公开列表下架，不删除云文档中的真实文件。

## 验收标准（草案）

- 管理员可在新 Tab 导入合法 JSON 并看到 MOD 条目。
- 非法 JSON、缺少必要字段或分类不属于三类时，服务端返回明确错误且不写入数据库。
- 管理列表正确展示文件名与格式化文件大小。
- 未登录调用公开列表接口可获得已发布 MOD 的元数据，但响应不包含临时 OSS 地址。
- 未登录调用某个 MOD 的下载地址接口时，服务端即时换取并返回临时 OSS URL。
- 管理员删除条目后，该条目不再出现在管理列表和公开列表中。
- 现有 SkinForge release 与 Hash 功能行为保持不变。

## 接口契约

### 管理接口（JWT）

- `GET /api/skinforge/mods?page=1&page_size=10&category=map`
  - `category` 可省略；分页默认值与上限沿用现有列表接口（默认 10，最大 50）。
  - 返回 `items`、`total`、`page`、`page_size`。
- `POST /api/skinforge/mods`
  - 请求体为 `{ "manifest": <MOD JSON> }`。
  - 入库前校验清单、目录匹配、重复项，并动态换链探测文件。
- `DELETE /api/skinforge/mods/{id}`
  - 硬删除数据库记录，不删除云文档源文件。

### 公开接口（无鉴权）

- `GET /api/client/skinforge/mods?page=1&page_size=10&category=map`
  - 返回分页元数据；条目包含 `id`、`category`、`fileName`、`fileSize`、`previewUrl`、`createdAt`。
  - 不返回 `file_id`、`link_id`、Hash、固定下载接口地址或临时 OSS URL。
- `GET /api/client/skinforge/mods/{id}/download`
  - 请求时动态换链，返回临时 OSS URL；不代理真实文件内容。

## 暂定不在范围内

- 本服务接收或保存真实 MOD 二进制文件。
- 删除云文档/OSS 上的源文件。
- 三类之外的自定义分类管理。
- 客户端 MOD 安装功能。

## 待确认问题
