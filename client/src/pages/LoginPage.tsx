import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/client.ts';
import { useAuthStore } from '../store/authStore.ts';

type ElectronAPIShape = {
  openConnectionSetup?: () => Promise<{ ok?: boolean; message?: string }>;
};

// أنماط مطابقة للداشبورد
const surfaceCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

const text = {
  heading: { color: 'var(--text-heading)' } as React.CSSProperties,
  body: { color: 'var(--text-body)' } as React.CSSProperties,
  secondary: { color: 'var(--text-secondary)' } as React.CSSProperties,
  muted: { color: 'var(--text-muted)' } as React.CSSProperties,
};

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const electronAPI = (window as Window & { electronAPI?: ElectronAPIShape }).electronAPI;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await authApi.login(username, password);
      const { user, access_token, refresh_token } = res.data;
      setAuth(user, access_token, refresh_token);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'فشل تسجيل الدخول. تحقق من البيانات.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConnectionSetup = async () => {
    try {
      const result = await electronAPI?.openConnectionSetup?.();
      if (result && result.ok === false) {
        setError(result.message || 'تعذر فتح صفحة إعداد الاتصال');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر فتح صفحة إعداد الاتصال');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg-subtle)' }}
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
          {/* الرأس المتدرج – بنفس ألوان الداشبورد */}
          <div
            className="px-5 py-2.5"
            style={{
              background: 'linear-gradient(90deg, #059669 0%, #0d9488 100%)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-white text-xs font-black tracking-widest uppercase opacity-90">
                RAYYAN PRO
              </span>
              <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                v1.0 — النظام الجديد
              </span>
            </div>
          </div>

          <div className="p-8">
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-2xl font-black shadow-lg"
                style={{ background: 'linear-gradient(135deg, #059669, #0d9488)' }}
              >
                ر
              </div>
              <h1 className="text-2xl font-black mb-1" style={text.heading}>
                ريان برو
              </h1>
              <p className="text-sm font-medium" style={text.secondary}>
                نظام المبيعات والمحاسبة الاحترافي
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1.5" style={text.body}>
                  اسم المستخدم
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  required
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition-colors"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-body)',
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5" style={text.body}>
                  كلمة المرور
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition-colors"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-body)',
                  }}
                />
              </div>

              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-medium"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    color: '#ef4444',
                  }}
                >
                  {error}
                </div>
              )}

              <div className="space-y-3 mt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 text-white font-black rounded-xl transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background: 'var(--primary, #059669)',
                  }}
                >
                  {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
                </button>

                <button
                  type="button"
                  onClick={handleOpenConnectionSetup}
                  className="w-full py-3.5 font-black rounded-xl transition-all active:scale-95"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary, #0f766e)',
                  }}
                >
                  إعدادات الاتصال
                </button>
              </div>
            </form>
          </div>
        </div>

        <p className="text-center text-xs mt-6 font-medium" style={text.muted}>
          Rayyan Pro v1.0 — النظام الاحترافي الجديد
        </p>
      </div>
    </div>
  );
}