import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-3xl',
  '2xl': 'sm:max-w-5xl',
};

export default function ResponsiveModal({
  open,
  onClose,
  title,
  description,
  size = 'lg',
  footer,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="animate-modal-backdrop fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`animate-modal-content relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-[#0b1120] shadow-2xl sm:max-h-[85vh] sm:rounded-2xl sm:border ${sizeClasses[size]}`}
      >
        {/* Mobile sheet drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="h-1 w-9 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="text-base sm:text-lg font-semibold text-slate-100 leading-snug">
              {title}
            </div>
            {description && (
              <div className="mt-1 text-xs sm:text-sm text-slate-400">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="关闭弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="shrink-0 border-t border-white/[0.06] bg-white/[0.015] px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
