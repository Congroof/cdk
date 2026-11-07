import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { FileJson, RefreshCw } from 'lucide-react';
import api from '../api';
import type { ApiResponse, LtkManagerManifest, LtkManagerRelease } from '../types';
import { isLtkManagerManifest } from '../utils/ltk-manager';
import { useToast } from './toastContext';

export default function LtkManagerReleaseManager() {
  const { toast } = useToast();
  const [current, setCurrent] = useState<LtkManagerRelease | null>(null);
  const [manifest, setManifest] = useState<LtkManagerManifest | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<ApiResponse<LtkManagerRelease | null>>('/skinforge/ltk-manager');
      if (response.data.success) setCurrent(response.data.data ?? null);
    } catch { toast('外服运行环境信息加载失败', 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setConfirmed(false);
    setManifest(null);
    if (!file) return;
    try {
      if (file.size > 64 * 1024) throw new Error('清单文件过大');
      const value: unknown = JSON.parse(await file.text());
      if (!isLtkManagerManifest(value)) throw new Error('运行环境清单格式无效，请使用专用上传脚本生成');
      setManifest(value);
    } catch (error: unknown) { toast(error instanceof Error ? error.message : '读取清单失败', 'error'); }
  };

  const publish = async () => {
    if (!manifest || !confirmed || publishing) return;
    setPublishing(true);
    try {
      const response = await api.post<ApiResponse<LtkManagerRelease>>('/skinforge/ltk-manager', { manifest }, { timeout: 70000 });
      if (!response.data.success || !response.data.data) throw new Error('发布失败');
      setCurrent(response.data.data);
      setManifest(null);
      setConfirmed(false);
      toast('外服运行环境已发布', 'success');
    } catch (error: unknown) {
      toast(axios.isAxiosError(error) && typeof error.response?.data?.error === 'string' ? error.response.data.error : '运行环境发布失败', 'error');
    } finally { setPublishing(false); }
  };

  return (
    <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">外服运行环境</h2>
          <p className="text-sm text-slate-400 mt-1">独立发布兼容的 LTK Manager。客户端从云文档 OSS 直连下载，使用内置官方公钥验签。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || publishing} className="text-sm text-slate-300 disabled:opacity-50 flex items-center gap-1">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>
      {current ? <div className="text-sm text-slate-300 space-y-1 break-all">
        <p>当前版本：{current.version} · {current.fileName} · {(current.fileSize / 1024 / 1024).toFixed(1)} MB</p>
        <p className="text-xs text-slate-500">SHA-256：{current.sha256}</p>
      </div> : <p className="text-sm text-slate-500">{loading ? '正在加载…' : '尚未发布外服运行环境'}</p>}
      <label className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-white/10 rounded-xl cursor-pointer text-slate-300">
        <FileJson className="w-4 h-4" />选择运行环境 JSON
        <input type="file" accept=".json,application/json" disabled={publishing} className="hidden" onChange={choose} />
      </label>
      {manifest && <div className="space-y-3">
        <p className="text-sm text-slate-300 break-all">待发布：{manifest.version} · {manifest.artifact.fileName}</p>
        <label className="flex items-start gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={confirmed} disabled={publishing} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
          已验证此版本与当前外服引擎兼容，确认替换下载版本（不会自动升级已安装的用户）
        </label>
        <button type="button" disabled={!confirmed || publishing} onClick={() => void publish()} className="px-4 py-2 bg-blue-600 text-sm text-white rounded-xl disabled:opacity-50">
          {publishing ? '校验并发布中…' : '确认发布'}
        </button>
      </div>}
    </section>
  );
}
