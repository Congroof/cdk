import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, Lock, User } from 'lucide-react';
import api from '../api';

const REMEMBER_KEY = 'cdk_remember';
const USERNAME_KEY = 'cdk_username';
const PASSWORD_KEY = 'cdk_password';

function loadRememberedCredentials() {
  if (localStorage.getItem(REMEMBER_KEY) !== '1') {
    return { username: '', password: '', remember: false };
  }
  return {
    username: localStorage.getItem(USERNAME_KEY) ?? '',
    password: localStorage.getItem(PASSWORD_KEY) ?? '',
    remember: true,
  };
}

export default function Login() {
  const navigate = useNavigate();
  const remembered = loadRememberedCredentials();
  const [username, setUsername] = useState(remembered.username);
  const [password, setPassword] = useState(remembered.password);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(remembered.remember);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      if (res.data.success) {
        localStorage.setItem('token', res.data.data.token);
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, '1');
          localStorage.setItem(USERNAME_KEY, username);
          localStorage.setItem(PASSWORD_KEY, password);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(USERNAME_KEY);
          localStorage.removeItem(PASSWORD_KEY);
        }
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError(
          typeof err.response.data?.error === 'string'
            ? err.response.data.error
            : '用户名或密码错误',
        );
      } else {
        const message =
          axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
            ? err.response.data.error
            : '登录失败，请重试';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#060913] px-4 py-10 overflow-hidden">
      {/* Ambient lighting */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[680px] rounded-full bg-gradient-to-b from-blue-600/15 via-indigo-600/10 to-transparent blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-white/[0.08] bg-[#0b1120]/90 p-7 sm:p-9 shadow-2xl shadow-black/60 backdrop-blur-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 ring-1 ring-white/20">
              <KeyRound className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              CDK 管理系统
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-400">
              授权分发、设备监控与客户端运营控制台
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                管理员账号
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:border-blue-500/40 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="请输入用户名"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                登录密码
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-11 text-sm text-white placeholder-slate-500 transition-all focus:border-blue-500/40 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="请输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/40 focus:ring-offset-0"
                />
                <span className="text-xs sm:text-sm text-slate-300">在此设备记住登录信息</span>
              </label>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在验证身份...
                </>
              ) : (
                '进入管理后台'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
