import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  ChevronLeft,
  ChevronRight,
  FileJson,
  ImageOff,
  PackageOpen,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import api from '../api';
import type {
  SkinforgeMod,
  SkinforgeModCategory,
  SkinforgeModListResponse,
  SkinforgeModManifest,
} from '../types';
import { formatDate } from '../utils/format';
import { useToast } from './toastContext';

type CategoryFilter = '' | SkinforgeModCategory;

const PAGE_SIZE = 10;
const LINK_ID_MAX_CHARS = 128;
const FILE_NAME_MAX_CHARS = 255;
const LINK_URL_MAX_BYTES = 65_535;
const categoryTabs: { value: CategoryFilter; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'map', label: '地图' },
  { value: 'skin', label: '皮肤' },
  { value: 'accessory', label: '饰品' },
];

const categoryLabels: Record<SkinforgeModCategory, string> = {
  map: '地图',
  skin: '皮肤',
  accessory: '饰品',
};

export default function SkinforgeModManager() {
  const { toast } = useToast();
  const [items, setItems] = useState<SkinforgeMod[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<CategoryFilter>('');
  const [loading, setLoading] = useState(false);
  const [manifest, setManifest] = useState<SkinforgeModManifest | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkinforgeMod | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMods = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (category) params.category = category;
      const response = await api.get('/skinforge/mods', { params });
      if (response.data.success) {
        const data = response.data.data as SkinforgeModListResponse;
        setItems(data.items);
        setTotal(data.total);
      }
    } catch (error: unknown) {
      toast(getErrorMessage(error, 'MOD 列表加载失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [category, page, toast]);

  useEffect(() => {
    void Promise.resolve().then(fetchMods);
  }, [fetchMods]);

  const chooseManifest = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isModManifest(parsed)) {
        throw new Error('MOD JSON 缺少必要字段或分类无效');
      }
      setManifest(parsed);
      toast('MOD JSON 已读取，请确认后导入', 'info');
    } catch (error: unknown) {
      setManifest(null);
      toast(error instanceof Error ? error.message : 'MOD JSON 解析失败', 'error');
    }
  };

  const importMod = async () => {
    if (!manifest) {
      toast('请先选择 MOD JSON', 'error');
      return;
    }
    setImporting(true);
    try {
      const response = await api.post('/skinforge/mods', { manifest }, { timeout: 70_000 });
      if (response.data.success) {
        setManifest(null);
        toast('MOD 已导入', 'success');
        if (category === '' && page === 1) {
          void fetchMods();
        } else {
          setCategory('');
          setPage(1);
        }
      }
    } catch (error: unknown) {
      toast(getErrorMessage(error, 'MOD 导入失败'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const deleteMod = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await api.delete(`/skinforge/mods/${deleteTarget.id}`);
      if (response.data.success) {
        setDeleteTarget(null);
        toast('MOD 已下架', 'success');
        if (items.length === 1 && page > 1) {
          setPage((current) => current - 1);
        } else {
          void fetchMods();
        }
      }
    } catch (error: unknown) {
      toast(getErrorMessage(error, 'MOD 下架失败'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl space-y-6">
      <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5">
          <FileJson className="w-5 h-5 text-violet-400 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-slate-100">导入自定义 MOD</h2>
            <p className="text-sm text-slate-400 mt-1">
              只导入云文档 JSON 元数据，真实文件仍由云文档托管。
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-slate-200 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-xl cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            选择 MOD JSON
            <input type="file" accept="application/json,.json" onChange={chooseManifest} className="hidden" />
          </label>
          <button
            type="button"
            onClick={importMod}
            disabled={!manifest || importing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PackageOpen className="w-4 h-4" />}
            确认导入
          </button>
        </div>

        {manifest && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 text-sm">
            <InfoItem label="分类" value={categoryLabels[manifest.category]} />
            <InfoItem label="文件名" value={manifest.artifact.fileName} />
            <InfoItem label="文件大小" value={formatBytes(manifest.artifact.fileSize)} />
            <InfoItem label="预览图 file_id" value={manifest.artifact.previewFileId ?? '未配置'} />
          </div>
        )}
      </section>

      <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {categoryTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setCategory(tab.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                  category === tab.value
                    ? 'bg-violet-500/10 text-violet-300 border-violet-500/30'
                    : 'text-slate-400 border-white/5 hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void fetchMods()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 border border-white/10 rounded-xl disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <div className="overflow-x-auto border border-white/5 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/5">
                <th className="px-4 py-3 font-medium">预览</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">文件名</th>
                <th className="px-4 py-3 font-medium">文件大小</th>
                <th className="px-4 py-3 font-medium">导入时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">正在加载...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">暂无 MOD</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <PreviewImage key={`${item.id}-${item.previewUrl ?? 'none'}`} url={item.previewUrl} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-1 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-full">
                        {categoryLabels[item.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200 max-w-sm break-all">{item.fileName}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatBytes(item.fileSize)}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        下架
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">共 {total} 条，第 {page}/{totalPages} 页</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1 || loading}
                className="p-2 hover:bg-white/5 border border-white/10 rounded-lg disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages || loading}
                className="p-2 hover:bg-white/5 border border-white/10 rounded-lg disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-100">确认下架 MOD</h3>
            <p className="mt-3 text-sm text-slate-400 break-all">
              将删除数据库记录“{deleteTarget.fileName}”，但不会删除云文档中的源文件。
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-medium border border-white/10 rounded-xl hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={deleteMod}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-xl disabled:opacity-50 transition-colors"
              >
                {deleting ? '正在下架...' : '确认下架'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.025] border border-white/5 rounded-xl px-4 py-3 min-w-0">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-slate-300 break-all">{value}</div>
    </div>
  );
}

function isModManifest(value: unknown): value is SkinforgeModManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<SkinforgeModManifest>;
  const artifact = manifest.artifact as Partial<SkinforgeModManifest['artifact']> | undefined;
  return (
    manifest.schemaVersion === 1
    && manifest.product === 'skinforge-mod'
    && (manifest.category === 'map' || manifest.category === 'skin' || manifest.category === 'accessory')
    && !!artifact
    && typeof artifact.fileId === 'string'
    && isPositiveIntegerString(artifact.fileId)
    && typeof artifact.linkId === 'string'
    && artifact.linkId.trim().length > 0
    && [...artifact.linkId.trim()].length <= LINK_ID_MAX_CHARS
    && (
      artifact.linkUrl === undefined
      || artifact.linkUrl === null
      || (
        typeof artifact.linkUrl === 'string'
        && new TextEncoder().encode(artifact.linkUrl).length <= LINK_URL_MAX_BYTES
      )
    )
    && typeof artifact.fileName === 'string'
    && artifact.fileName.trim().length > 0
    && [...artifact.fileName.trim()].length <= FILE_NAME_MAX_CHARS
    && typeof artifact.fileSize === 'number'
    && Number.isSafeInteger(artifact.fileSize)
    && artifact.fileSize > 0
    && typeof artifact.groupId === 'string'
    && isPositiveIntegerString(artifact.groupId)
    && typeof artifact.parentId === 'string'
    && isPositiveIntegerString(artifact.parentId)
    && (
      artifact.previewFileId === undefined
      || artifact.previewFileId === null
      || (typeof artifact.previewFileId === 'string' && isPositiveIntegerString(artifact.previewFileId))
    )
  );
}

function isPositiveIntegerString(value: string): boolean {
  const normalized = value.trim();
  return /^\+?\d+$/.test(normalized) && BigInt(normalized) > 0n && BigInt(normalized) <= 18_446_744_073_709_551_615n;
}

function PreviewImage({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="w-20 h-16 flex items-center justify-center bg-white/5 border border-white/5 rounded-lg text-slate-600">
        <ImageOff className="w-5 h-5" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt="MOD 预览图"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-20 h-16 object-cover bg-white/5 border border-white/5 rounded-lg"
    />
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(1)} ${unit}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error
    : fallback;
}
