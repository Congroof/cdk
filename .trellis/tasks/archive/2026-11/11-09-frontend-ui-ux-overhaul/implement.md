# 前端界面重构与双端响应式体验升级 — 实施计划 (Implementation Plan)

## 1. 实施步骤清单 (Ordered Implementation Checklist)

### Step 1: 全局样式与 `src/components/ui/*` 原子设计系统搭建
- [ ] 更新 `frontend/src/index.css`：配置暗黑主题滚动条、微光边框工具类、`tabular-nums` 数字排版与动画关键帧。
- [ ] 创建 `frontend/src/components/ui/Badge.tsx`：统一语义化状态徽章与圆点指示器。
- [ ] 创建 `frontend/src/components/ui/StatCard.tsx`：统一高定数据指标卡片。
- [ ] 创建 `frontend/src/components/ui/ResponsiveModal.tsx`：支持 PC Dialog + 移动端 Bottom Sheet、`ESC` 关闭、背景滚动锁定。
- [ ] 创建 `frontend/src/components/ui/Select.tsx`：自定义暗黑下拉选择器组件。
- [ ] 创建 `frontend/src/components/ui/Switch.tsx`：无障碍拨杆开关组件。
- [ ] 创建 `frontend/src/components/ui/FileDropzone.tsx`：支持拖拽与点击上传 JSON 清单的卡片组件。
- [ ] 创建 `frontend/src/components/ui/Pagination.tsx`：双端自适应分页器。
- [ ] 创建 `frontend/src/components/ui/EmptyState.tsx` 与 `Skeleton.tsx`：统一空状态与加载骨架屏。

### Step 2: 全局导航外壳与登录页升级 (`Layout.tsx`, `Dashboard.tsx`, `Login.tsx`, `App.tsx`)
- [ ] 重构 `frontend/src/components/Layout.tsx`：实现 PC 左侧三分组侧边栏 + 顶部状态栏 + 移动端底部高频导航栏与全模块抽屉。
- [ ] 重构 `frontend/src/pages/Dashboard.tsx`：接入 `?tab=` URL 状态同步、升级 CDK 管理顶栏筛选与搜索体验、响应式统计卡片网格。
- [ ] 升级 `frontend/src/pages/Login.tsx`：优化暗黑光晕背景、增加密码显隐切换、统一登录后跳转逻辑。
- [ ] 更新 `frontend/src/App.tsx` 与 `frontend/src/pages/MobileCdk.tsx`：将 `/mobile` 平滑收敛至统一的自适应工作台，消除双份重复维护。

### Step 3: 核心授权模块升级 (`CDKTable`, `CreateModal`, `ExportModal`, `EditValidityModal`, `CdkBindingHistoryModal`, `MultiDeviceCdkList`, `BannedMachines`)
- [ ] 重构 `CDKTable.tsx`：PC 端补齐「备注 (`remark`)」和「创建时间 (`created_at`)」展示；移动端渲染为带完整操作按钮的精致卡片流；禁用确认改用 `ResponsiveModal`。
- [ ] 重构 `CreateModal.tsx`、`ExportModal.tsx`（使用自定义 `Select`）、`EditValidityModal.tsx`、`CdkBindingHistoryModal.tsx`：全部迁移至 `ResponsiveModal`，支持移动端 Bottom Sheet 与 `ESC` 关闭。
- [ ] 重构 `MultiDeviceCdkList.tsx` 与 `BannedMachines.tsx`：支持 PC 表格 + 移动端卡片流双视图，接入 `ResponsiveModal`、`Pagination`、`Skeleton`、`EmptyState`。

### Step 4: 运营数据与分发模块升级 (`UsageStats`, `FeedbackList`, `AnnouncementEditor`, `SkinforgeManager`, `LtkManagerReleaseManager`, `SkinforgeModManager`)
- [ ] 升级 `UsageStats.tsx`、`OverviewCards.tsx`、`DailyTrendChart.tsx`、`MachineTable.tsx`、`MachineDetailModal.tsx`：统一 `StatCard`，设备列表支持移动端卡片视图，详情弹窗迁移至 `ResponsiveModal`。
- [ ] 重构 `FeedbackList.tsx`：列表直接透出「反馈类型」、「状态徽章」、「已回复标识」、「提交时间」与「联系方式/机器码摘要」，支持 PC 表格 + 移动端卡片视图，详情与回复弹窗迁移至 `ResponsiveModal`。
- [ ] 重构 `AnnouncementEditor.tsx`：使用 `Switch` 组件替代原生 checkbox，新增客户端公告实时预览面板。
- [ ] 重构 `SkinforgeManager.tsx`、`LtkManagerReleaseManager.tsx`、`SkinforgeModManager.tsx`：使用 `FileDropzone` 上传 JSON 清单，优化版本与 Hash 状态卡片排版，MOD 列表支持 PC 表格 + 移动端卡片自适应。

### Step 5: 规范更新与质量门禁校验
- [ ] 更新 `.trellis/spec/frontend/` 相关文档以反映新增的 `src/components/ui/` 组件规范。
- [ ] 执行 `npm run lint`、`npm run build`、`npm run test:ltk-manager` 验证零报错。

---

## 2. 验证命令 (Validation Commands)

```bash
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm run test:ltk-manager
```

## 3. 风险点与回滚策略 (Risks & Rollback)

- **风险 1**：移动端底部固定导航栏可能遮挡页面底部的分页器或操作按钮。
  - **缓解**：在 `Layout.tsx` 主内容区设置充足的移动端底部内边距（`pb-24 lg:pb-8`）。
- **风险 2**：React Fast Refresh 规则要求组件文件仅导出 React 组件（`eslint-plugin-react-refresh`）。
  - **缓解**：所有 `src/components/ui/*.tsx` 严格只导出组件，常量或工具函数放在 `src/utils/`。
