import { useRef, useState } from 'react';
import { FileJson, Upload, X } from 'lucide-react';

interface Props {
  label: string;
  hint?: string;
  selectedSummary?: string | null;
  accept?: string;
  disabled?: boolean;
  onFileSelect: (file: File) => void;
  onClear?: () => void;
}

export default function FileDropzone({
  label,
  hint = '支持点击选择或拖拽 .json 清单文件至此',
  selectedSummary,
  accept = '.json,application/json',
  disabled = false,
  onFileSelect,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
        className="hidden"
      />

      {selectedSummary ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/15 text-blue-300">
              <FileJson className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-blue-300/80">已加载清单文件</div>
              <div className="truncate text-sm font-medium text-white">{selectedSummary}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              重新选择
            </button>
            {onClear && (
              <button
                type="button"
                disabled={disabled}
                onClick={onClear}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="清除已选文件"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled) inputRef.current?.click();
          }}
          className={`group flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-4 transition-all ${
            disabled
              ? 'cursor-not-allowed border-white/5 bg-white/[0.01] opacity-50'
              : dragging
                ? 'cursor-pointer border-blue-400/50 bg-blue-500/10'
                : 'cursor-pointer border-white/15 bg-white/[0.02] hover:border-blue-400/35 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 group-hover:border-blue-500/30 group-hover:bg-blue-500/10 group-hover:text-blue-300 transition-colors">
              <FileJson className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-200 group-hover:text-white">
                {label}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 group-hover:border-blue-500/30 group-hover:bg-blue-500/15 group-hover:text-blue-200 transition-colors">
            <Upload className="h-3.5 w-3.5" />
            浏览文件
          </span>
        </div>
      )}
    </div>
  );
}
