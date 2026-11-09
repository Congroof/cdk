import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'purple' | 'cyan';

interface Props {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, { badge: string; dot: string }> = {
  default: {
    badge: 'bg-white/[0.04] text-slate-300 border-white/10',
    dot: 'bg-slate-400',
  },
  brand: {
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    dot: 'bg-blue-400',
  },
  success: {
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  warning: {
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    dot: 'bg-amber-400',
  },
  danger: {
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    dot: 'bg-rose-400',
  },
  purple: {
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    dot: 'bg-violet-400',
  },
  cyan: {
    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    dot: 'bg-cyan-400',
  },
};

export default function Badge({
  children,
  variant = 'default',
  dot = false,
  className = '',
}: Props) {
  const styles = variantClasses[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 ${styles.badge} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`} />}
      {children}
    </span>
  );
}
