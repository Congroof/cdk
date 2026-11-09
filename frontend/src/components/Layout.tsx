import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  KeyRound,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageSquare,
  Network,
  PackageOpen,
  Plus,
  Settings,
  ShieldBan,
  Sparkles,
} from 'lucide-react';
import type { DashboardTab } from '../types';
import ResponsiveModal from './ui/ResponsiveModal';

interface NavItem {
  key: DashboardTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  group: 'auth' | 'ops' | 'dist';
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'cdk',
    label: 'CDK 管理',
    shortLabel: 'CDK',
    description: '生成、检索、延期与管理全量激活码生命周期',
    icon: KeyRound,
    group: 'auth',
  },
  {
    key: 'multiDevice',
    label: '多设备监控',
    shortLabel: '多设备',
    description: '追踪高频换绑与多机器异常共享激活码',
    icon: Network,
    group: 'auth',
  },
  {
    key: 'banned',
    label: '封禁管理',
    shortLabel: '封禁',
    description: '拦截恶意设备机器码与黑名单策略维护',
    icon: ShieldBan,
    group: 'auth',
  },
  {
    key: 'stats',
    label: '使用统计',
    shortLabel: '统计',
    description: '设备活跃趋势、请求量监控与单机明细分析',
    icon: BarChart3,
    group: 'ops',
  },
  {
    key: 'feedback',
    label: '用户反馈',
    shortLabel: '反馈',
    description: '查看客户端工单反馈、标记进度与管理员回复',
    icon: MessageSquare,
    group: 'ops',
  },
  {
    key: 'announcement',
    label: '公告管理',
    shortLabel: '公告',
    description: '配置客户端启动公告内容、启用开关与实时预览',
    icon: Megaphone,
    group: 'ops',
  },
  {
    key: 'skinforge',
    label: 'SkinForge 发布',
    shortLabel: 'SkinForge',
    description: '管理云文档凭据、客户端版本、外服运行环境与 Hash 字典',
    icon: Settings,
    group: 'dist',
  },
  {
    key: 'mods',
    label: '自定义 MOD',
    shortLabel: 'MOD',
    description: '导入云文档 MOD 元数据、预览图检查与上下架管理',
    icon: PackageOpen,
    group: 'dist',
  },
];

const NAV_GROUPS: { key: NavItem['group']; title: string }[] = [
  { key: 'auth', title: '核心授权' },
  { key: 'ops', title: '运营与数据' },
  { key: 'dist', title: '分发与生态' },
];

const MOBILE_PRIMARY_TABS: DashboardTab[] = ['cdk', 'multiDevice', 'stats', 'feedback'];

interface Props {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onQuickCreateCdk?: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}

export default function Layout({
  activeTab,
  onTabChange,
  onQuickCreateCdk,
  headerActions,
  children,
}: Props) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((item) => item.key === activeTab) ?? NAV_ITEMS[0];
  const isMoreTabActive = !MOBILE_PRIMARY_TABS.includes(activeTab);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  const handleSelectTab = (tab: DashboardTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100">
      {/* Subtle ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/4 h-96 w-96 rounded-full bg-blue-600/[0.06] blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-80 w-80 rounded-full bg-indigo-600/[0.05] blur-3xl" />
      </div>

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col border-r border-white/[0.06] bg-[#080d1a]/90 backdrop-blur-2xl">
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
              <KeyRound className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">CDK 管理系统</div>
              <div className="text-[11px] text-slate-500">SkinForge Admin</div>
            </div>
          </div>
        </div>

        {/* Quick Generate CTA */}
        {onQuickCreateCdk && (
          <div className="px-4 pt-4 pb-2">
            <button
              type="button"
              onClick={onQuickCreateCdk}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-600 hover:to-indigo-700 active:scale-[0.99]"
            >
              <Sparkles className="h-4 w-4" />
              快速生成 CDK
            </button>
          </div>
        )}

        {/* Grouped Navigation */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((item) => item.group === group.key);
            return (
              <div key={group.key}>
                <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = item.key === activeTab;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectTab(item.key)}
                        className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                          active
                            ? 'bg-blue-500/[0.12] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-400" />
                        )}
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
          >
            <span className="flex items-center gap-2.5">
              <LogOut className="h-4 w-4" />
              退出登录
            </span>
            <span className="text-xs text-slate-600">安全退出</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative lg:pl-64">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#060913]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {/* Mobile Brand Icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 lg:hidden">
                <KeyRound className="h-4 w-4 text-white" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-base sm:text-lg font-semibold text-white">
                    {currentNav.label}
                  </h1>
                </div>
                <p className="hidden sm:block truncate text-xs text-slate-400">
                  {currentNav.description}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {headerActions}
              {onQuickCreateCdk && (
                <button
                  type="button"
                  onClick={onQuickCreateCdk}
                  className="inline-flex lg:hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-md shadow-blue-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  生成 CDK
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex lg:hidden items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white"
                title="退出登录"
                aria-label="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <main className="mx-auto max-w-[1600px] px-4 pt-5 pb-24 sm:px-6 lg:px-6 xl:px-8 lg:py-7">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="移动端底部导航"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#080d1a]/95 backdrop-blur-2xl lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 px-2 py-1.5">
          {MOBILE_PRIMARY_TABS.map((tabKey) => {
            const item = NAV_ITEMS.find((n) => n.key === tabKey)!;
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleSelectTab(item.key)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors ${
                  active ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div
                  className={`flex h-7 w-10 items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-blue-500/15' : ''
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[11px] font-medium leading-none">{item.shortLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors ${
              isMoreTabActive || mobileMenuOpen
                ? 'text-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div
              className={`flex h-7 w-10 items-center justify-center rounded-full transition-colors ${
                isMoreTabActive || mobileMenuOpen ? 'bg-blue-500/15' : ''
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium leading-none">
              {isMoreTabActive ? currentNav.shortLabel : '全部模块'}
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Full Module Switcher Sheet */}
      <ResponsiveModal
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="功能导航"
        description="切换管理模块或执行快捷操作"
        size="md"
      >
        <div className="space-y-5">
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((item) => item.group === group.key);
            return (
              <div key={group.key}>
                <div className="mb-2.5 text-xs font-medium text-slate-400">{group.title}</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = item.key === activeTab;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectTab(item.key)}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                          active
                            ? 'border-blue-500/30 bg-blue-500/15 text-white'
                            : 'border-white/[0.07] bg-white/[0.025] text-slate-300 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            active
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-white/[0.05] text-slate-400'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{item.label}</div>
                          <div className="truncate text-[11px] text-slate-500">
                            {item.shortLabel}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="border-t border-white/[0.06] pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 py-2.5 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <LogOut className="h-4 w-4" />
              退出当前账号
            </button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
