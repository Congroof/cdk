# CDK 多设备使用概览设计

## 1. 架构与范围

```text
Dashboard “多设备 CDK”标签
  -> GET /api/cdk/multi-device-bindings?page=1&page_size=20&search=...
  -> JWT username -> owner_id
  -> cdk_binding_history 旧/新机器并集聚合
  -> 仅返回 machine_count >= 2 的有界汇总列表
  -> 点击“绑定详情”
  -> 复用 GET /api/cdk/{id}/binding-history + CdkBindingHistoryModal
```

不新增数据库表，不读取 `usage_logs`，不改变激活/换绑写入流程。新页面和详情修正都只处理
当前 JWT 租户的成功绑定历史。

## 2. 管理端汇总接口

新增：

```text
GET /api/cdk/multi-device-bindings
  ?page=1
  &page_size=20
  &search=<optional CDK or machine code>
Authorization: Bearer <JWT>
```

响应：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 42,
        "code": "CDK-...",
        "status": "activated",
        "current_machine_code": "HWID-B",
        "machine_count": 2,
        "binding_count": 3,
        "rebind_count": 2,
        "last_bound_at": "2026-07-23T12:00:00"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "page_size": 20
    }
  }
}
```

分页最小 1，默认 20，最大 100。搜索 trim 后为空等同无搜索。列表顺序：
`last_bound_at DESC, machine_count DESC, id DESC`。

## 3. 聚合口径

每个租户/CDK 的历史机器集合：

```sql
SELECT cdk_id, created_by, new_machine_code AS machine_code
FROM cdk_binding_history
UNION ALL
SELECT cdk_id, created_by, old_machine_code AS machine_code
FROM cdk_binding_history
WHERE old_machine_code IS NOT NULL
```

对集合按 `(created_by, cdk_id)` 分组并计算 `COUNT(DISTINCT machine_code)`；只有数量不少于 2
的 CDK 进入列表。绑定总次数继续等于成功历史行数，换绑次数等于 `event_type = 'rebind'`
的行数，最近时间取 `MAX(created_at)`。

搜索匹配当前租户的：

- `cdkeys.code`
- `cdkeys.machine_code`
- `cdk_binding_history.old_machine_code`
- `cdk_binding_history.new_machine_code`

计数查询和数据查询使用相同过滤条件。列表只返回汇总，不携带机器或事件数组。

## 4. 绑定详情兼容修正

现有详情的 `summary.machine_count` 和 `machines` 改为旧/新机器并集。

机器汇总的准确绑定次数仍统计该机器作为 `new_machine_code` 的行数。为识别历史表上线前的数据，
聚合同时记录每台机器首次作为旧机器和新机器出现的事件 ID：

- 首次新机器记录存在且早于首次旧机器记录：`binding_count_complete = true`。
- 首次记录是旧机器，或从未作为新机器出现：`binding_count_complete = false`。

响应的机器项增加：

```json
{
  "machine_code": "HWID-A",
  "binding_count": 0,
  "binding_count_complete": false,
  "first_bound_at": "2026-07-20T10:00:00",
  "last_bound_at": "2026-07-20T10:00:00",
  "is_current": false
}
```

时间字段在兼容聚合后表示历史中的“首次记录/最近记录”。前端：

- 完整时显示“成功绑定 N 次”。
- 不完整时忽略数值并显示“历史记录，次数未知”。
- 列标题同步改为“首次记录/最近记录”，避免把老数据的换绑时间误称为首次绑定时间。

`summary.binding_count` 仍是实际成功历史行数，不对缺失的老激活记录做推测。

## 5. 前端交互

Dashboard 新增 `multiDevice` 标签和独立 `MultiDeviceCdkList` 组件：

- 表格列：CDK、状态、当前机器、历史机器数、成功绑定次数、换绑次数、最近绑定、操作。
- 搜索提交后回到第一页。
- 支持上一页/下一页、手动刷新、加载态、错误 Toast 和空状态。
- 点击“绑定详情”复用 `CdkBindingHistoryModal`。
- 不修改 `MobileCdk`。

## 6. 安全、兼容与性能

- 路由放在现有 protected router 下，handler 必须先由 JWT 解析 `owner_id`。
- 所有历史子查询同时约束 `created_by`，不能只依赖 `cdk_id`。
- 不修改 `/api/cdk/list` 和既有移动端响应。
- `old_machine_code LIKE '%...%'` 无法使用普通 B-Tree 前缀，搜索只在用户主动输入时执行，
  且最终响应分页；本期不引入全文索引或新表。
- 新字段 `binding_count_complete` 由后端明确返回，前端不得自行猜测老数据完整性。

## 7. 验证与回滚

- 单元测试：分页边界、机器完整性判定、A → B 老数据、A → B → A 聚合映射。
- 有 MySQL 时验证租户隔离、搜索旧/新机器、稳定分页和计数一致。
- 前端运行 ESLint、TypeScript/Vite 生产构建。
- 后端运行 fmt、check、test、clippy；全仓 `git diff --check`。
- 回滚时可删除新路由/标签及详情兼容字段，无数据库迁移需要回退。
