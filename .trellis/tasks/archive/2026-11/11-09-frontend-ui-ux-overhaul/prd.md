# 前端界面重构与双端响应式体验升级 (PRD)

## 1. Goal & User Value

以现代高阶暗黑设计语言（对标 Linear / Vercel / Raycast 极简暗黑毛玻璃质感）全面重构 CDK 管理系统前端界面：
1. **组件库体系化**：采用 **shadcn/ui 架构模式**（轻量无头交互原语 + `src/components/ui/*` 原子设计系统 + TailwindCSS 4），彻底消除散落在各业务组件中的重复手写弹窗、原生简陋控件与不一致样式。
2. **PC 与移动端全功能一体化**：将原本割裂的 PC 端（`/`）与功能残缺的移动端（`/mobile`）融合为**同一套全功能自适应管理后台**——PC 端提供专业的左侧分组侧边栏与高密度数据表格，移动端提供符合拇指热区的底部导航栏、底部上滑抽屉（Bottom Sheet）与卡片流列表，让管理员在手机和电脑上均能完整、流畅地操作全部 8 个业务模块。
3. **易用性与信息透出升级**：补齐主列表缺失的关键业务字段（如 PC 端 CDK 列表的「备注」与「创建时间」、反馈列表的「类型/状态/回复标识/时间」），提升日常高频运维效率。

---

## 2. Background & Confirmed Facts

