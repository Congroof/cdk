export function formatDate(d: string | null): string {
  if (!d) return '-';
  const utcDate = new Date(d + 'Z');
  return utcDate.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(d: string | null): string {
  if (!d) return '-';
  const utcDate = new Date(d + 'Z');
  return utcDate.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parts[1]}/${parts[2]}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}
