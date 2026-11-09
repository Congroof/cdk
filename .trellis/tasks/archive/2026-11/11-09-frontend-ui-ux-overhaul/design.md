# 前端界面重构与双端响应式体验升级 — 技术设计 (Design)

## 1. 架构与设计系统边界 (Architecture & Design System)

### 1.1 视觉设计 Token 与全局样式 (`src/index.css`)
- 基于 TailwindCSS 4，在 `src/index.css` 中定义统一的暗黑微光视觉工具类与滚动条、字体排版规则：
  - **背景层次**：底色 `bg-[#060913]` / `bg-slate-950`，一级容器 `bg-slate-900/60`，卡片表面 `bg-white/[0.025]` 配合顶部微光 `shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]` 与 `border border-white/[0.07]`。
  - **主色调秩序**：以 `blue-500` / `indigo-500` 作为全局品牌主色（导航激活态、主按钮），语义色严格克制用于状态表达（`emerald` 激活/正常、`amber` 预警/待处理、`rose/red` 封禁/禁用/危险操作、`violet/cyan` 辅助分类标签）。
  - **排版规范**：全局数值、统计卡片、日期、机器码统一启用 `tabular-nums`，确保表格和卡片数字严丝合缝。

### 1.2 `shadcn/ui` 风格内置组件库 (`src/components/ui/`)
为保持极致的包体积与零外部运行时冲突，在 `src/components/ui/` 下构建符合 `shadcn/ui` 组合式 API 哲学的原子组件：
1. `ResponsiveModal.tsx`：
   - 接收 `open`, `onClose`, `title`, `description`, `maxWidth`, `footer`, `children`。
   - 内部监听 `keydown` (`Escape`) 与 `document.body.style.overflow = 'hidden'`。
   - 响应式布局：移动端 (`max-sm`) 采用 `items-end` 底部抽屉样式 (`rounded-t-2xl border-t`) 并带顶部 36px 胶囊指示条；桌面端 (`sm:`) 采用 `items-center` 居中毛玻璃卡片 (`rounded-2xl border`)。
2. `Switch.tsx`：
   - 无障碍 `role="switch"` + `aria-checked`，带平滑圆点位移动画，支持 `label` 与 `description`。
3. `Select.tsx`：
   - 自定义浮层下拉选择器（点击外部自动关闭、键盘 `ESC` 关闭、选中项高亮勾选图标），彻底替代丑陋的原生 `<select>`。
4. `FileDropzone.tsx`：
   - 支持点击选择与拖拽（`onDragOver` / `onDrop`）JSON 文件，读取后展示已选文件名标签与重新选择入口。
5. `StatCard.tsx`：
   - 统一封装指标名称、数值（`tabular-nums`）、副标题/趋势说明、右上角主题色图标容器与顶部微光装饰线。
6. `Badge.tsx`：
   - 预置 `default | brand | success | warning | danger | purple | cyan` 语义变体，支持可选状态圆点（dot）。
7. `Pagination.tsx`：
   - 响应式分页条：桌面端展示完整条数、页码范围与前后翻页按钮；移动端紧凑展示 `第 X / Y 页` 与大尺寸触控翻页按钮。
8. `Skeleton.tsx` & `EmptyState.tsx`：
   - 提供表格行/移动端卡片的脉冲骨架屏，以及带图标、标题、副标题和操作按钮的空状态组件。

---

## 2. 导航与响应式布局设计 (`Layout.tsx` & `Dashboard.tsx`)

### 2.1 模块元数据定义
统一定义 8 个模块的配置结构（图标、名称、所属分组、描述、简称）：
- **核心授权 (Authorization)**
  - `cdk`：CDK 管理（激活码生成、查询、延期与全生命周期管理）
  - `multiDevice`：多设备监控（高频换绑与多机共享异常检测）
  - `banned`：封禁管理（恶意机器码黑名单拦截与解封）
- **运营与数据 (Operations)**
  - `stats`：使用统计（活跃设备、请求量趋势与单机明细分析）
  - `feedback`：用户反馈（客户端工单处理、状态流转与管理员回复）
  - `announcement`：公告管理（客户端启动公告配置与实时预览）
- **分发与生态 (Distribution)**
  - `skinforge`：SkinForge 发布（云文档配置、客户端安装包、LTK 运行环境与 Hash 同步）
  - `mods`：自定义 MOD（云文档 MOD 元数据导入、分类预览与下架）

### 2.2 PC 端与移动端自适应外壳
- **PC 端 (`lg:flex`)**：
  - 左侧固定宽度 `w-64` 侧边栏，顶部展示品牌 Logo + 系统名称，中部按 3 个分组渲染导航项（选中项带左侧指示条与微光渐变背景），底部展示当前登录态与“退出登录”按钮。
  - 右侧主内容区：顶部 Sticky Header 显示当前模块标题、简介与快捷“生成 CDK”按钮；下方为宽敞的内容容器。
- **移动端 (`< lg`)**：
  - 顶部 Sticky Header：左侧品牌 Logo 与当前模块名称，右侧“生成 CDK”快捷按钮 + “切换模块”菜单按钮。
  - 底部固定导航栏（Bottom Bar，`pb-safe`）：固定展示 4 个最高频模块（`CDK 管理`、`多设备`、`使用统计`、`用户反馈`）+ 第 5 个 `更多` 按钮（点击呼出底部全模块导航抽屉，包含 `封禁管理`、`公告管理`、`SkinForge`、`自定义 MOD` 及 `退出登录`）。
- **URL 同步与路由兼容**：
  - 使用 `useSearchParams` 将 `activeTab` 同步到 `?tab=<key>`。
  - `/mobile` 路由重定向至 `/?tab=cdk`（或支持 `?action=create` 直接打开生成抽屉），实现 100% 路由向下兼容。

---

## 3. 数据流与兼容性说明 (Compatibility & Data Flow)

- **后端 API 零改动**：所有接口调用路径（`/auth/login`、`/cdk/*`、`/banned/*`、`/feedback/*`、`/announcement`、`/skinforge/*`）与请求/响应类型（`src/types/index.ts`）保持 100% 原样。
- **单元测试兼容**：`frontend/scripts/test-ltk-manager.mjs` 依赖 `src/utils/ltk-manager.ts`，工具函数签名与逻辑完全保留。
