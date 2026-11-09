import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  total,
  page,
  pageSize,
  loading = false,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs sm:text-sm">
      <div className="text-slate-400 tabular-nums">
        显示第 <span className="font-medium text-slate-200">{startItem}</span> -{' '}
        <span className="font-medium text-slate-200">{endItem}</span> 条，共{' '}
        <span className="font-medium text-slate-200">{total}</span> 条记录
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>上一页</span>
        </button>

        <div className="flex h-9 items-center rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 font-medium text-slate-300 tabular-nums">
          <span className="text-white">{page}</span>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-slate-400">{totalPages}</span>
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || loading}
          className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:pointer-events-none disabled:opacity-35"
        >
          <span>下一页</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
