interface Props {
  rows?: number;
}

export default function Skeleton({ rows = 5 }: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.025] px-4 py-3.5 animate-pulse"
        >
          <div className="space-y-2 flex-1 min-w-0">
            <div className="h-3.5 w-44 max-w-full rounded-md bg-white/[0.08]" />
            <div className="h-2.5 w-28 max-w-full rounded-md bg-white/[0.05]" />
          </div>
          <div className="h-7 w-20 shrink-0 rounded-lg bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}
