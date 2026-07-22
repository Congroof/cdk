import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Megaphone, RefreshCw, Save } from 'lucide-react';
import api from '../api';
import type { Announcement } from '../types';
import { formatDate } from '../utils/format';
import { useToast } from './toastContext';

const MAX_TITLE_LEN = 128;
const MAX_CONTENT_LEN = 10_000;

export default function AnnouncementEditor() {
  const { toast } = useToast();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const titleLength = Array.from(title).length;
  const contentLength = Array.from(content).length;

  const applyAnnouncement = useCallback((value: Announcement | null) => {
    setAnnouncement(value);
    setTitle(value?.title ?? '');
    setContent(value?.content ?? '');
    setIsEnabled(value?.is_enabled ?? true);
  }, []);

  const fetchAnnouncement = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/announcement');
      if (res.data.success) {
        applyAnnouncement((res.data.data as Announcement | null) ?? null);
      }
    } catch (err: unknown) {
      toast(getErrorMessage(err, '公告加载失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [applyAnnouncement, toast]);

  useEffect(() => {
    void Promise.resolve().then(fetchAnnouncement);
  }, [fetchAnnouncement]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedTitle) {
      toast('公告标题不能为空', 'error');
      return;
    }
    if (Array.from(normalizedTitle).length > MAX_TITLE_LEN) {
      toast('公告标题不能超过 128 个字符', 'error');
      return;
    }
    if (!normalizedContent) {
      toast('公告内容不能为空', 'error');
      return;
    }
    if (Array.from(normalizedContent).length > MAX_CONTENT_LEN) {
      toast('公告内容不能超过 10000 个字符', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/announcement', {
        title: normalizedTitle,
        content: normalizedContent,
        is_enabled: isEnabled,
      });
      if (res.data.success) {
        applyAnnouncement(res.data.data as Announcement);
        toast(announcement ? '公告已更新' : '公告已创建', 'success');
      }
    } catch (err: unknown) {
      toast(getErrorMessage(err, '公告保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
        正在加载公告...
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              {announcement ? '修改公告' : '创建公告'}
            </h2>
          </div>
          <p className="text-sm text-slate-400">
            公告将通过用户名专属客户端接口公开，停用后客户端会获得空数据。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchAnnouncement()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 border border-white/10 rounded-xl hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          重新加载
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 sm:p-6 space-y-6"
      >
        <div>
          <div className="flex items-center justify-between gap-4 mb-2">
            <label htmlFor="announcement-title" className="text-sm font-medium text-slate-300">
              公告标题
            </label>
            <span className={`text-xs ${titleLength > MAX_TITLE_LEN ? 'text-red-400' : 'text-slate-500'}`}>
              {titleLength} / {MAX_TITLE_LEN}
            </span>
          </div>
          <input
            id="announcement-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="请输入公告标题"
            disabled={saving}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 disabled:opacity-60 transition-all"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-2">
            <label htmlFor="announcement-content" className="text-sm font-medium text-slate-300">
              公告正文
            </label>
            <span className={`text-xs ${contentLength > MAX_CONTENT_LEN ? 'text-red-400' : 'text-slate-500'}`}>
              {contentLength} / {MAX_CONTENT_LEN}
            </span>
          </div>
          <textarea
            id="announcement-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="请输入公告正文，支持多行纯文本"
            disabled={saving}
            rows={12}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 disabled:opacity-60 transition-all"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(event) => setIsEnabled(event.target.checked)}
              disabled={saving}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40"
            />
            <span>
              <span className="block text-sm font-medium text-slate-300">对客户端启用</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                关闭后保留草稿，但客户端不会读取到内容
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white text-sm font-medium rounded-xl shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? '保存中...' : announcement ? '保存修改' : '创建公告'}
          </button>
        </div>

        {announcement && (
          <div className="pt-4 border-t border-white/5 text-xs text-slate-500">
            最后更新时间：{formatDate(announcement.updated_at)}
          </div>
        )}
      </form>
    </div>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
    ? err.response.data.error
    : fallback;
}
