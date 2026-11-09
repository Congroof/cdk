import { useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { useToast } from './toastContext';
import type { Cdk } from '../types';
import ResponsiveModal from './ui/ResponsiveModal';
import Select from './ui/Select';

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
        unused: '未使用',
        activated: '已激活',
        expired: '已过期',
        disabled: '已禁用',
      };
      const unitMap: Record<string, string> = { days: '天', hours: '小时' };

      const items: Cdk[] = res.data.data.items;
      if (items.length === 0) {
        toast('没有符合条件的数据', 'info');
        return;
      }

      const formatDate = (d: string | null) => {
        if (!d) return '';
        return new Date(d + 'Z').toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      };

      const rows = items.map((item) => ({
        'CDK 码': item.code,
        '状态': statusMap[item.status] || item.status,
        '有效时长': `${item.valid_duration} ${unitMap[item.valid_unit] || item.valid_unit}`,
        '机器码': item.machine_code || '',
        '备注': item.remark || '',
        '创建时间': formatDate(item.created_at),
        '激活时间': formatDate(item.activated_at),
        '过期时间': formatDate(item.expires_at),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CDK');
      ws['!cols'] = [
        { wch: 30 },
        { wch: 8 },
        { wch: 12 },
        { wch: 40 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
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

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="导出 CDK 数据"
      description="按状态筛选并生成标准 Excel (.xlsx) 报表文件"
      size="sm"
    >
      <div className="space-y-5">
        <div>
          <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
            导出状态范围
          </label>
          <Select
            value={status}
            options={statusOptions}
            onChange={setStatus}
          />
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              正在生成 Excel...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              立即导出 Excel
            </>
          )}
        </button>
      </div>
    </ResponsiveModal>
  );
}
