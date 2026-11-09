import type { LucideIcon } from 'lucide-react';

type StatTone = 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet';

interface Props {
  label: string;
  value: number | string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: StatTone;
}

const toneConfig: Record<
  StatTone,
  {
    iconBg: string;
    iconColor: string;
    accentLine: string;
    valueColor: string;
  }
> = {
  blue: {
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    iconColor: 'text-blue-400',
    accentLine: 'from-blue-500/40 via-indigo-500/20 to-transparent',
    valueColor: 'text-white',
  },
  cyan: {
    iconBg: 'bg-cyan-500/10 border-cyan-500/20',
    iconColor: 'text-cyan-400',
    accentLine: 'from-cyan-500/40 via-sky-500/20 to-transparent',
    valueColor: 'text-white',
  },
  emerald: {
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconColor: 'text-emerald-400',
    accentLine: 'from-emerald-500/40 via-teal-500/20 to-transparent',
    valueColor: 'text-emerald-300',
  },
  amber: {
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconColor: 'text-amber-400',
    accentLine: 'from-amber-500/40 via-orange-500/20 to-transparent',
    valueColor: 'text-amber-300',
  },
  rose: {
    iconBg: 'bg-rose-500/10 border-rose-500/20',
    iconColor: 'text-rose-400',
    accentLine: 'from-rose-500/40 via-red-500/20 to-transparent',
    valueColor: 'text-rose-300',
  },
  violet: {
    iconBg: 'bg-violet-500/10 border-violet-500/20',
    iconColor: 'text-violet-400',
    accentLine: 'from-violet-500/40 via-fuchsia-500/20 to-transparent',
    valueColor: 'text-violet-300',
  },
};

export default function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  tone = 'blue',
}: Props) {
  const styles = toneConfig[tone];
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all hover:border-white/[0.12] hover:bg-white/[0.035]">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${styles.accentLine}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-400 tracking-wide">{label}</div>
          <div
            className={`mt-2 text-2xl sm:text-[26px] font-semibold tracking-tight tabular-nums leading-none ${styles.valueColor}`}
          >
            {formattedValue}
          </div>
          {subtitle && (
            <div className="mt-1.5 text-xs text-slate-500 truncate">{subtitle}</div>
          )}
        </div>
        {Icon && (
          <div
            className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border ${styles.iconBg}`}
          >
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${styles.iconColor}`} />
          </div>
        )}
      </div>
    </div>
  );
}
