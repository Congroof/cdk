import { useState } from 'react';
import { X, Loader2, Copy, Check } from 'lucide-react';
import api from '../api';
import { useToast } from './Toast';
import type { ValidUnit } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateModal({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [count, setCount] = useState(1);
  const [validDuration, setValidDuration] = useState(30);
  const [validUnit, setValidUnit] = useState<ValidUnit>('days');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/cdk/generate', {
        count,
        valid_duration: validDuration,
        valid_unit: validUnit,
        remark: remark || null,
      });
      if (res.data.success) {
        setResult(res.data.data.codes);
        onCreated();
      }
    } catch (err: any) {
      toast(err.response?.data?.error || '生成失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    const textToCopy = result.join('\n');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed', err);
          throw new Error('复制失败');
        } finally {
          textArea.remove();
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  const handleClose = () => {
    setResult(null);
    setCount(1);
    setValidDuration(30);
    setValidUnit('days');
    setRemark('');
    setCopied(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold">
            {result ? '生成成功' : '生成 CDK'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  共生成 {result.length} 个 CDK
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span className="text-green-400">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      复制全部
                    </>
                  )}
                </button>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-1.5 max-h-60 overflow-y-auto font-mono text-sm">
                {result.map((code) => (
                  <div key={code} className="text-blue-400">{code}</div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  生成数量
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  有效时长
                </label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    min={1}
                    value={validDuration}
                    onChange={(e) => setValidDuration(Number(e.target.value))}
                    className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    required
                  />
                  <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { setValidUnit('days'); setValidDuration(30); }}
                      className={`px-4 py-2.5 text-sm font-medium transition-all ${
                        validUnit === 'days'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      天
                    </button>
                    <button
                      type="button"
                      onClick={() => { setValidUnit('hours'); setValidDuration(24); }}
                      className={`px-4 py-2.5 text-sm font-medium transition-all ${
                        validUnit === 'hours'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      小时
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  备注（可选）
                </label>
                <input
                  type="text"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="例如：xxx客户专用"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  '生成'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
