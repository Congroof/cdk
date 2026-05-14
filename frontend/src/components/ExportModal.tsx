import { useState } from 'react';
import { X, Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { useToast } from './Toast';
import type { Cdk } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'unused', label: '未使用' },
  { value: 'activated', label: '已激活' },
  { value: 'expired', label: '已过期' },
  { value: 'disabled', label: '已禁用' },
];

export default function ExportModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;

      const res = await api.get('/cdk/export', { params });
      if (!res.data.success) return;

      const statusMap: Record<string, string> = {
        unused: '未使用', activated: '已激活', expired: '已过期', disabled: '已禁用',
      };
      const unitMap: Record<string, string> = { days: '天', hours: '小时' };

      const items: Cdk[] = res.data.data.items;
      if (items.length === 0) {
        toast('没有符合条件的数据', 'info');
        return;
      }

      const rows = items.map((item) => ({
        'CDK 码': item.code,
        '状态': statusMap[item.status] || item.status,
        '有效时长': `${item.valid_duration} ${unitMap[item.valid_unit] || item.valid_unit}`,
        '机器码': item.machine_code || '',
        '备注': item.remark || '',
        '创建时间': item.created_at || '',
        '激活时间': item.activated_at || '',
        '过期时间': item.expires_at || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CDK');
      ws['!cols'] = [
        { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 40 },
        { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      ];

      const dateSuffix = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `CDK_export_${dateSuffix}.xlsx`);
      toast(`成功导出 ${items.length} 条数据`, 'success');
      onClose();
    } catch {
      toast('导出失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold">导出 CDK 数据</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">状态筛选</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                导出 Excel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
