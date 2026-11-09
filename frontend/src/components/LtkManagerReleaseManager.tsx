import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Cpu, RefreshCw, Upload } from 'lucide-react';
import api from '../api';
import type { ApiResponse, LtkManagerManifest, LtkManagerRelease } from '../types';
import { isLtkManagerManifest } from '../utils/ltk-manager';
import { formatBytes, formatDate } from '../utils/format';
import { useToast } from './toastContext';
import FileDropzone from './ui/FileDropzone';
import Switch from './ui/Switch';
import Badge from './ui/Badge';

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
      const response = await api.get<ApiResponse<LtkManagerRelease | null>>(
        '/skinforge/ltk-manager',
      );
      if (response.data.success) setCurrent(response.data.data ?? null);
    } catch {
      toast('外服运行环境信息加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const handleFileSelect = async (file: File) => {
    setConfirmed(false);
    setManifest(null);
    try {
      if (file.size > 64 * 1024) throw new Error('清单文件过大');
      const value: unknown = JSON.parse(await file.text());
      if (!isLtkManagerManifest(value)) {
        throw new Error('运行环境清单格式无效，请使用专用上传脚本生成');
      }
      setManifest(value);
      toast('运行环境 JSON 已读取，请确认兼容性后发布', 'info');
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : '读取清单失败', 'error');
    }
  };

  const publish = async () => {
    if (!manifest || !confirmed || publishing) return;
    setPublishing(true);
    try {
      const response = await api.post<ApiResponse<LtkManagerRelease>>(
        '/skinforge/ltk-manager',
        { manifest },
        { timeout: 70000 },
      );
      if (!response.data.success || !response.data.data) throw new Error('发布失败');
      setCurrent(response.data.data);
      setManifest(null);
      setConfirmed(false);
      toast('外服运行环境已发布', 'success');
    } catch (error: unknown) {
      toast(
        axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : '运行环境发布失败',
        'error',
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-white">外服运行环境 (LTK Manager)</h2>
              <Badge variant={current ? 'success' : 'warning'} dot>
                {current ? `线上 v${current.version}` : '未发布'}
              </Badge>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              独立发布兼容的 LTK Manager。客户端从云文档 OSS 直连下载，使用内置官方公钥验签。
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || publishing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          刷新
        </button>
      </div>

      {current ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">当前版本</div>
            <div className="font-semibold text-white tabular-nums">{current.version}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">文件名称</div>
            <div className="truncate text-slate-200" title={current.fileName}>
              {current.fileName}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">体积 / 发布时间</div>
            <div className="text-slate-300 tabular-nums">
              {formatBytes(current.fileSize)} · {formatDate(current.updatedAt)}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">SHA-256</div>
            <div className="truncate font-mono text-xs text-slate-400" title={current.sha256}>
              {current.sha256}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-xs sm:text-sm text-slate-500">
          {loading ? '正在加载运行环境信息…' : '尚未发布外服运行环境'}
        </div>
      )}

      <FileDropzone
        label="选择或拖拽外服运行环境 JSON 清单"
        hint="请上传由专用上传脚本生成的 ltk-manager 清单文件"
        selectedSummary={
          manifest
            ? `v${manifest.version} · ${manifest.artifact.fileName} (${formatBytes(manifest.artifact.fileSize)})`
            : null
        }
        disabled={publishing}
        onFileSelect={handleFileSelect}
        onClear={() => {
          setManifest(null);
          setConfirmed(false);
        }}
      />

      {manifest && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] p-4">
          <Switch
            checked={confirmed}
            onChange={setConfirmed}
            disabled={publishing}
            label="已验证此版本与当前外服引擎兼容"
            description="确认替换下载版本（不会自动升级已安装的用户）"
          />

          <button
            type="button"
            disabled={!confirmed || publishing}
            onClick={() => void publish()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-40"
          >
            {publishing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {publishing ? '校验并发布中…' : '确认发布'}
          </button>
        </div>
      )}
    </section>
  );
}
