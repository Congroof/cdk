import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Cloud,
  Database,
  FileJson,
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
import { formatDate } from '../utils/format';
import { useToast } from './Toast';

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

  const chooseManifest = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
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
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
        正在加载 SkinForge 配置...
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cloud className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-slate-100">云文档配置</h2>
            </div>
            <p className="text-sm text-slate-400">
              Cookie 加密保存且不会回显。新配置验证成功后才覆盖旧配置。
            </p>
          </div>
          <StatusBadge active={settings?.configured ?? false} />
        </div>

        {settings?.configured && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 text-sm">
            <InfoItem label="Cookie" value={settings.cookieHint ?? '已配置'} />
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
            placeholder="粘贴完整 Cookie（必须包含 wps_sid 和 csrf）"
            disabled={savingSettings}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 resize-y focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <input
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              placeholder="group_id"
              disabled={savingSettings}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
            />
            <input
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              placeholder="parent_id"
              disabled={savingSettings}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium rounded-xl disabled:opacity-50"
            >
              {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingSettings ? '验证并保存中...' : '验证并保存'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PackageOpen className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold text-slate-100">软件发布</h2>
            </div>
            <p className="text-sm text-slate-400">
              仅接受严格高于当前版本的 Windows x86_64 发布。
            </p>
          </div>
          <label className="flex items-center gap-2 px-4 py-2 text-sm text-violet-300 border border-violet-500/20 rounded-xl hover:bg-violet-500/10 cursor-pointer">
            <FileJson className="w-4 h-4" />
            选择发布 JSON
            <input type="file" accept=".json,application/json" className="hidden" onChange={chooseManifest} />
          </label>
        </div>

        {release && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 text-sm">
            <InfoItem label="当前版本" value={release.version} />
            <InfoItem label="安装包" value={release.fileName} />
            <InfoItem label="大小" value={formatBytes(release.fileSize)} />
            <InfoItem
              label="最后发布"
              value={`${release.updatedBy ?? '-'} · ${formatDate(release.updatedAt)}`}
            />
          </div>
        )}

        {manifest ? (
          <form onSubmit={publishRelease} className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <InfoItem label="待发布版本" value={manifest.version} />
              <InfoItem label="平台" value={manifest.platform} />
              <InfoItem label="安装包" value={manifest.artifact.fileName} />
              <InfoItem label="SHA-256" value={shortHash(manifest.artifact.sha256)} />
              <InfoItem label="file_id" value={manifest.artifact.fileId} />
              <InfoItem label="link_id" value={manifest.artifact.linkId} />
              <InfoItem label="大小" value={formatBytes(manifest.artifact.fileSize)} />
              <InfoItem label="发布时间" value={formatDate(manifest.pubDate)} />
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              placeholder="填写本版本更新说明"
              disabled={publishing}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-60"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={publishing}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-medium rounded-xl disabled:opacity-50"
              >
                {publishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {publishing ? '校验并发布中...' : '确认发布'}
              </button>
            </div>
          </form>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500 border border-dashed border-white/10 rounded-xl">
            请选择 `release:upload` 生成的本地 JSON 文件。
          </div>
        )}
      </section>

      <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-slate-100">Hash 字典同步</h2>
            </div>
            <p className="text-sm text-slate-400">
              TXT 与 gzip 都上传并验证成功后才会切换公开版本。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={syncing || hashStatus?.running}
            className="flex items-center gap-2 px-4 py-2 text-sm text-emerald-300 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/10 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing || hashStatus?.running ? 'animate-spin' : ''}`} />
            {hashStatus?.running ? '正在同步' : '立即同步'}
          </button>
        </div>

        {hashStatus?.current ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 text-sm">
            <InfoItem label="当前版本" value={hashStatus.current.version} />
            <InfoItem label="规范 TXT" value={`已发布 · ${formatBytes(hashStatus.current.txtSize)}`} />
            <InfoItem label="gzip" value={`已发布 · ${formatBytes(hashStatus.current.gzipSize)}`} />
            <InfoItem label="发布时间" value={formatDate(hashStatus.current.publishedAt)} />
          </div>
        ) : (
          <div className="mb-5 text-sm text-amber-400">尚无公开 Hash 版本。</div>
        )}

        {hashStatus?.pending && (
          <div className="grid sm:grid-cols-3 gap-3 mb-5 text-sm">
            <InfoItem label="待发布版本" value={hashStatus.pending.version} />
            <InfoItem
              label="TXT 上传"
              value={hashStatus.pending.txtUploaded ? '已完成' : '待上传'}
            />
            <InfoItem
              label="gzip 上传"
              value={hashStatus.pending.gzipUploaded ? '已完成' : '待上传'}
            />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <InfoItem
            label="最后成功"
            value={hashStatus?.sync.lastSuccessAt ? formatDate(hashStatus.sync.lastSuccessAt) : '-'}
          />
          <InfoItem
            label="候选版本"
            value={hashStatus?.sync.lastCandidateVersion ?? '-'}
          />
        </div>
        {hashStatus?.sync.lastError && (
          <div className="mt-4 px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl text-sm text-red-300 whitespace-pre-wrap">
            {hashStatus.sync.lastError}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`px-2.5 py-1 text-xs border rounded-full ${
        active
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      }`}
    >
      {active ? '已配置' : '未配置'}
    </span>
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

function isReleaseManifest(value: unknown): value is ReleaseManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<ReleaseManifest>;
  const artifact = manifest.artifact as Partial<ReleaseManifest['artifact']> | undefined;
  return (
    manifest.schemaVersion === 1
    && manifest.product === 'skinforge'
    && manifest.platform === 'windows-x86_64'
    && typeof manifest.version === 'string'
    && typeof manifest.pubDate === 'string'
    && typeof manifest.signature === 'string'
    && !!artifact
    && typeof artifact.fileId === 'string'
    && typeof artifact.linkId === 'string'
    && typeof artifact.fileName === 'string'
    && typeof artifact.fileSize === 'number'
    && typeof artifact.sha1 === 'string'
    && typeof artifact.sha256 === 'string'
    && typeof artifact.groupId === 'string'
    && typeof artifact.parentId === 'string'
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(1)} ${unit}`;
}

function shortHash(value: string): string {
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error
    : fallback;
}
