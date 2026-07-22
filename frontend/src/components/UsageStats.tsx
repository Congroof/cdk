import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { useToast } from './toastContext';
import type { UsageStatsData, MachineUsageDetail } from '../types';
import OverviewCards from './OverviewCards';
import DailyTrendChart from './DailyTrendChart';
import MachineTable from './MachineTable';
import MachineDetailModal from './MachineDetailModal';

export default function UsageStats() {
  const { toast } = useToast();
  const [data, setData] = useState<UsageStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<MachineUsageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { days };
      if (search) params.search = search;
      const res = await api.get('/cdk/usage-stats', { params });
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [days, search]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const fetchDetail = useCallback(async (machineCode: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get('/cdk/machine-usage', {
        params: { machine_code: machineCode, days },
      });
      if (res.data.success) {
        setDetail(res.data.data);
      }
    } catch {
      toast('获取详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [days, toast]);

  const handleViewDetail = (machineCode: string) => {
    setDetailCode(machineCode);
    setDetail(null);
    fetchDetail(machineCode);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const overview = data?.overview ?? { unique_machines: 0, active_today: 0, total_requests: 0 };

  return (
    <div className="space-y-6">
      <OverviewCards overview={overview} />

      <DailyTrendChart
        data={data?.daily_trend ?? []}
        days={days}
        loading={loading}
        onDaysChange={setDays}
        onRefresh={fetchData}
      />

      <MachineTable
        machines={data?.machines ?? []}
        loading={loading}
        search={search}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearch={handleSearch}
        onViewDetail={handleViewDetail}
      />

      {detailCode && (
        <MachineDetailModal
          machineCode={detailCode}
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetailCode(null)}
        />
      )}
    </div>
  );
}
