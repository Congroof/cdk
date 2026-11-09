# 前端 UI/UX 全面审查与组件库技术选型报告

## 1. 现状架构与技术栈盘点

- **框架与构建**：React 19.2.6 + TypeScript ~6.0 + Vite 8 + TailwindCSS 4.3 + `lucide-react` + `recharts`
- **当前样式规范**：纯手写 Tailwind 原子类，暗黑玻璃拟态风格（`bg-slate-950` 底色、`bg-white/[0.03]` 卡片、`border-white/5` 边框、渐变文字与发光按钮）。
- **页面结构**：
  - `Login.tsx`：居中登录卡片，根据 UA/屏宽分流至 `/` 或 `/mobile`。
  - `Dashboard.tsx`（PC 端）：单页顶栏 + 8 个平铺 Tab（`CDK 管理`、`多设备 CDK`、`使用统计`、`封禁管理`、`用户反馈`、`公告管理`、`SkinForge`、`自定义 MOD`）。
  - `MobileCdk.tsx`（移动端独立路由 `/mobile`）：仅包含“生成 CDK”和“查询 CDK”两个子功能，与 PC 端代码高度重复，且移动端无法管理其他 7 个模块或禁用/延期 CDK。

---

## 2. 审美与易用性深度诊断（UI & UX Review）

