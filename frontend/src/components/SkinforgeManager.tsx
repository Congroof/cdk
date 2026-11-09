import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Cloud,
  Database,
  PackageOpen,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react';
import api from '../api';
import type {
  HashManagementStatus,
  KdocsSettings,
  ReleaseManifest,
  SkinforgeRelease,
} from '../types';
import { formatBytes, formatDate } from '../utils/format';
import { useToast } from './toastContext';
import LtkManagerReleaseManager from './LtkManagerReleaseManager';
import FileDropzone from './ui/FileDropzone';
import Badge from './ui/Badge';
import Skeleton from './ui/Skeleton';

export default function SkinforgeManager() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<KdocsSettings | null>(null);
  const [release, setRelease] = useState<SkinforgeRelease | null>(null);
  const [hashStatus, setHashStatus] = useState<HashManagementStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cookie, setCookie] = useState('');
  const [groupId, setGroupId] = useState('');
  const [parentId, setParentId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [manifest, setManifest] = useState<ReleaseManifest | null>(null);
  const [notes, setNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResponse, releaseResponse, hashResponse] = await Promise.all([
        api.get('/skinforge/kdocs-settings'),
        api.get('/skinforge/release'),
        api.get('/skinforge/hash-status'),
      ]);
      if (settingsResponse.data.success) {
        const value = settingsResponse.data.data as KdocsSettings;
        setSettings(value);
        setGroupId(value.groupId ?? '');
        setParentId(value.parentId ?? '');
      }
      if (releaseResponse.data.success) {
        setRelease((releaseResponse.data.data as SkinforgeRelease | null) ?? null);
      }
      if (hashResponse.data.success) {
        setHashStatus(hashResponse.data.data as HashManagementStatus);
      }
    } catch (error: unknown) {
      toast(getErrorMessage(error, 'SkinForge 配置加载失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cookie.trim() || !groupId.trim() || !parentId.trim()) {
      toast('Cookie、group_id 和 parent_id 都不能为空', 'error');
      return;
    }
    setSavingSettings(true);
    try {
      const response = await api.post('/skinforge/kdocs-settings', {
        cookie: cookie.trim(),
        groupId: groupId.trim(),
        parentId: parentId.trim(),
      });
      if (response.data.success) {
        setSettings(response.data.data as KdocsSettings);
        setCookie('');
        toast('云文档配置已验证并保存', 'success');
      }
    } catch (error: unknown) {
      toast(getErrorMessage(error, '云文档配置保存失败'), 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleManifestFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isReleaseManifest(parsed)) {
        throw new Error('发布 JSON 缺少必要字段');
      }
      setManifest(parsed);
      toast('发布 JSON 已读取，请填写更新说明后确认', 'info');
    } catch (error: unknown) {
      setManifest(null);
      toast(error instanceof Error ? error.message : '发布 JSON 解析失败', 'error');
    }
  };

  const publishRelease = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manifest) {
      toast('请先选择发布 JSON', 'error');
      return;
    }
    if (!notes.trim()) {
      toast('更新说明不能为空', 'error');
      return;
    }
    setPublishing(true);
    try {
      const response = await api.post('/skinforge/release', {
        manifest,
        notes: notes.trim(),
      });
      if (response.data.success) {
        setRelease(response.data.data as SkinforgeRelease);
        setManifest(null);
        setNotes('');
        toast('SkinForge 最新版本已发布', 'success');
      }
    } catch (error: unknown) {
      toast(getErrorMessage(error, '软件发布失败'), 'error');
    } finally {
      setPublishing(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const response = await api.post('/skinforge/hash-sync');
      if (response.data.success) {
        setHashStatus((current) => (current ? { ...current, running: true } : current));
        toast('Hash 同步任务已启动', 'success');
        window.setTimeout(() => void loadData(), 1500);
      }
    } catch (error: unknown) {
      toast(getErrorMessage(error, '启动 Hash 同步失败'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <Skeleton rows={5} />;
  }

  return (
    <div className="space-y-6">
      <LtkManagerReleaseManager />

      {/* Software Release Section */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-400">
              <PackageOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-white">
                  SkinForge 客户端版本发布
                </h2>
                {release && (
                  <Badge variant="purple" dot>
                    当前 v{release.version}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                仅接受严格高于当前版本的 Windows x86_64 安装包清单发布。
              </p>
            </div>
          </div>
        </div>

        {release && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
            <InfoItem label="当前线上版本" value={`v${release.version}`} />
            <InfoItem label="安装包文件名" value={release.fileName} />
            <InfoItem label="文件大小" value={formatBytes(release.fileSize)} />
            <InfoItem
              label="最后发布"
              value={`${release.updatedBy ?? '-'} · ${formatDate(release.updatedAt)}`}
            />
          </div>
        )}

        <FileDropzone
          label="选择或拖拽 SkinForge 发布 JSON 文件"
          hint="请选择由 release:upload 生成的本地 JSON 清单"
          selectedSummary={
            manifest
              ? `v${manifest.version} · ${manifest.artifact.fileName} (${formatBytes(manifest.artifact.fileSize)})`
              : null
          }
          disabled={publishing}
          onFileSelect={handleManifestFile}
          onClear={() => setManifest(null)}
        />

        {manifest && (
          <form onSubmit={publishRelease} className="space-y-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
              <InfoItem label="待发布版本" value={manifest.version} />
              <InfoItem label="目标平台" value={manifest.platform} />
              <InfoItem label="安装包" value={manifest.artifact.fileName} />
              <InfoItem label="SHA-256" value={shortHash(manifest.artifact.sha256)} />
              <InfoItem label="file_id" value={manifest.artifact.fileId} />
              <InfoItem label="link_id" value={manifest.artifact.linkId} />
              <InfoItem label="文件大小" value={formatBytes(manifest.artifact.fileSize)} />
              <InfoItem label="构建时间" value={formatDate(manifest.pubDate)} />
            </div>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="填写本版本更新日志（客户端升级弹窗可见）..."
              disabled={publishing}
              className="w-full rounded-xl border border-white/10 bg-[#060913]/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-y focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60"
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={publishing}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-violet-500/20 disabled:opacity-50"
              >
                {publishing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {publishing ? '校验并发布中...' : '确认发布新版本'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Hash Sync Section */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-white">Hash 字典同步</h2>
                <Badge variant={hashStatus?.current ? 'success' : 'warning'} dot>
                  {hashStatus?.running
                    ? '同步进行中'
                    : hashStatus?.current
                      ? '字典就绪'
                      : '尚无公开版本'}
                </Badge>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                TXT 与 gzip 均上传并校验通过后才会原子切换公开版本。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={syncing || hashStatus?.running}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 text-xs sm:text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncing || hashStatus?.running ? 'animate-spin' : ''}`}
            />
            {hashStatus?.running ? '正在同步...' : '立即同步'}
          </button>
        </div>

        {hashStatus?.current ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
            <InfoItem label="当前公开版本" value={hashStatus.current.version} />
            <InfoItem label="规范 TXT" value={`已发布 · ${formatBytes(hashStatus.current.txtSize)}`} />
            <InfoItem label="Gzip 压缩包" value={`已发布 · ${formatBytes(hashStatus.current.gzipSize)}`} />
            <InfoItem label="发布时间" value={formatDate(hashStatus.current.publishedAt)} />
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-300">
            尚无公开 Hash 版本。
          </div>
        )}

        {hashStatus?.pending && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
            <InfoItem label="待发布候选版本" value={hashStatus.pending.version} />
            <InfoItem
              label="TXT 上传状态"
              value={hashStatus.pending.txtUploaded ? '已完成' : '待上传'}
            />
            <InfoItem
              label="Gzip 上传状态"
              value={hashStatus.pending.gzipUploaded ? '已完成' : '待上传'}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <InfoItem
            label="最近一次同步成功"
            value={hashStatus?.sync.lastSuccessAt ? formatDate(hashStatus.sync.lastSuccessAt) : '-'}
          />
          <InfoItem label="最近候选版本" value={hashStatus?.sync.lastCandidateVersion ?? '-'} />
        </div>

        {hashStatus?.sync.lastError && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-300 whitespace-pre-wrap">
            {hashStatus.sync.lastError}
          </div>
        )}
      </section>

      {/* KDocs Cloud Settings Section */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-white">金山云文档凭据配置</h2>
                <Badge variant={settings?.configured ? 'success' : 'warning'} dot>
                  {settings?.configured ? '已配置' : '未配置'}
                </Badge>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                Cookie 加密存储且不会回显。新配置通过连通性验证后才会覆盖旧凭据。
              </p>
            </div>
          </div>
        </div>

        {settings?.configured && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
            <InfoItem label="Cookie 摘要" value={settings.cookieHint ?? '已配置'} />
            <InfoItem label="group_id" value={settings.groupId ?? '-'} />
            <InfoItem label="parent_id" value={settings.parentId ?? '-'} />
            <InfoItem
              label="最后修改"
              value={`${settings.updatedBy ?? '-'} · ${settings.updatedAt ? formatDate(settings.updatedAt) : '-'}`}
            />
          </div>
        )}

        <form onSubmit={saveSettings} className="space-y-4">
          <textarea
            value={cookie}
            onChange={(event) => setCookie(event.target.value)}
            rows={3}
            placeholder="粘贴完整云文档 Cookie（必须包含 wps_sid 和 csrf）"
            disabled={savingSettings}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-y focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              placeholder="group_id"
              disabled={savingSettings}
              className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60"
            />
            <input
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              placeholder="parent_id"
              disabled={savingSettings}
              className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              {savingSettings ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savingSettings ? '验证并保存中...' : '验证并保存凭据'}
            </button>
          </div>
        </form>
      </section>
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

function isReleaseManifest(value: unknown): value is ReleaseManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<ReleaseManifest>;
  const artifact = manifest.artifact as Partial<ReleaseManifest['artifact']> | undefined;
  return (
    manifest.schemaVersion === 1 &&
    manifest.product === 'skinforge' &&
    manifest.platform === 'windows-x86_64' &&
    typeof manifest.version === 'string' &&
    typeof manifest.pubDate === 'string' &&
    typeof manifest.signature === 'string' &&
    !!artifact &&
    typeof artifact.fileId === 'string' &&
    typeof artifact.linkId === 'string' &&
    typeof artifact.fileName === 'string' &&
    typeof artifact.fileSize === 'number' &&
    typeof artifact.sha1 === 'string' &&
    typeof artifact.sha256 === 'string' &&
    typeof artifact.groupId === 'string' &&
    typeof artifact.parentId === 'string'
  );
}

function shortHash(value: string): string {
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error
    : fallback;
}
