# 现有绑定历史能力调研

## 可复用能力

- 后端已有 JWT 保护的 `GET /api/cdk/{cdk_id}/binding-history`，按 `cdk_id + created_by`
  校验租户，并返回汇总、机器列表和分页事件。
- 前端已有 `CdkBindingHistoryModal`，从 `Cdk` 对象读取 ID、CDK 码和当前状态，
  可直接被新的跨 CDK 汇总列表复用。
- Dashboard 采用顶部标签切换功能，新页面适合新增 `multiDevice` 标签，
  不需要新增 React Router 路由。
- `cdk_binding_history` 的成功记录包含旧/新机器、CDK、租户和时间；失败验证只在
  `usage_logs`，不得参与多设备判断。

## 老数据兼容发现

- migration 008 和启动建表只创建 `cdk_binding_history`，没有回填既有已激活 CDK。
- 老 CDK 第一次换绑会生成单条 `A → B` rebind 记录。仅对 `new_machine_code`
  做 distinct 会得到 1，但成功记录已明确证明它使用过 A、B 两台机器。
- 多设备识别和历史机器数量必须使用非空 `old_machine_code` 与 `new_machine_code`
  的并集。
- 每台机器的成功绑定次数仍只能统计其作为 `new_machine_code` 的记录数。
  如果某机器首次出现在 `old_machine_code`，说明存在历史表上线前的绑定，
  精确次数不完整；接口应返回完整性标记，UI 显示“历史记录，次数未知”。

## 查询与边界建议

- 新增租户级分页接口，不扩展 `/api/cdk/list`，避免影响桌面、移动端和导出消费者。
- 汇总查询先按历史表的旧/新机器并集聚合 `machine_count`，再关联 CDK 当前状态和
  独立的历史事件统计，避免连接两个一对多集合造成重复计数。
- 搜索条件覆盖 `cdkeys.code`、`cdkeys.machine_code`，以及同租户历史记录的
  `old_machine_code/new_machine_code`。
- 列表仅返回汇总，不返回机器数组或事件；完整详情继续走现有有界接口。
- 分页默认 20、最大 100；排序为最近成功绑定时间倒序、机器数倒序、CDK ID 倒序。

## 相关规格

- `.trellis/spec/backend/cdk-binding-events.md`
- `.trellis/spec/backend/database-guidelines.md`
- `.trellis/spec/frontend/component-guidelines.md`
- `.trellis/spec/frontend/state-management.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