### 2.1 导航与信息架构（Information Architecture）
1. **8 个平铺 Tab 拥挤且缺乏层级感**（[Dashboard.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/pages/Dashboard.tsx#L124-L213)）：
   - 8 个业务模块平铺在一个 `flex-wrap` 胶囊条中，窄屏或平板下会折成 2~3 行，视觉重心散乱。
   - 每个 Tab 使用了不同的高饱和渐变色（蓝、琥珀、红、天蓝、紫、青、紫红），缺乏统一的品牌主色秩序，显得杂乱。
   - 模块按业务属性天然可分为三大域：**核心授权（CDK 管理 / 多设备监控 / 封禁管理）**、**运营与数据（使用统计 / 用户反馈 / 公告管理）**、**分发与生态（SkinForge / 自定义 MOD）**，适合采用 **PC 左侧分组导航栏（Sidebar）+ 移动端底部导航/抽屉菜单**。
2. **Tab 状态未同步 URL 参数/路由**：
   - 刷新页面后总是重置回 `CDK 管理` Tab，无法通过 URL 直接分享或定位到某个子面板。

### 2.2 PC 与移动端双端割裂（Dual-Device Experience）
1. **双路由割裂与功能残缺**（[MobileCdk.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/pages/MobileCdk.tsx#L54-L509) vs [Dashboard.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/pages/Dashboard.tsx#L50-L335)）：
   - `/mobile` 只实现了“生成”和“基础查询”，连最常用的**手机端应急禁用 CDK、延长有效期、查看绑定历史、回复用户反馈、封禁机器码、查看今日活跃统计**都无法操作，跳去 PC 端（`/`）又会遇到宽表格横向挤压、搜索框固定宽度（`w-64` / `w-72`）溢出屏幕的问题。
   - `MobileCdk.tsx` 与 `CreateModal.tsx` / `CDKTable.tsx` 存在大量重复状态与请求逻辑。
2. **响应式表格与弹窗欠佳**：
   - 各模块表格（`CDKTable`、`MultiDeviceCdkList`、`BannedMachines`、`FeedbackList`、`MachineTable`、`SkinforgeModManager`）在移动端仅靠 `overflow-x-auto` 横向滚动，操作列在最右侧，手机上需要左右来回拖动才能点击操作按钮。
   - 弹窗在手机端居中悬浮（`max-h-[80vh] mx-4`），不如移动端 Bottom Sheet（底部抽屉）符合单手拇指操作习惯。

### 2.3 视觉细节与审美提升空间（Visual Polish）
1. **缺少字体层级与数字等宽排版**：
   - 未显式配置现代 UI 字体栈与 `tabular-nums`（等宽数字），统计卡片、表格中的数字、日期在对比时不够齐整利落。
   - 渐变色大字（`bg-clip-text text-transparent`）在所有统计卡片上泛滥使用，反而削弱了核心指标的视觉焦点；现代 Linear / Vercel 风格更讲究克制的明暗对比、微妙的顶部高光边框（`border-t border-white/10`）和精致的图标徽章。
2. **列表信息缺失与密度失衡**：
   - [CDKTable.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/CDKTable.tsx#L63-L167)：创建 CDK 时填写的 **`备注 (remark)`** 和 **`创建时间 / 激活时间`** 在 PC 端主表格中竟然完全没有展示！管理员在 PC 端搜索备注找到了 CDK，却在表格里看不到备注内容（反而在 `/mobile` 里有展示）。
   - [FeedbackList.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/FeedbackList.tsx#L250-L318)：表格只有“反馈内容”和“操作”两列，列表项不显示**反馈类型标签、处理状态徽章、提交时间、是否已回复**，管理员必须逐条点开“查看详情”才能知道这条反馈是什么类型、什么时候提的、回没回复过。
3. **原生表单控件与交互粗糙**：
   - [ExportModal.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/ExportModal.tsx#L100-L108) 使用了原生 `<select>` 且 `appearance-none` 后没有下拉箭头图标，暗色模式下系统原生下拉菜单样式突兀。
   - [AnnouncementEditor.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/AnnouncementEditor.tsx#L169-L176) 和 `LtkManagerReleaseManager.tsx` 使用原生 `<input type="checkbox">`，缺少精致的 Switch 开关组件。
   - [SkinforgeManager.tsx](file:///Users/leibuyun/Documents/github.com/cdk-server/frontend/src/components/SkinforgeManager.tsx#L243-L247) 和 `SkinforgeModManager.tsx` 的文件上传只是普通按钮，缺少拖拽上传区（Dropzone）与已选文件卡片预览。
   - 所有弹窗（7 处手写 `fixed inset-0`）均不支持 `ESC` 键关闭、缺少焦点锁定（Focus Trap）与进出场过渡动画，且打开弹窗时背景页面仍可滚动。
   - 表格加载态仅为简单的文字“加载中...”，切换分页或筛选时布局跳动，缺少 Skeleton 骨架屏或平滑加载遮罩。

---

## 3. 是否需要引入组件库？技术选型对比

### 结论：**强烈建议采用「Headless 无头原语（Radix UI） + CVA 原子组件层（shadcn/ui 模式）」或「抽取统一的高定设计系统基础组件库」，不建议引入 Ant Design / MUI 等重型全量组件库。**

| 方案 | 代表技术 | 审美契合度 | 包体积与性能 | 开发与维护成本 | 结论 |
|------|----------|------------|--------------|----------------|------|
| **方案 A（推荐）：shadcn/ui 风格（Radix Primitives + Tailwind 4 自有组件层）** | `@radix-ui/*` (Dialog / Select / Switch / Tabs / Tooltip / DropdownMenu) + `clsx` + `tailwind-merge` | ⭐⭐⭐⭐⭐（完美契合 Linear/Vercel 极简暗黑美学，100% 掌控玻璃拟态细节） | 极小（按需引入无障碍行为原语，无运行时 CSS-in-JS 开销） | 低（统一封装 `Button`, `Modal/Sheet`, `Select`, `Switch`, `Badge`, `ResponsiveDataView`） | **首选方案** |
| **方案 B：零第三方 UI 依赖，纯手写内部基础组件库** | 仅用 React 19 + TailwindCSS 4 封装 `src/components/ui/*` | ⭐⭐⭐⭐⭐（完全可控） | 零新增依赖（严格符合现有 `.trellis/spec/frontend/component-guidelines.md`） | 中（需自行处理 ESC 关闭、锁定滚动、自定义下拉菜单与移动端抽屉动画） | **备选方案（若希望零新增 npm 依赖）** |
| **方案 C：传统重型组件库** | Ant Design 5 / MUI | ⭐⭐（中后台企业风浓重，覆盖暗黑毛玻璃样式需要写大量 hack，且 PC/移动双端同一套组件适配生硬） | 大（增加数百 KB bundle，引入 runtime 样式体系冲突） | 高（与现有 Tailwind 4 样式体系割裂） | **不推荐** |
