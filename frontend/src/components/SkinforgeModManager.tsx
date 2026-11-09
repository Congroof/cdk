import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  FileJson,
  ImageOff,
  PackageOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import api from '../api';
import type {
  SkinforgeMod,
  SkinforgeModCategory,
  SkinforgeModListResponse,
  SkinforgeModManifest,
} from '../types';
import { formatBytes, formatDate } from '../utils/format';
import { useToast } from './toastContext';
import FileDropzone from './ui/FileDropzone';
import ResponsiveModal from './ui/ResponsiveModal';
import Pagination from './ui/Pagination';
import Badge from './ui/Badge';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';

type CategoryFilter = '' | SkinforgeModCategory;

const PAGE_SIZE = 10;
const LINK_ID_MAX_CHARS = 128;
const FILE_NAME_MAX_CHARS = 255;
const LINK_URL_MAX_BYTES = 65_535;
const categoryTabs: { value: CategoryFilter; label: string }[] = [
  { value: '', label: '全部 MOD' },
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

  const handleFileSelect = async (file: File) => {
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

  return (
    <div className="space-y-6">
      {/* Import Card */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-400">
            <FileJson className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">导入自定义 MOD</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              只导入云文档 JSON 元数据，真实文件与预览图仍由云文档直连托管。
            </p>
          </div>
        </div>

        <FileDropzone
          label="选择或拖拽自定义 MOD JSON 清单"
          hint="支持地图 (map)、皮肤 (skin)、饰品 (accessory) 分类清单"
          selectedSummary={
            manifest
              ? `[${categoryLabels[manifest.category]}] ${manifest.artifact.fileName} (${formatBytes(manifest.artifact.fileSize)})`
              : null
          }
          disabled={importing}
          onFileSelect={handleFileSelect}
          onClear={() => setManifest(null)}
        />

        {manifest && (
          <div className="space-y-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
              <InfoItem label="MOD 分类" value={categoryLabels[manifest.category]} />
              <InfoItem label="文件名" value={manifest.artifact.fileName} />
              <InfoItem label="文件大小" value={formatBytes(manifest.artifact.fileSize)} />
              <InfoItem label="预览图 file_id" value={manifest.artifact.previewFileId ?? '未配置'} />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={importMod}
                disabled={importing}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-600 hover:to-fuchsia-700 disabled:opacity-50"
              >
                {importing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageOpen className="h-4 w-4" />
                )}
                {importing ? '正在校验导入...' : '确认导入 MOD'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* MOD List Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {categoryTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setCategory(tab.value);
                  setPage(1);
                }}
                className={`rounded-xl border px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                  category === tab.value
                    ? 'border-violet-500/30 bg-violet-500/15 text-violet-300'
                    : 'border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
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
            className="inline-flex h-9 items-center justify-center gap-1.5 self-end sm:self-auto rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-xs sm:text-sm text-slate-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-violet-400' : ''}`} />
            刷新列表
          </button>
        </div>

        {loading && items.length === 0 ? (
          <Skeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="当前分类下暂无 MOD"
            description="可通过上方上传区域导入云文档 MOD 元数据。"
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#0a0f1d] text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3.5">预览图</th>
                    <th className="px-4 py-3.5">分类</th>
                    <th className="px-4 py-3.5">文件名称</th>
                    <th className="px-4 py-3.5">文件大小</th>
                    <th className="px-4 py-3.5">导入时间</th>
                    <th className="sticky right-0 z-10 bg-[#0a0f1d]/95 px-4 py-3.5 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)]">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {items.map((item) => (
                    <tr key={item.id} className="group transition-colors hover:bg-white/[0.025]">
                      <td className="px-4 py-3">
                        <PreviewImage
                          key={`${item.id}-${item.previewUrl ?? 'none'}`}
                          url={item.previewUrl}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="purple">{categoryLabels[item.category]}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-200 max-w-sm break-all">
                        {item.fileName}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap tabular-nums">
                        {formatBytes(item.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap tabular-nums">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="sticky right-0 z-10 bg-[#080d19]/95 group-hover:bg-[#0d1424]/95 px-4 py-3 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)] transition-colors">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          下架
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="flex items-center justify-between gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5"
                >
                  <PreviewImage
                    key={`${item.id}-${item.previewUrl ?? 'none'}`}
                    url={item.previewUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="purple">{categoryLabels[item.category]}</Badge>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {formatBytes(item.fileSize)}
                      </span>
                    </div>
                    <div className="mt-1.5 truncate text-sm font-medium text-white" title={item.fileName}>
                      {item.fileName}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 tabular-nums">
                      {formatDate(item.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    下架
                  </button>
                </article>
              ))}
            </div>

            <Pagination
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              loading={loading}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      <ResponsiveModal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="确认下架自定义 MOD"
        description="下架操作将从客户端公开列表中移除该记录，但不会删除云文档中的源文件。"
        size="sm"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={deleteMod}
              disabled={deleting}
              className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/15 py-2.5 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
            >
              {deleting ? '正在下架...' : '确认下架'}
            </button>
          </div>
        }
      >
        {deleteTarget && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
            <div className="text-xs text-rose-300/70 mb-1">目标 MOD 文件名</div>
            <div className="break-all text-sm font-medium text-rose-200">
              {deleteTarget.fileName}
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-slate-200 break-all tabular-nums">{value}</div>
    </div>
  );
}

function isModManifest(value: unknown): value is SkinforgeModManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<SkinforgeModManifest>;
  const artifact = manifest.artifact as Partial<SkinforgeModManifest['artifact']> | undefined;
  return (
    manifest.schemaVersion === 1 &&
    manifest.product === 'skinforge-mod' &&
    (manifest.category === 'map' ||
      manifest.category === 'skin' ||
      manifest.category === 'accessory') &&
    !!artifact &&
    typeof artifact.fileId === 'string' &&
    isPositiveIntegerString(artifact.fileId) &&
    typeof artifact.linkId === 'string' &&
    artifact.linkId.trim().length > 0 &&
    [...artifact.linkId.trim()].length <= LINK_ID_MAX_CHARS &&
    (artifact.linkUrl === undefined ||
      artifact.linkUrl === null ||
      (typeof artifact.linkUrl === 'string' &&
        new TextEncoder().encode(artifact.linkUrl).length <= LINK_URL_MAX_BYTES)) &&
    typeof artifact.fileName === 'string' &&
    artifact.fileName.trim().length > 0 &&
    [...artifact.fileName.trim()].length <= FILE_NAME_MAX_CHARS &&
    typeof artifact.fileSize === 'number' &&
    Number.isSafeInteger(artifact.fileSize) &&
    artifact.fileSize > 0 &&
    typeof artifact.groupId === 'string' &&
    isPositiveIntegerString(artifact.groupId) &&
    typeof artifact.parentId === 'string' &&
    isPositiveIntegerString(artifact.parentId) &&
    (artifact.previewFileId === undefined ||
      artifact.previewFileId === null ||
      (typeof artifact.previewFileId === 'string' &&
        isPositiveIntegerString(artifact.previewFileId)))
  );
}

function isPositiveIntegerString(value: string): boolean {
  const normalized = value.trim();
  return (
    /^\+?\d+$/.test(normalized) &&
    BigInt(normalized) > 0n &&
    BigInt(normalized) <= 18_446_744_073_709_551_615n
  );
}

function PreviewImage({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-slate-600">
        <ImageOff className="h-5 w-5" />
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
      className="h-16 w-20 shrink-0 rounded-xl border border-white/[0.08] bg-white/5 object-cover"
    />
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error
    : fallback;
}
