# 前端与数据统计优化

## Goal

重构前端代码，消除重复、改善可维护性，同时优化数据统计后端接口的性能。核心 CDK 业务逻辑不动。

## Requirements

### A. 代码重复消除

1. 提取 `src/utils/clipboard.ts` — 封装 `copyToClipboard(text: string)` 函数
2. 提取 `src/utils/format.ts` — 封装 `formatDate`, `formatTime`, `formatShortDate`, `formatDuration`
3. 创建 `src/components/CopyButton.tsx` — 可复用复制按钮组件，封装复制状态管理
4. CDKTable 和 UsageStats 中移除重复代码，改为使用公共工具

### B. UsageStats 大组件拆分

将 558 行的 `UsageStats.tsx` 拆分为：
- `UsageStats.tsx` — 主组件，管理状态和数据获取
- `components/OverviewCards.tsx` — 概览统计卡片（独立设备 / 今日活跃 / 总请求数）
- `components/DailyTrendChart.tsx` — 每日趋势面积图
- `components/MachineTable.tsx` — 设备列表表格
- `components/MachineDetailModal.tsx` — 设备使用详情弹窗

### C. 后端统计接口优化

`usage_stats` handler 中 `machine_rows` 查询增加 `LIMIT`（如 100），防止数据量过大时内存溢出。

### D. CDKTable 魔法数字修复

将 `copiedId` 从 `number | null` 改为 `string | null`，使用 `"code:" + code` 或 `"machine:" + machineCode` 格式区分不同的复制目标。

## Acceptance Criteria

* [ ] 无重复的 handleCopy / formatDate 代码
* [ ] UsageStats 拆分为 4+ 个子组件，主组件 < 100 行
* [ ] CDKTable 不再有 `+ 100000` 魔法数字
* [ ] 后端 usage_stats 的 machine_rows 有 LIMIT
* [ ] `npm run build` 通过（零 TS 错误）
* [ ] `cargo build` 通过
* [ ] UI 外观和行为完全不变

## Definition of Done

* lint / typecheck / build 通过
* 前端功能手动验证无回归

## Out of Scope

* CDK 核心业务逻辑（validate, activate, generate, disable handlers）
* 认证系统
* 新增功能
* 自动化测试
* 后端 CDK list/export 等查询接口
* Error Boundary（留到后续任务）

## Technical Approach

1. **先提取工具** — 创建 utils/ 和 CopyButton，不改变行为
2. **再拆组件** — UsageStats 拆分，每个子组件接收 props
3. **改 CDKTable** — copiedId 类型重构
4. **最后改后端** — usage_stats 加 LIMIT

## Technical Notes

* 文件: `frontend/src/components/CDKTable.tsx` (290行)
* 文件: `frontend/src/components/UsageStats.tsx` (558行)
* 文件: `backend/src/handlers/cdk.rs` (usage_stats 函数, line 11-122)
* 后端 machine_rows 查询在第 57-82 行，两个分支都无 LIMIT
