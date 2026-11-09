import type { ReactNode } from 'react';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
}

export default function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}: Props) {
  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`group flex items-start gap-3 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onChange(!checked);
        }}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
          checked
            ? 'border-blue-400/30 bg-gradient-to-r from-blue-500 to-indigo-600'
            : 'border-white/10 bg-white/10 group-hover:bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <div className="text-sm font-medium text-slate-200 leading-5">
              {label}
            </div>
          )}
          {description && (
            <div className="mt-0.5 text-xs text-slate-400 leading-relaxed">
              {description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
