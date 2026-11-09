import { useState } from 'react';
import axios from 'axios';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import api from '../api';
import { useToast } from './toastContext';
import type { ValidUnit } from '../types';
import {
  CDK_DURATION_OPTIONS,
  DEFAULT_CDK_DURATION_OPTION,
  formatCustomCdkDurationSummary,
  getDefaultCustomCdkDuration,
  getDefaultCustomCdkUnit,
  getValidCustomCdkDuration,
} from '../utils/cdkOptions';
import { copyToClipboard } from '../utils/clipboard';
import CopyButton from './CopyButton';
import ResponsiveModal from './ui/ResponsiveModal';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateModal({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [count, setCount] = useState(1);
  const [validDuration, setValidDuration] = useState(DEFAULT_CDK_DURATION_OPTION.validDuration);
  const [validUnit, setValidUnit] = useState<ValidUnit>(DEFAULT_CDK_DURATION_OPTION.validUnit);
  const [usingCustomDuration, setUsingCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState(getDefaultCustomCdkDuration);
  const [customUnit, setCustomUnit] = useState<ValidUnit>(getDefaultCustomCdkUnit);
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitDuration = usingCustomDuration
      ? getValidCustomCdkDuration(customDuration)
      : validDuration;
    const submitUnit: ValidUnit = usingCustomDuration ? customUnit : validUnit;
    if (!submitDuration) {
      toast('请输入大于 0 的有效时长', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/cdk/generate', {
        count,
        valid_duration: submitDuration,
        valid_unit: submitUnit,
        remark: remark.trim() || null,
      });
      if (res.data.success) {
        setResult(res.data.data.codes);
        toast(`已生成 ${res.data.data.codes.length} 个 CDK`, 'success');
        onCreated();
      }
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
          ? err.response.data.error
          : '生成失败';
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = async () => {
    if (!result) return;
    const textToCopy = result.join('\n');
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setCopied(true);
      toast('已复制全部 CDK', 'success');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  const handleClose = () => {
    setResult(null);
    setCount(1);
    setValidDuration(DEFAULT_CDK_DURATION_OPTION.validDuration);
    setValidUnit(DEFAULT_CDK_DURATION_OPTION.validUnit);
    setUsingCustomDuration(false);
    setCustomDuration(getDefaultCustomCdkDuration());
    setCustomUnit(getDefaultCustomCdkUnit());
    setRemark('');
    setCopied(false);
    onClose();
  };

  const handleDurationSelect = (duration: number, unit: ValidUnit) => {
    setUsingCustomDuration(false);
    setValidDuration(duration);
    setValidUnit(unit);
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={handleClose}
      title={result ? 'CDK 生成成功' : '生成 CDK 激活码'}
      description={
        result
          ? `已成功生成 ${result.length} 个激活码，可单条复制或一键复制全部`
          : '配置生成数量、授权时长与客户备注信息'
      }
      size="lg"
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs sm:text-sm text-slate-400">
              共 <span className="font-semibold text-white">{result.length}</span> 个新激活码
            </span>
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/15 px-3.5 py-2 text-xs sm:text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/25"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">已全部复制</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  复制全部
                </>
              )}
            </button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/[0.06] bg-black/30 p-3">
            {result.map((code) => (
              <div
                key={code}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2"
              >
                <code className="min-w-0 break-all font-mono text-xs sm:text-sm text-blue-300 select-all">
                  {code}
                </code>
                <CopyButton text={code} size="md" />
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setResult(null)}
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06]"
            >
              继续生成
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20"
            >
              完成
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
              生成数量 <span className="text-slate-500 font-normal">(1 - 100)</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white tabular-nums transition-all focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              required
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
              有效时长
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
                        ? 'border-blue-500/35 bg-blue-500/20 text-blue-300 shadow-sm'
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
                    ? 'border-blue-500/35 bg-blue-500/20 text-blue-300 shadow-sm'
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
                    时长单位
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

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
              备注信息 <span className="text-slate-500 font-normal">（可选）</span>
            </label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="例如：渠道批次号、客户昵称或用途"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder-slate-500 transition-all focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                立即生成 CDK
              </>
            )}
          </button>
        </form>
      )}
    </ResponsiveModal>
  );
}