- **技术栈**：React 19.2.6 + TypeScript ~6.0 + Vite 8 + TailwindCSS 4.3 + `lucide-react` + `recharts` + `xlsx`。
- **现有痛点与代码证据**：
  1. **导航拥挤与色彩杂乱**（[`Dashboard.tsx:124-213`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/pages/Dashboard.tsx#L124-L213)）：8 个模块平铺在顶部胶囊条中，使用 7 种不同高饱和渐变色，窄屏折行且缺乏分组层级，刷新页面后丢失当前激活模块状态。
  2. **移动端功能残缺且代码重复**（[`MobileCdk.tsx:54-509`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/pages/MobileCdk.tsx#L54-L509)、[`Login.tsx:22-56`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/pages/Login.tsx#L22-L56)）：`/mobile` 仅支持生成和只读查询 CDK，无法禁用 CDK、无法修改/延长有效期、无法查看绑定详情，也无法访问多设备监控、统计、封禁、反馈、公告、SkinForge、MOD 等模块。
  3. **关键业务信息在列表中缺失**：
     - [`CDKTable.tsx:63-167`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/CDKTable.tsx#L63-L167)：支持按备注搜索，但表格完全未展示 `remark`（备注）与 `created_at`（创建时间）。
     - [`FeedbackList.tsx:250-318`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/FeedbackList.tsx#L250-L318)：表格仅展示单行截断内容与操作按钮，未展示反馈类型（`feedback_type`）、完成状态（`is_done`）、回复状态（`reply`）、联系方式与提交时间（`created_at`）。
  4. **原生表单控件与弹窗交互粗糙**：
     - [`ExportModal.tsx:100-108`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/ExportModal.tsx#L100-L108) 使用原生 `<select>`；[`AnnouncementEditor.tsx:169-176`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/AnnouncementEditor.tsx#L169-L176) 与 [`LtkManagerReleaseManager.tsx:76-79`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/LtkManagerReleaseManager.tsx#L76-L79) 使用原生 checkbox；[`SkinforgeManager.tsx:243-247`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/SkinforgeManager.tsx#L243-L247) 与 [`SkinforgeModManager.tsx:158-162`](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/SkinforgeModManager.tsx#L158-L162) 缺少拖拽文件上传卡片区。
     - 全站 7 处弹窗（`CreateModal`、`ExportModal`、`EditValidityModal`、`CdkBindingHistoryModal`、`MachineDetailModal`、`CDKTable` 禁用确认、`BannedMachines` 封禁/解禁、`FeedbackList` 详情/回复、`SkinforgeModManager` 下架确认）均为手写 `fixed inset-0`，不支持 `ESC` 关闭、未锁定 body 滚动，移动端无 Bottom Sheet 适配。

---

## 3. Confirmed Decisions

- **D1 - 架构与双端融合（选项 A）**：将 PC 端与移动端融合为同一套全功能自适应管理后台。PC 端采用左侧分组侧边栏（Sidebar）+ 顶部状态栏；移动端采用顶部精简栏 + 底部高频导航栏（含“更多”全模块抽屉与快捷生成入口）。保留 `/mobile` 路由兼容（无缝接入统一工作台并支持 `?tab=` URL 参数同步）。
- **D2 - 组件库模式（shadcn/ui 架构模式）**：构建 `src/components/ui/*` 原子设计系统 + TailwindCSS 4，统一封装无头交互原语与高定暗黑组件（`Modal/Sheet`、`Select`、`Switch`、`Button`、`Badge`、`StatCard`、`Skeleton`、`EmptyState`、`Pagination`、`FileDropzone`）。

---

## 4. Requirements

### R1: 建立 `shadcn/ui` 风格原子组件库 (`src/components/ui/*`)
- **R1.1 `ResponsiveModal` (Dialog / Bottom Sheet)**：
  - PC 端（`sm:` 及以上）居中渲染为精致毛玻璃 Dialog；移动端（`< 640px`）自动贴底渲染为可上滑/带顶部拖拽指示条的 Bottom Sheet。
  - 支持按 `ESC` 键关闭、点击遮罩层关闭、打开时自动锁定 `document.body` 滚动、平滑进出场过渡效果。
- **R1.2 `Select` / `SegmentedControl`**：替换原生 `<select>` 与重复的筛选胶囊按钮，提供统一的暗黑高光选中态。
- **R1.3 `Switch`**：替换原生 `<input type="checkbox">`（用于公告启用开关等场景），提供现代拨杆开关体验。
- **R1.4 `FileDropzone`**：用于 SkinForge 发布 JSON、LTK Manager 运行环境 JSON、自定义 MOD JSON 的选择与拖拽上传，支持已选文件摘要卡片与清除重选。
- **R1.5 `StatCard` / `Badge` / `Skeleton` / `EmptyState` / `Pagination`**：
  - 统一全站统计指标卡片（带图标徽章、微光顶边、等宽数字 `tabular-nums`）。
  - 统一列表加载骨架屏（Skeleton）与带图标的空状态（EmptyState）。
  - 统一响应式分页器（支持页码信息、上下页、快速跳转/页数指示）。

### R2: 全局自适应导航与布局外壳 (`Layout.tsx` & `Dashboard.tsx` & `App.tsx`)
- **R2.1 PC 端左侧分组导航栏（Sidebar）**：
  - 划分为三大业务分组：
    1. **核心授权**：`CDK 管理`、`多设备 CDK`、`封禁管理`
    2. **运营与数据**：`使用统计`、`用户反馈`（可显示待处理角标）、`公告管理`
    3. **分发与生态**：`SkinForge`、`自定义 MOD`
  - 底部提供管理员状态与退出登录按钮；顶部栏展示当前模块标题、副标题描述、全局“生成 CDK”快捷入口及刷新状态。
- **R2.2 移动端导航体系**：
  - 顶部精简粘性导航栏（品牌标识 + 当前模块名 + 快捷生成 CDK 按钮）。
  - 底部固定毛玻璃导航栏（Bottom Tab Bar）：放置高频入口（`CDK 管理`、`多设备`、`统计`、`反馈`、`更多模块`），点击“更多模块”弹出底部抽屉可切换至任意 8 个模块或退出登录。
- **R2.3 URL 状态同步与 `/mobile` 兼容**：
  - 当前激活的模块同步至 URL 查询参数（如 `/?tab=cdk`、`/?tab=feedback`），刷新页面保持当前所在模块。
  - 访问 `/mobile` 自动重定向或无缝渲染自适应工作台，保留手机端生成与管理的一站式体验。

### R3: 核心业务模块信息补齐与双端列表/卡片自适应
- **R3.1 登录页 (`Login.tsx`)**：
  - 升级背景动态光晕与精致暗黑登录卡片质感，增加密码明文/密文切换按钮（`Eye` / `EyeOff`），记住密码采用精致复选/开关样式。
- **R3.2 CDK 管理 (`Dashboard.tsx` + `CDKTable.tsx` + `CreateModal.tsx` + `ExportModal.tsx` + `EditValidityModal.tsx` + `CdkBindingHistoryModal.tsx`)**：
  - **补齐列信息**：PC 端表格新增展示 **「备注 (`remark`)」** 与 **「创建时间 (`created_at`) / 过期时间 (`expires_at`)」** 双时间信息。
  - **移动端卡片流**：在手机端将每条 CDK 渲染为结构化卡片，直接展示 CDK 码（一键复制）、状态徽章、有效期、备注、机器码、创建/过期时间，以及底部快捷操作栏（绑定详情、编辑/延长有效期、禁用）。
  - 生成 CDK 成功视图支持单条复制与一键全部复制。
- **R3.3 多设备 CDK (`MultiDeviceCdkList.tsx`)**：
  - PC 端优化表格列对齐与数值徽章对比度；移动端自动切换为多设备风险卡片视图，清晰展示当前机器、历史机器台数、成功绑定次数、换绑次数与“绑定详情”按钮。
- **R3.4 使用统计 (`UsageStats.tsx` + `OverviewCards.tsx` + `DailyTrendChart.tsx` + `MachineTable.tsx` + `MachineDetailModal.tsx`)**：
  - 升级概览卡片与 Recharts 图表配色/Tooltip 质感，图表在移动端自适应高度与坐标轴间距。
  - 设备列表在 PC 端为表格、在移动端为设备活跃卡片，点击详情弹出自适应 `MachineDetailModal`。
- **R3.5 封禁管理 (`BannedMachines.tsx`)**：
  - 统一使用 `CopyButton` 与 `ResponsiveModal`，支持 PC 表格与移动端卡片双视图，一键封禁/解禁。
- **R3.6 用户反馈 (`FeedbackList.tsx`)**：
  - **大幅增强列表可读性**：在列表项中直接展示 **反馈类型徽章（通用/问题/建议/支付/激活）**、**处理状态徽章（待处理/已完成）**、**是否已回复标识**、**联系方式/机器码摘要** 与 **提交时间**，无需逐个点开详情即可快速扫读与筛选。
  - 支持 PC 表格与移动端卡片流双视图。
- **R3.7 公告管理 (`AnnouncementEditor.tsx`)**：
  - 引入 `Switch` 组件控制“对客户端启用”状态，增加实时公告效果预览卡片，直观看到客户端展示效果。
- **R3.8 SkinForge 与自定义 MOD (`SkinforgeManager.tsx` + `LtkManagerReleaseManager.tsx` + `SkinforgeModManager.tsx`)**：
  - 引入 `FileDropzone` 拖拽/选择 JSON 清单组件，结构化展示当前线上版本、待发布清单对比卡片与 Hash 同步状态面板。
  - 自定义 MOD 支持网格/表格自适应展示，优化预览图放大与下架确认弹窗。

---

## 5. Out of Scope

- 不修改后端 Rust (`backend/`) 任何 API 路径、请求参数或响应数据结构。
- 不引入亮色模式（Light Mode），专注于极致打磨暗黑模式（Dark Theme）视觉体验。
- 不改变现有的 JWT Token 本地存储与 Axios 401 拦截器认证机制。

---

## 6. Acceptance Criteria

- [x] **AC1（构建与代码质量）**：`npm run lint`（ESLint）与 `npm run build`（`tsc -b && vite build`）及 `npm run test:ltk-manager` 零错误通过。
- [x] **AC2（原子组件库）**：`src/components/ui/` 下具备统一的 `ResponsiveModal`、`Select`、`Switch`、`FileDropzone`、`StatCard`、`Badge`、`Skeleton`、`EmptyState`、`Pagination` 组件，全站所有弹窗支持 `ESC` 关闭与背景滚动锁定，移动端弹窗以 Bottom Sheet 形态呈现。
- [x] **AC3（双端自适应导航与 URL 同步）**：PC 端展示左侧三分组导航栏，移动端展示顶部栏 + 底部导航栏 + 全模块抽屉；切换模块时 URL `?tab=` 同步更新，刷新页面不丢失当前 Tab；`/mobile` 路由无缝可用。
- [x] **AC4（关键信息补齐）**：PC 端与移动端的 CDK 列表均完整显示「备注」和「创建时间」；用户反馈列表直接显示「反馈类型」、「待处理/已完成状态」、「已回复标识」和「提交时间」。
- [x] **AC5（双端响应式无溢出）**：在 375px（iPhone 竖屏）、768px（iPad）、1440px（PC 桌面）视口下，全部 8 个模块的搜索框、筛选器、数据列表（PC 表格 / 移动卡片流）与操作按钮均无横向截断或布局错位。
