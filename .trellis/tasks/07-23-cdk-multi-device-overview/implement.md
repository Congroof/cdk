# 实施计划

## 阶段 A：后端汇总契约

- [x] 在 CDK models 增加多设备列表查询、汇总行和响应 DTO。
- [x] 增加分页 helper，默认 20、最大 100，并覆盖边界测试。
- [x] 新增 JWT 保护的 `/api/cdk/multi-device-bindings` 路由和 handler。
- [x] 使用旧/新机器并集筛选 `machine_count >= 2`，独立聚合绑定次数、换绑次数和最近时间。
- [x] 搜索覆盖 CDK、当前机器和任意历史旧/新机器，计数与数据查询口径一致。
- [x] 保证所有查询按 `created_by` 隔离，排序稳定且响应有界。

## 阶段 B：现有绑定详情兼容

- [x] 将 `summary.machine_count` 和机器汇总改为旧/新机器并集。
- [x] 为机器项增加 `binding_count_complete`，基于首次旧/新事件顺序判断历史次数是否完整。
- [x] 保持 `summary.binding_count`、`rebind_count` 和事件分页原有语义。
- [x] 增加老数据 A → B、完整 A 激活后换绑及 A → B → A 的映射测试。

## 阶段 C：桌面多设备页面

- [x] 在共享 TS 类型中增加多设备列表 DTO和机器次数完整性字段。
- [x] 新增 `MultiDeviceCdkList`，实现搜索、分页、刷新、加载、错误和空状态。
- [x] 表格展示当前机器和历史机器数量，不展开全部历史机器码。
- [x] 复用 `CdkBindingHistoryModal` 查看完整详情。
- [x] Dashboard 增加“多设备 CDK”标签，保持 `MobileCdk` 不变。
- [x] 详情弹窗对不完整次数显示“历史记录，次数未知”，时间列改为首次/最近记录。

## 阶段 D：文档与验证

- [x] 更新 `API.md` 的新接口、搜索、分页、排序和租户隔离契约。
- [x] 更新 `.trellis/spec/backend/cdk-binding-events.md` 的跨 CDK 汇总与老数据兼容规则。
- [x] 后端运行 `cargo fmt --check`、`cargo check`、`cargo test`、`cargo clippy`。
- [x] 前端运行 `npm run lint`、`npm run build`。
- [x] 运行 `git diff --check`，确认无非本任务改动。

## 风险与回滚点

- 旧/新机器并集查询是本任务核心，任何只统计 `new_machine_code` 的简化都会漏判老 CDK。
- 数据与计数查询必须共享过滤条件；不一致会造成分页总数错误。
- 详情次数完整性只能由事件顺序判断，前端不得从 `binding_count = 0` 自行推导。
- 不新增数据库迁移；若聚合性能不满足生产数据量，先回滚页面，不引入未经验证的缓存表。
