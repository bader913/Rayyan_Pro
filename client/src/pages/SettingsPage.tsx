import React, { useState, useEffect, useRef } from 'react';
import { settingsApi } from '../api/settings.ts';
import { useAuthStore } from '../store/authStore.ts';
import {
  Settings,
  Save,
  Check,
  Download,
  Upload,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
  FileJson,
  Database,
  RefreshCw,
  Bell,
  Send,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface ConnectionInfo {
  mode: 'main' | 'branch';
  appHost: string;
  appPort: string;
  dbHost: string;
  dbPort: string;
  database: string;
  user: string;
}

type ElectronAPIShape = {
  getConnectionConfig?: () => Promise<{ mode?: string; host?: string; port?: string | number }>;
  getDbRuntimeConfig?: () => Promise<{ ok?: boolean; data?: Record<string, unknown> | null }>;
  testCurrentDbConnection?: () => Promise<{ ok?: boolean; message?: string }>;
  openConnectionSetup?: () => Promise<{ ok?: boolean; message?: string }>;
};

interface SettingGroup {
  title: string;
  keys: Array<{
    key: string;
    label: string;
    type: 'text' | 'number' | 'color' | 'select' | 'boolean';
    options?: string[];
  }>;
}
interface TelegramStatusInfo {
  enabled: boolean;
  hasBotToken: boolean;
  botTokenMasked: string;
  hasChatId: boolean;
  chatIdMasked: string;
  botUsername: string;
  botName: string;
  chatName: string;
  botLink: string | null;
}

const GROUPS: SettingGroup[] = [
  {
    title: 'بيانات المتجر',
    keys: [
      { key: 'shop_name', label: 'اسم المتجر', type: 'text' },
      { key: 'shop_phone', label: 'رقم الهاتف', type: 'text' },
      { key: 'shop_address', label: 'العنوان', type: 'text' },
      { key: 'receipt_footer', label: 'تذييل الفاتورة', type: 'text' },
    ],
  },
  {
    title: 'العملة وأسعار الصرف',
    keys: [
      { key: 'currency', label: 'العملة الرئيسية', type: 'select', options: ['USD', 'SYP', 'SAR', 'AED', 'TRY'] },
      { key: 'usd_to_syp', label: 'دولار → ليرة سورية', type: 'number' },
      { key: 'usd_to_try', label: 'دولار → ليرة تركية', type: 'number' },
      { key: 'usd_to_sar', label: 'دولار → ريال سعودي', type: 'number' },
      { key: 'usd_to_aed', label: 'دولار → درهم إماراتي', type: 'number' },
    ],
  },
  {
    title: 'المخزون والنظام',
    keys: [
      { key: 'low_stock_threshold', label: 'حد المخزون المنخفض', type: 'number' },
      { key: 'enable_shifts', label: 'تفعيل الورديات', type: 'boolean' },
      { key: 'enable_multi_warehouse', label: 'تفعيل المستودعات المتعددة', type: 'boolean' },
      // { key: 'show_usd', label: 'عرض الأسعار بالدولار', type: 'boolean' },
    ],
  },
  {
    title: 'المظهر',
    keys: [
      { key: 'theme_color', label: 'لون النظام', type: 'color' },
      { key: 'theme_mode', label: 'وضع العرض', type: 'select', options: ['light', 'dark'] },
    ],
  },
];

function applyTheme(s: Record<string, string>) {
  const color = s.theme_color || '#059669';
  document.documentElement.style.setProperty('--primary', color);
  if (s.theme_mode === 'dark') document.documentElement.classList.add('dark-mode');
  else document.documentElement.classList.remove('dark-mode');
}

type ActionType = 'backup' | 'import' | 'clear';

interface PwDialogProps {
  action: ActionType;
  importFile?: File | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const META: Record<
  ActionType,
  { title: string; desc: string; confirmLabel: string; danger: boolean; icon: React.ReactNode }
> = {
  backup: {
    title: 'تأكيد التصدير',
    desc: 'سيتم تصدير جميع بيانات النظام (مبيعات، مشتريات، عملاء، موردين، منتجات، إعدادات...) إلى ملف JSON يمكنك حفظه.',
    confirmLabel: 'تحميل النسخة الاحتياطية',
    danger: false,
    icon: <Download className="w-6 h-6 text-sky-400" />,
  },
  import: {
    title: '⚠️ تأكيد الاستيراد',
    desc: 'سيتم استبدال جميع البيانات الحالية (منتجات، عملاء، فواتير، مخزون...) بما يوجد في ملف النسخة الاحتياطية. هذا الإجراء لا يمكن التراجع عنه.',
    confirmLabel: 'تأكيد الاستيراد',
    danger: true,
    icon: <Upload className="w-6 h-6 text-orange-400" />,
  },
    clear: {
    title: '⚠️ مسح البيانات التجارية',
    desc: 'سيتم حذف البيانات التشغيلية: منتجات، فئات، عملاء، موردين، مبيعات، مشتريات، مرتجعات، حركات مخزون، ورديات، مصاريف وسجل العمليات. ستبقى حسابات المستخدمين والإعدادات والترمينالات محفوظة. هذا الإجراء لا يمكن التراجع عنه.',
    confirmLabel: 'تأكيد مسح البيانات',
    danger: true,
    icon: <Trash2 className="w-6 h-6 text-red-400" />,
  },
};

function PwDialog({ action, importFile, onClose, onDone }: PwDialogProps) {
  const [password, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setBusy] = useState(false);
  const [error, setError] = useState('');
  const token = useAuthStore.getState().accessToken;
  const meta = META[action];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('أدخل كلمة المرور');
      return;
    }

    setBusy(true);
    setError('');

    try {
      if (action === 'backup') {
        const res = await fetch('/api/admin/backup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });

        if (!res.ok) {
          throw new Error((await res.json().catch(() => ({}))).message ?? 'فشل التصدير');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rayyan-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        onDone('تم تحميل النسخة الاحتياطية بنجاح ✓');
      } else if (action === 'import') {
        if (!importFile) {
          setError('لم يتم اختيار ملف');
          setBusy(false);
          return;
        }

        const text = await importFile.text();
        const backup = JSON.parse(text);

        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password, backup }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.message ?? 'فشل الاستيراد');
        }

        const c = json.counts ?? {};
        onDone(`تمت الاستعادة بنجاح ✓ — منتجات: ${c.products ?? 0}، عملاء: ${c.customers ?? 0}، مبيعات: ${c.sales ?? 0}`);
      } else {
        const res = await fetch('/api/admin/clear', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.message ?? 'حدث خطأ');
        }

        onDone(json.message ?? 'تم المسح بنجاح');
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'حدث خطأ');
    }

    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
      <div
        className="rounded-2xl w-full max-w-md shadow-2xl border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center gap-3 p-5 border-b"
          style={{ borderColor: meta.danger ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}
        >
          {meta.icon}
          <h2 className="text-base font-black flex-1" style={{ color: 'var(--text-heading)' }}>
            {meta.title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div
            className="rounded-xl p-4 text-sm leading-relaxed"
            style={
              meta.danger
                ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }
                : { background: 'var(--bg-muted)', color: 'var(--text-body)' }
            }
          >
            {meta.danger && <AlertTriangle className="w-4 h-4 inline ml-1 mb-0.5" />}
            {meta.desc}
          </div>

          {action === 'import' && importFile && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm border"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}
            >
              <FileJson className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <span className="truncate" style={{ color: 'var(--text-body)' }}>
                {importFile.name}
              </span>
              <span className="text-xs mr-auto flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {(importFile.size / 1024).toFixed(0)} KB
              </span>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Shield className="w-4 h-4" /> كلمة مرور حسابك للتأكيد
            </label>

            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPw(e.target.value)}
                autoFocus
                placeholder="أدخل كلمة مرورك..."
                className="w-full rounded-xl px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-sky-500 pr-10"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: error ? '#ef4444' : 'var(--border)',
                  color: 'var(--text-heading)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 transition hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80 border"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90"
              style={{ background: meta.danger ? '#dc2626' : '#0284c7' }}
            >
              {loading ? 'جاري التنفيذ...' : meta.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
type SettingsPanelKey = 'db' | 'telegram' | 'ai' | 'maintenance';

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleCard({
  title,
  subtitle,
  icon,
  isOpen,
  onToggle,
  children,
}: CollapsibleCardProps) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-5 text-right transition hover:opacity-95"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">{icon}</div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-black" style={{ color: 'var(--text-body)' }}>
                {title}
              </h3>

              <span
                className="rounded-xl p-1.5 border flex items-center justify-center"
                style={{
                  marginInlineStart: 'auto',
                  borderColor: 'var(--border)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </div>

            {subtitle && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </button>

      {isOpen && (
        <div
          className="px-5 pb-5 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="pt-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();

  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [activeAction, setActive] = useState<ActionType | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [successMsg, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const electronAPI = (window as Window & { electronAPI?: ElectronAPIShape }).electronAPI;

  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [openPanels, setOpenPanels] = useState<Record<SettingsPanelKey, boolean>>({
    db: true,
    telegram: false,
    ai: false,
    maintenance: false,
  });

  const togglePanel = (key: SettingsPanelKey) => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  // telegram


    const [telegramStatus, setTelegramStatus] = useState<TelegramStatusInfo | null>(null);
  const [telegramLoading, setTelegramLoading] = useState<'status' | 'connect' | 'save-chat' | 'test' | 'daily-report' | 'daily-settings' | null>(null);
  const [telegramNotice, setTelegramNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramChatName, setTelegramChatName] = useState('');
  const [telegramTestMessage, setTelegramTestMessage] = useState('✅ اختبار تلغرام من Rayyan Pro');
  const [telegramDailyReportEnabled, setTelegramDailyReportEnabled] = useState(false);
  const [telegramDailyReportTime, setTelegramDailyReportTime] = useState('21:00');
    const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [geminiSaving, setGeminiSaving] = useState<'save' | 'clear' | null>(null);
  const [geminiNotice, setGeminiNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const loadTelegramStatus = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    setTelegramLoading('status');

    try {
      const res = await fetch('/api/notifications/telegram/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message ?? 'تعذر تحميل حالة تلغرام');
      }

      const tg = json.telegram as TelegramStatusInfo;

      setTelegramStatus(tg);
      setTelegramChatName(tg.chatName || '');
      setTelegramNotice(null);
    } catch (err) {
      setTelegramNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تحميل حالة تلغرام',
      });
    } finally {
      setTelegramLoading(null);
    }
  };

  const handleTelegramConnect = async () => {
    const token = useAuthStore.getState().accessToken;

    if (!token) {
      setTelegramNotice({ type: 'error', message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' });
      return;
    }

    if (!telegramBotToken.trim()) {
      setTelegramNotice({ type: 'error', message: 'أدخل Bot Token أولًا' });
      return;
    }

    setTelegramLoading('connect');

    try {
      const res = await fetch('/api/notifications/telegram/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          botToken: telegramBotToken.trim(),
          enabled: true,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message ?? 'فشل حفظ Bot Token');
      }

      setTelegramNotice({
        type: 'success',
        message: json.message ?? 'تم ربط البوت بنجاح',
      });

      setTelegramBotToken('');
      await loadTelegramStatus();
    } catch (err) {
      setTelegramNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'فشل حفظ Bot Token',
      });
    } finally {
      setTelegramLoading(null);
    }
  };

  const handleTelegramSaveChat = async () => {
    const token = useAuthStore.getState().accessToken;

    if (!token) {
      setTelegramNotice({ type: 'error', message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' });
      return;
    }

    if (!telegramChatId.trim()) {
      setTelegramNotice({ type: 'error', message: 'أدخل chat_id أولًا' });
      return;
    }

    setTelegramLoading('save-chat');

    try {
      const res = await fetch('/api/notifications/telegram/save-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatId: telegramChatId.trim(),
          chatName: telegramChatName.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message ?? 'فشل حفظ chat_id');
      }

      setTelegramNotice({
        type: 'success',
        message: json.message ?? 'تم حفظ chat_id بنجاح',
      });

      setTelegramChatId('');
      await loadTelegramStatus();
    } catch (err) {
      setTelegramNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'فشل حفظ chat_id',
      });
    } finally {
      setTelegramLoading(null);
    }
  };

  const handleTelegramTest = async () => {
    const token = useAuthStore.getState().accessToken;

    if (!token) {
      setTelegramNotice({ type: 'error', message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' });
      return;
    }

    setTelegramLoading('test');

    try {
      const res = await fetch('/api/notifications/telegram/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: telegramTestMessage.trim() || '✅ اختبار تلغرام من Rayyan Pro',
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message ?? 'فشل إرسال الرسالة التجريبية');
      }

      setTelegramNotice({
        type: 'success',
        message: json.message ?? 'تم إرسال الرسالة التجريبية',
      });
    } catch (err) {
      setTelegramNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'فشل إرسال الرسالة التجريبية',
      });
    } finally {
      setTelegramLoading(null);
    }
  };

    const handleTelegramDailyReport = async () => {
    const token = useAuthStore.getState().accessToken;

    if (!token) {
      setTelegramNotice({ type: 'error', message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' });
      return;
    }

    setTelegramLoading('daily-report');

    try {
      const res = await fetch('/api/notifications/telegram/send-daily-report-now', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message ?? 'فشل إرسال تقرير اليوم');
      }

      setTelegramNotice({
        type: 'success',
        message: json.message ?? 'تم إرسال تقرير اليوم بنجاح',
      });
    } catch (err) {
      setTelegramNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'فشل إرسال تقرير اليوم',
      });
    } finally {
      setTelegramLoading(null);
    }
  };

    const handleTelegramDailySettingsSave = async () => {
    setTelegramLoading('daily-settings');

    try {
      await settingsApi.bulkUpdate({
        telegram_daily_report_enabled: telegramDailyReportEnabled ? 'true' : 'false',
        telegram_daily_report_time: telegramDailyReportTime || '21:00',
      });

      setValues((prev) => ({
        ...prev,
        telegram_daily_report_enabled: telegramDailyReportEnabled ? 'true' : 'false',
        telegram_daily_report_time: telegramDailyReportTime || '21:00',
      }));

      setTelegramNotice({
        type: 'success',
        message: 'تم حفظ إعدادات التقرير اليومي التلقائي',
      });
    } catch (err) {
      setTelegramNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'فشل حفظ إعدادات التقرير اليومي',
      });
    } finally {
      setTelegramLoading(null);
    }
  };
    const handleGeminiSave = async () => {
    const nextKey = geminiApiKeyInput.trim();

    if (!nextKey) {
      setGeminiNotice({
        type: 'error',
        message: 'ألصق مفتاح Gemini أولًا، أو استخدم زر حذف المفتاح إن كنت تريد إزالته',
      });
      return;
    }

    setGeminiSaving('save');

    try {
      await settingsApi.update('gemini_api_key', nextKey);

      setValues((prev) => ({
        ...prev,
        gemini_api_key_configured: 'true',
      }));

      qc.invalidateQueries({ queryKey: ['settings'] });
      setGeminiApiKeyInput('');
      setGeminiNotice({
        type: 'success',
        message: 'تم حفظ مفتاح Gemini بنجاح',
      });
    } catch (err) {
      setGeminiNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'فشل حفظ مفتاح Gemini',
      });
    } finally {
      setGeminiSaving(null);
    }
  };

  const handleGeminiClear = async () => {
    setGeminiSaving('clear');

    try {
      await settingsApi.update('gemini_api_key', '');

      setValues((prev) => ({
        ...prev,
        gemini_api_key_configured: 'false',
      }));

      qc.invalidateQueries({ queryKey: ['settings'] });
      setGeminiApiKeyInput('');
      setGeminiNotice({
        type: 'success',
        message: 'تم حذف مفتاح Gemini المحفوظ',
      });
    } catch (err) {
      setGeminiNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'فشل حذف مفتاح Gemini',
      });
    } finally {
      setGeminiSaving(null);
    }
  };
  const loadConnectionInfo = async () => {
    if (!electronAPI?.getConnectionConfig || !electronAPI?.getDbRuntimeConfig) return;

    try {
      const [appConfig, dbConfigResult] = await Promise.all([
        electronAPI.getConnectionConfig(),
        electronAPI.getDbRuntimeConfig(),
      ]);

      const dbData = (dbConfigResult?.ok ? dbConfigResult.data : null) as Record<string, unknown> | null;

      setConnectionInfo({
        mode: appConfig?.mode === 'branch' ? 'branch' : 'main',
        appHost: String(appConfig?.host ?? 'localhost'),
        appPort: String(appConfig?.port ?? '3200'),
        dbHost: String(dbData?.host ?? '-'),
        dbPort: String(dbData?.port ?? '-'),
        database: String(dbData?.database ?? '-'),
        user: String(dbData?.user ?? '-'),
      });
    } catch {
      setConnectionInfo(null);
    }
  };

  const handleCheckCurrentConnection = async () => {
    if (!electronAPI?.testCurrentDbConnection) return;

    setCheckingConnection(true);
    setConnectionStatus(null);

    try {
      const result = await electronAPI.testCurrentDbConnection();
      setConnectionStatus({
        type: result?.ok ? 'success' : 'error',
        message: result?.message || (result?.ok ? 'الاتصال سليم' : 'فشل الاتصال'),
      });
    } catch (err) {
      setConnectionStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'حدث خطأ أثناء الفحص',
      });
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleOpenConnectionSetup = async () => {
    if (!electronAPI?.openConnectionSetup) return;

    try {
      const result = await electronAPI.openConnectionSetup();
      if (!result?.ok) {
        setError(result?.message || 'تعذر فتح صفحة إعداد الاتصال');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر فتح صفحة إعداد الاتصال');
    }
  };

   useEffect(() => {
    settingsApi
      .getAll()
            .then((res) => {
        setValues(res.data.settings);
        applyTheme(res.data.settings);

        setTelegramDailyReportEnabled(res.data.settings.telegram_daily_report_enabled === 'true');
        setTelegramDailyReportTime(res.data.settings.telegram_daily_report_time || '21:00');

        setLoading(false);
      })
      .catch(() => setLoading(false));

    loadConnectionInfo();
    loadTelegramStatus();
  }, []);

  useEffect(() => {
    if (!loading) applyTheme(values);
  }, [values, loading]);

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      await settingsApi.bulkUpdate(values);
      applyTheme(values);
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('حدث خطأ أثناء الحفظ');
    }

    setSaving(false);
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    if (!file.name.endsWith('.json')) {
      setError('يجب اختيار ملف بصيغة JSON');
      return;
    }

    setImportFile(file);
    setActive('import');
  };

  const handleDone = (msg: string) => {
    setActive(null);
    setImportFile(null);
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 7000);

    settingsApi
      .getAll()
      .then((res) => {
        setValues(res.data.settings);
        applyTheme(res.data.settings);
        qc.invalidateQueries({ queryKey: ['settings'] });
      })
      .catch(() => {});
  };

  const inputCls = 'w-full rounded-xl px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-sky-500';
  const inputSty = {
    background: 'var(--bg-input)',
    borderColor: 'var(--border)',
    color: 'var(--text-heading)',
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          جاري التحميل...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-7 h-7" style={{ color: 'var(--text-secondary)' }} />
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>
            الإعدادات
          </h1>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90"
          style={{ background: saved ? '#10b981' : '#0284c7' }}
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'تم الحفظ' : saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm text-red-500"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          className="rounded-xl px-4 py-3 text-sm text-emerald-600 flex items-center gap-2"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <Check className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

            <CollapsibleCard
        title="إعدادات الاتصال بقاعدة البيانات"
        subtitle="يمكنك من هنا معرفة حالة هذا الجهاز وفتح صفحة إعداد الاتصال نفسها التي تظهر في أول تشغيل."
        icon={<Database className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
        isOpen={openPanels.db}
        onToggle={() => togglePanel('db')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              نوع الجهاز
            </div>
            <div className="font-bold" style={{ color: 'var(--text-heading)' }}>
              {connectionInfo?.mode === 'branch' ? 'فرعي' : 'رئيسي'}
            </div>
          </div>

          <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              واجهة التطبيق
            </div>
            <div className="font-mono text-sm" style={{ color: 'var(--text-heading)' }}>
              {connectionInfo ? `${connectionInfo.appHost}:${connectionInfo.appPort}` : '-'}
            </div>
          </div>

          <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              مضيف قاعدة البيانات
            </div>
            <div className="font-mono text-sm" style={{ color: 'var(--text-heading)' }}>
              {connectionInfo?.dbHost ?? '-'}
            </div>
          </div>

          <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              منفذ قاعدة البيانات
            </div>
            <div className="font-mono text-sm" style={{ color: 'var(--text-heading)' }}>
              {connectionInfo?.dbPort ?? '-'}
            </div>
          </div>

          <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              اسم قاعدة البيانات
            </div>
            <div className="font-mono text-sm" style={{ color: 'var(--text-heading)' }}>
              {connectionInfo?.database ?? '-'}
            </div>
          </div>

          <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              المستخدم
            </div>
            <div className="font-mono text-sm" style={{ color: 'var(--text-heading)' }}>
              {connectionInfo?.user ?? '-'}
            </div>
          </div>
        </div>

        {connectionStatus && (
          <div
            className="rounded-xl px-4 py-3 text-sm mt-4 flex items-center gap-2"
            style={
              connectionStatus.type === 'success'
                ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#059669' }
                : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }
            }
          >
            {connectionStatus.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            {connectionStatus.message}
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-4">
          <button
            onClick={handleCheckCurrentConnection}
            disabled={checkingConnection}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
            style={{ background: '#0284c7' }}
          >
            {checkingConnection ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {checkingConnection ? 'جاري الفحص...' : 'فحص الاتصال الحالي'}
          </button>

          <button
            onClick={handleOpenConnectionSetup}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-90 flex items-center gap-2"
            style={{ background: '#0f766e' }}
          >
            <Settings className="w-4 h-4" />
            فتح صفحة إعداد الاتصال
          </button>
        </div>
      </CollapsibleCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {GROUPS.map((group) => (
          <div
            key={group.title}
            className="rounded-2xl p-5 border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <h3
              className="text-sm font-black mb-4 pb-2 border-b"
              style={{ color: 'var(--text-body)', borderColor: 'var(--border)' }}
            >
              {group.title}
            </h3>

            <div className="space-y-3">
              {group.keys.map((item) => (
                <div key={item.key}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    {item.label}
                  </label>

                  {item.type === 'text' && (
                    <input
                      type="text"
                      value={values[item.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
                      className={inputCls}
                      style={inputSty}
                    />
                  )}

                  {item.type === 'number' && (
                    <input
                      type="number"
                      value={values[item.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
                      className={inputCls}
                      style={inputSty}
                    />
                  )}

                  {item.type === 'color' && (
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={values[item.key] ?? '#059669'}
                        onChange={(e) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
                        className="w-12 h-9 rounded-lg cursor-pointer border"
                        style={{ borderColor: 'var(--border)', background: 'transparent' }}
                      />
                      <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {values[item.key] ?? ''}
                      </span>
                    </div>
                  )}

                  {item.type === 'select' && (
                    <select
                      value={values[item.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
                      className={inputCls}
                      style={inputSty}
                    >
                      {(item.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}

                  {item.type === 'boolean' && (
                    <label className="flex items-center gap-2 cursor-pointer" dir="ltr">
                      <div
                        onClick={() =>
                          setValues((v) => ({
                            ...v,
                            [item.key]: v[item.key] === 'true' ? 'false' : 'true',
                          }))
                        }
                        className="w-11 h-6 rounded-full transition-colors flex items-center flex-shrink-0"
                        style={{
                          background: values[item.key] === 'true' ? '#0ea5e9' : 'var(--bg-muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div
                          className="w-5 h-5 bg-white rounded-full shadow-md transition-transform mx-0.5"
                          style={{ transform: values[item.key] === 'true' ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </div>

                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {values[item.key] === 'true' ? 'مفعّل' : 'معطّل'}
                      </span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
                  <CollapsibleCard
        title="تنبيهات تلغرام"
        subtitle="اربط البوت الخاص بك ثم احفظ chat_id وأرسل رسالة تجريبية للتأكد أن الربط يعمل."
        icon={<Bell className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
        isOpen={openPanels.telegram}
        onToggle={() => togglePanel('telegram')}
      >
        {telegramNotice && (
          <div
            className="rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-2"
            style={
              telegramNotice.type === 'success'
                ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#059669' }
                : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }
            }
          >
            {telegramNotice.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            {telegramNotice.message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              حالة البوت
            </div>
            <div className="font-bold" style={{ color: 'var(--text-heading)' }}>
              {telegramStatus?.hasBotToken ? 'مربوط' : 'غير مربوط'}
            </div>
            {!!telegramStatus?.botName && (
              <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                {telegramStatus.botName}
                {!!telegramStatus.botUsername && ` (@${telegramStatus.botUsername})`}
              </div>
            )}
          </div>

          <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              حالة chat_id
            </div>
            <div className="font-bold" style={{ color: 'var(--text-heading)' }}>
              {telegramStatus?.hasChatId ? 'محفوظ' : 'غير محفوظ'}
            </div>
            {!!telegramStatus?.chatIdMasked && (
              <div className="text-xs mt-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                {telegramStatus.chatIdMasked}
              </div>
            )}
          </div>

          <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              اسم المحادثة
            </div>
            <div className="font-bold" style={{ color: 'var(--text-heading)' }}>
              {telegramStatus?.chatName || '—'}
            </div>
            {telegramStatus?.botLink && (
              <a
                href={telegramStatus.botLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs font-semibold hover:underline"
                style={{ color: '#0284c7' }}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                فتح البوت
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div
            className="rounded-2xl p-4 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <h4 className="text-sm font-black mb-4" style={{ color: 'var(--text-heading)' }}>
              ربط البوت
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Bot Token
                </label>
                <input
                  type="text"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder={telegramStatus?.botTokenMasked || 'ألصق Bot Token هنا'}
                  className={inputCls}
                  style={inputSty}
                  dir="ltr"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleTelegramConnect}
                  disabled={telegramLoading === 'connect'}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                  style={{ background: '#0284c7' }}
                >
                  {telegramLoading === 'connect' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {telegramLoading === 'connect' ? 'جاري الحفظ...' : 'حفظ البوت'}
                </button>

                <button
                  onClick={loadTelegramStatus}
                  disabled={telegramLoading === 'status'}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                  style={{ background: '#0f766e' }}
                >
                  {telegramLoading === 'status' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  تحديث الحالة
                </button>
              </div>
            </div>
          </div>

          <div
            className="rounded-2xl p-4 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <h4 className="text-sm font-black mb-4" style={{ color: 'var(--text-heading)' }}>
              ربط المحادثة وإرسال اختبار
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  chat_id
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder={telegramStatus?.chatIdMasked || 'ألصق chat_id هنا'}
                  className={inputCls}
                  style={inputSty}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  اسم المحادثة (اختياري)
                </label>
                <input
                  type="text"
                  value={telegramChatName}
                  onChange={(e) => setTelegramChatName(e.target.value)}
                  placeholder="مثال: مالك المتجر"
                  className={inputCls}
                  style={inputSty}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  رسالة تجريبية
                </label>
                <input
                  type="text"
                  value={telegramTestMessage}
                  onChange={(e) => setTelegramTestMessage(e.target.value)}
                  className={inputCls}
                  style={inputSty}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleTelegramSaveChat}
                  disabled={telegramLoading === 'save-chat'}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                  style={{ background: '#7c3aed' }}
                >
                  {telegramLoading === 'save-chat' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                  {telegramLoading === 'save-chat' ? 'جاري الحفظ...' : 'حفظ chat_id'}
                </button>

                <button
                  onClick={handleTelegramTest}
                  disabled={telegramLoading === 'test'}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                  style={{ background: '#16a34a' }}
                >
                  {telegramLoading === 'test' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {telegramLoading === 'test' ? 'جاري الإرسال...' : 'إرسال رسالة تجريبية'}
                </button>
              </div>
                            <div
                className="rounded-xl p-3 border space-y-3"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  التقرير اليومي
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>
                      إرسال تلقائي يومي
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      يرسل تقرير اليوم مرة واحدة يوميًا عند الوقت المحدد
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer" dir="ltr">
                    <div
                      onClick={() => setTelegramDailyReportEnabled((v) => !v)}
                      className="w-11 h-6 rounded-full transition-colors flex items-center flex-shrink-0"
                      style={{
                        background: telegramDailyReportEnabled ? '#0ea5e9' : 'var(--bg-muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div
                        className="w-5 h-5 bg-white rounded-full shadow-md transition-transform mx-0.5"
                        style={{ transform: telegramDailyReportEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </div>

                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {telegramDailyReportEnabled ? 'مفعّل' : 'معطّل'}
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    وقت الإرسال اليومي
                  </label>
                  <input
                    type="time"
                    value={telegramDailyReportTime}
                    onChange={(e) => setTelegramDailyReportTime(e.target.value)}
                    className={inputCls}
                    style={inputSty}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleTelegramDailySettingsSave}
                    disabled={telegramLoading === 'daily-settings'}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                    style={{ background: '#2563eb' }}
                  >
                    {telegramLoading === 'daily-settings' ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {telegramLoading === 'daily-settings' ? 'جاري الحفظ...' : 'حفظ إعدادات التقرير اليومي'}
                  </button>

                  <button
                    onClick={handleTelegramDailyReport}
                    disabled={telegramLoading === 'daily-report'}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                    style={{ background: '#ea580c' }}
                  >
                    {telegramLoading === 'daily-report' ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                    {telegramLoading === 'daily-report' ? 'جاري الإرسال...' : 'إرسال تقرير اليوم الآن'}
                  </button>
                </div>

                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  الإرسال التلقائي يعمل فقط عندما يكون البرنامج والسيرفر شغالين ويوجد اتصال إنترنت.
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleCard>
            <CollapsibleCard
        title="إعدادات Gemini لمساعد الريان"
        subtitle="كل متجر يضع مفتاح Gemini الخاص به، والمفتاح لا يظهر كاملًا في الواجهة."
        icon={<MessageCircle className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
        isOpen={openPanels.ai}
        onToggle={() => togglePanel('ai')}
      >
        {geminiNotice && (
          <div
            className="rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-2"
            style={
              geminiNotice.type === 'success'
                ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#059669' }
                : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }
            }
          >
            {geminiNotice.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            {geminiNotice.message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div
            className="rounded-xl p-4 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              حالة Gemini
            </div>
            <div className="font-bold" style={{ color: 'var(--text-heading)' }}>
              {values.gemini_api_key_configured === 'true' ? 'مفعّل بمفتاح محفوظ' : 'غير مفعّل'}
            </div>
          </div>

          <div
            className="rounded-xl p-4 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              طريقة الحفظ
            </div>
            <div className="font-bold" style={{ color: 'var(--text-heading)' }}>
              داخل قاعدة البيانات
            </div>
          </div>

          <div
            className="rounded-xl p-4 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              ملاحظة
            </div>
            <div className="font-bold" style={{ color: 'var(--text-heading)' }}>
              الوظائف المحلية تعمل حتى بدون المفتاح
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl p-4 border"
          style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Gemini API Key
              </label>
              <input
                type="password"
                value={geminiApiKeyInput}
                onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                placeholder={
                  values.gemini_api_key_configured === 'true'
                    ? 'يوجد مفتاح محفوظ — ألصق مفتاحًا جديدًا للاستبدال'
                    : 'ألصق مفتاح Gemini هنا'
                }
                className={inputCls}
                style={inputSty}
                dir="ltr"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleGeminiSave}
                disabled={geminiSaving !== null}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                style={{ background: '#2563eb' }}
              >
                {geminiSaving === 'save' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {geminiSaving === 'save' ? 'جاري الحفظ...' : 'حفظ / استبدال المفتاح'}
              </button>

              {values.gemini_api_key_configured === 'true' && (
                <button
                  onClick={handleGeminiClear}
                  disabled={geminiSaving !== null}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                  style={{ background: '#dc2626' }}
                >
                  {geminiSaving === 'clear' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {geminiSaving === 'clear' ? 'جاري الحذف...' : 'حذف المفتاح المحفوظ'}
                </button>
              )}
            </div>

            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              يُستخدم هذا المفتاح فقط لميزات Gemini داخل مساعد الريان، ولا يتم عرضه كاملًا في الواجهة.
            </div>
          </div>
        </div>
      </CollapsibleCard>

            <CollapsibleCard
        title="النسخ الاحتياطي والصيانة"
        subtitle="جميع العمليات التالية تتطلب كلمة مرور حسابك للتأكيد"
        icon={<Shield className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
        isOpen={openPanels.maintenance}
        onToggle={() => togglePanel('maintenance')}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            className="rounded-2xl p-4 flex flex-col gap-3 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)' }}
              >
                <Download className="w-4 h-4 text-sky-500" />
              </div>
              <span className="font-bold text-sm" style={{ color: 'var(--text-heading)' }}>
                تصدير (نسخة احتياطية)
              </span>
            </div>

            <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
              تصدير بيانات البرنامج التشغيلية — منتجات، مبيعات، مشتريات، عملاء، موردين، ورديات، ترمينالات، فواتير وإعدادات.
              يُحفظ كملف <span className="text-sky-500 font-mono">.json</span> على جهازك.
            </p>

            <button
              onClick={() => setActive('backup')}
              className="w-full py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: '#0284c7' }}
            >
              <Download className="w-4 h-4" /> تصدير
            </button>
          </div>

          <div
            className="rounded-2xl p-4 flex flex-col gap-3 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'rgba(249,115,22,0.3)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}
              >
                <Upload className="w-4 h-4 text-orange-500" />
              </div>
              <span className="font-bold text-sm" style={{ color: 'var(--text-heading)' }}>
                استيراد (استعادة)
              </span>
            </div>

            <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
              استعادة بيانات البرنامج من ملف نسخة احتياطية سابق.{' '}
              <span className="text-orange-500 font-semibold">سيُستبدل محتوى البيانات التشغيلية الحالية</span> بمحتوى الملف.
            </p>

            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChosen} />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: '#ea580c' }}
            >
              <Upload className="w-4 h-4" /> اختيار ملف واستيراد
            </button>
          </div>

          <div
            className="rounded-2xl p-4 flex flex-col gap-3 border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'rgba(239,68,68,0.3)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </div>
              <span className="font-bold text-sm" style={{ color: 'var(--text-heading)' }}>
                مسح البيانات التجارية
              </span>
            </div>

            <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
              حذف البيانات التشغيلية — منتجات، فئات، عملاء، موردين، فواتير، مخزون، ورديات، مصاريف وسجل العمليات...{' '}
              <span className="font-semibold" style={{ color: 'var(--text-body)' }}>
                تبقى المستخدمون والإعدادات والترمينالات محفوظة.
              </span>{' '}
              <span className="text-red-500 font-semibold">لا يمكن التراجع.</span>
            </p>

            <button
              onClick={() => setActive('clear')}
              className="w-full py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: '#dc2626' }}
            >
              <Trash2 className="w-4 h-4" /> مسح البيانات
            </button>
          </div>
        </div>
      </CollapsibleCard>

      {activeAction && (
        <PwDialog
          action={activeAction}
          importFile={importFile}
          onClose={() => {
            setActive(null);
            setImportFile(null);
          }}
          onDone={handleDone}
        />
      )}
    </div>
  );
}