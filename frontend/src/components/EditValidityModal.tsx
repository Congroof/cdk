import { useMemo, useState } from 'react';
import axios from 'axios';
import { X, Loader2 } from 'lucide-react';
import api from '../api';
import { useToast } from './toastContext';
import type { Cdk, ValidUnit } from '../types';
import {
  CDK_DURATION_OPTIONS,
  addDurationToDate,
  formatCustomCdkDurationSummary,
  getDefaultCustomCdkDuration,
  getDefaultCustomCdkUnit,
  getValidCustomCdkDuration,
} from '../utils/cdkOptions';
import { formatDate } from '../utils/format';

interface Props {
  cdk: Cdk | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditValidityModal({ cdk, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [usingCustomDuration, setUsingCustomDuration] = useState(false);
  const [validDuration, setValidDuration] = useState(CDK_DURATION_OPTIONS[2].validDuration);
  const [validUnit, setValidUnit] = useState<ValidUnit>(CDK_DURATION_OPTIONS[2].validUnit);
  const [customDuration, setCustomDuration] = useState(getDefaultCustomCdkDuration);
  const [customUnit, setCustomUnit] = useState<ValidUnit>(getDefaultCustomCdkUnit);
  const [loading, setLoading] = useState(false);

  const submitDuration = usingCustomDuration ? getValidCustomCdkDuration(customDuration) : validDuration;
  const submitUnit: ValidUnit = usingCustomDuration ? customUnit : validUnit;

  const previewExpiresAt = useMemo(() => {
    if (!cdk || cdk.status !== 'activated' || !cdk.expires_at || !submitDuration) return null;
    return addDurationToDate(cdk.expires_at, submitDuration, submitUnit);
  }, [cdk, submitDuration, submitUnit]);

  if (!cdk) return null;

  const isUnused = cdk.status === 'unused';

  const handleDurationSelect = (duration: number, unit: ValidUnit) => {
    setUsingCustomDuration(false);
    setValidDuration(duration);
    setValidUnit(unit);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitDuration) {
      toast('请输入大于 0 的有效时长', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = isUnused
        ? { code: cdk.code, valid_duration: submitDuration, valid_unit: submitUnit }
        : { code: cdk.code, extend_duration: submitDuration, extend_unit: submitUnit };

      const res = await api.post('/cdk/update-validity', payload);
      if (res.data.success) {
        toast(isUnused ? '有效期已更新' : '过期时间已延长', 'success');
        onSaved();
        onClose();
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
        ? err.response.data.error
        : '保存失败';
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold">
            {isUnused ? '修改有效期' : '延长过期时间'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          <div>
            <p className="text-sm text-slate-400 mb-1">CDK 码</p>
            <code className="text-sm text-blue-400 font-mono">{cdk.code}</code>
          </div>

          {cdk.status === 'activated' && cdk.expires_at && (
            <div>
              <p className="text-sm text-slate-400 mb-1">当前过期时间</p>
              <p className="text-sm text-slate-200">{formatDate(cdk.expires_at)}</p>
            </div>
          )}

          {isUnused && (
            <div>
              <p className="text-sm text-slate-400 mb-1">当前有效期</p>
              <p className="text-sm text-slate-200">
                {cdk.valid_duration} {cdk.valid_unit === 'hours' ? '小时' : '天'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              {isUnused ? '新有效期' : '延长时长'}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CDK_DURATION_OPTIONS.map((option) => {
                const selected = !usingCustomDuration && validDuration === option.validDuration && validUnit === option.validUnit;
                return (
                  <button
                    key={`${option.validDuration}-${option.validUnit}`}
                    type="button"
                    onClick={() => handleDurationSelect(option.validDuration, option.validUnit)}
                    className={`py-2.5 text-sm font-medium rounded-xl border transition-all ${
                      selected
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUsingCustomDuration(true)}
                className={`py-2.5 text-sm font-medium rounded-xl border transition-all ${
                  usingCustomDuration
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                自定义时长
              </button>
            </div>
            {usingCustomDuration && (
              <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.07] p-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="block flex-1 text-sm font-medium text-slate-300">
                    时长数值
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={customDuration}
                      onChange={(e) => setCustomDuration(Number(e.target.value))}
                      placeholder="例如：7"
                      className="mt-2 w-full px-3 py-2.5 bg-slate-950/60 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      required
                    />
                  </label>
                  <div className="text-sm font-medium text-slate-300">
                    单位
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:w-40">
                      {(['hours', 'days'] as const).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => setCustomUnit(unit)}
                          className={`px-3 py-2.5 rounded-lg border transition-all ${
                            customUnit === unit
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {unit === 'hours' ? '小时' : '天'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-blue-200/80">
                  {formatCustomCdkDurationSummary(customDuration, customUnit)}
                </p>
              </div>
            )}
          </div>

          {cdk.status === 'activated' && previewExpiresAt && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3">
              <p className="text-xs text-emerald-200/80 mb-1">新过期时间预览</p>
              <p className="text-sm text-emerald-300">
                {previewExpiresAt.toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
