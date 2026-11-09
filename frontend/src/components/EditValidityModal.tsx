import { useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
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
import ResponsiveModal from './ui/ResponsiveModal';

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

  const submitDuration = usingCustomDuration
    ? getValidCustomCdkDuration(customDuration)
    : validDuration;
  const submitUnit: ValidUnit = usingCustomDuration ? customUnit : validUnit;

  const previewExpiresAt = useMemo(() => {
    if (!cdk || cdk.status !== 'activated' || !cdk.expires_at || !submitDuration) return null;
    return addDurationToDate(cdk.expires_at, submitDuration, submitUnit);
  }, [cdk, submitDuration, submitUnit]);

  const isUnused = cdk?.status === 'unused';

  const handleDurationSelect = (duration: number, unit: ValidUnit) => {
    setUsingCustomDuration(false);
    setValidDuration(duration);
    setValidUnit(unit);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cdk) return;
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
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
          ? err.response.data.error
          : '保存失败';
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal
      open={Boolean(cdk)}
      onClose={onClose}
      title={isUnused ? '修改未激活 CDK 有效期' : '延长已激活 CDK 过期时间'}
      description={
        isUnused
          ? '调整该激活码首次激活后可使用的授权时长'
          : '在当前过期时间基础上顺延授权时长'
      }
      size="lg"
    >
      {cdk && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs sm:text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-1">目标 CDK 码</p>
              <code className="break-all font-mono text-blue-300">{cdk.code}</code>
            </div>

            {cdk.status === 'activated' && cdk.expires_at ? (
              <div>
                <p className="text-xs text-slate-500 mb-1">当前过期时间</p>
                <p className="font-medium text-slate-200 tabular-nums">
                  {formatDate(cdk.expires_at)}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-500 mb-1">当前设定有效期</p>
                <p className="font-medium text-slate-200 tabular-nums">
                  {cdk.valid_duration} {cdk.valid_unit === 'hours' ? '小时' : '天'}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
              {isUnused ? '选择新有效期' : '选择延长时长'}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CDK_DURATION_OPTIONS.map((option) => {
                const selected =
                  !usingCustomDuration &&
                  validDuration === option.validDuration &&
                  validUnit === option.validUnit;
                return (
                  <button
                    key={`${option.validDuration}-${option.validUnit}`}
                    type="button"
                    onClick={() => handleDurationSelect(option.validDuration, option.validUnit)}
                    className={`h-10 rounded-xl border text-xs sm:text-sm font-medium transition-all ${
                      selected
                        ? 'border-blue-500/35 bg-blue-500/20 text-blue-300'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUsingCustomDuration(true)}
                className={`h-10 rounded-xl border text-xs sm:text-sm font-medium transition-all ${
                  usingCustomDuration
                    ? 'border-blue-500/35 bg-blue-500/20 text-blue-300'
                    : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                自定义时长
              </button>
            </div>

            {usingCustomDuration && (
              <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="block flex-1 text-xs font-medium text-slate-300">
                    时长数值
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={customDuration}
                      onChange={(e) => setCustomDuration(Number(e.target.value))}
                      placeholder="例如：7"
                      className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#060913]/70 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      required
                    />
                  </label>
                  <div className="text-xs font-medium text-slate-300">
                    单位
                    <div className="mt-1.5 grid grid-cols-2 gap-2 sm:w-40">
                      {(['hours', 'days'] as const).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => setCustomUnit(unit)}
                          className={`h-10 rounded-xl border text-xs sm:text-sm font-medium transition-all ${
                            customUnit === unit
                              ? 'border-blue-500/35 bg-blue-500/20 text-blue-300'
                              : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {unit === 'hours' ? '小时' : '天'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-2.5 text-xs text-blue-300/80">
                  {formatCustomCdkDurationSummary(customDuration, customUnit)}
                </p>
              </div>
            )}
          </div>

          {cdk.status === 'activated' && previewExpiresAt && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3">
              <p className="text-xs text-emerald-300/80 mb-1">延期后新过期时间预览</p>
              <p className="text-sm font-semibold text-emerald-300 tabular-nums">
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

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '确认保存'
              )}
            </button>
          </div>
        </form>
      )}
    </ResponsiveModal>
  );
}
