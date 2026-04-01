import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { aiApi } from '../api/ai.ts';

type ChatRole = 'assistant' | 'user';

interface ChatMessage {
    id: string;
    role: ChatRole;
    text: string;
    mode?: 'local' | 'gemini' | 'openai' | 'fallback';
    actionLabel?: string;
    actionKind?: 'close_modal';
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type NavigationTarget = {
  path: string;
  label: string;
  aliases: string[];
};

const STARTER_PROMPTS = [
  'ماذا أفعل اليوم؟',
  'كم بعنا اليوم؟',
  'كم بعنا هذا الشهر؟',
  'اعرض آخر المبيعات',
  'اعرض الأصناف الراكدة',
  'اقترح شراء',
  'ما ذمم العملاء؟',
  'خذني إلى الطلبات',
];

const INITIAL_MESSAGE: ChatMessage = {
  id: 'ai-welcome',
  role: 'assistant',
  text: [
    'أهلًا، أنا مساعد الريان.',
    'أستطيع الآن مساعدتك في:',
    '• مبيعات اليوم / الأسبوع / الشهر',
    '• ربح اليوم وملخص اليوم',
    '• قرارات اليوم وماذا تفعل الآن',
    '• آخر المبيعات',
    '• المنتجات منخفضة المخزون والنافدة',
    '• الأصناف الراكدة',
    '• اقتراحات الشراء',
    '• ذمم العملاء والموردين',
    '• أسعار المنتجات ومخزونها',
    '• التنقل داخل البرنامج مثل: خذني إلى المنتجات أو افتح الطلبات',
  ].join('\n'),
};

const NAVIGATION_TARGETS: NavigationTarget[] = [
  {
    path: '/morning-decisions',
    label: 'قرارات اليوم',
    aliases: ['قرارات اليوم', 'صفحه قرارات اليوم', 'صفحة قرارات اليوم'],
  },
  {
    path: '/incoming-orders',
    label: 'الطلبات الواردة',
    aliases: [
      'الطلبات الوارده',
      'الطلبات الواردة',
      'الطلبات',
      'الاوردرات',
      'الطلبات الجديده',
      'الطلبات الجديدة',
      'طلبات الزباين',
      'طلبات العملاء',
      'incoming orders',
    ],
  },
  {
    path: '/products',
    label: 'المنتجات',
    aliases: ['المنتجات', 'الاصناف', 'الأصناف', 'البضاعه', 'البضاعة'],
  },
  {
    path: '/purchases',
    label: 'المشتريات',
    aliases: ['المشتريات', 'الشراء', 'فواتير الشراء'],
  },
  {
    path: '/returns',
    label: 'المرتجعات',
    aliases: ['المرتجعات', 'الارجاعات', 'الإرجاعات', 'المرتجع'],
  },
  {
    path: '/customers',
    label: 'العملاء',
    aliases: ['العملاء', 'الزباين', 'الزبائن'],
  },
  {
    path: '/suppliers',
    label: 'الموردين',
    aliases: ['الموردين', 'المورّدين'],
  },
  {
    path: '/reports',
    label: 'التقارير',
    aliases: ['التقارير', 'التقرير', 'التقار ير'],
  },
  {
    path: '/dashboard',
    label: 'لوحة التحكم',
    aliases: ['لوحه التحكم', 'لوحة التحكم', 'الداشبورد', 'الرئيسيه', 'الرئيسية', 'الصفحه الرئيسيه', 'الصفحة الرئيسية'],
  },
  {
    path: '/pos',
    label: 'نقطة البيع',
    aliases: ['نقطه البيع', 'نقطة البيع', 'الكاشير', 'الكاشيه', 'pos'],
  },
  {
    path: '/shifts',
    label: 'الورديات',
    aliases: ['الورديات', 'الورديه', 'الوردية', 'الشيفتات', 'الشفتات', 'shifts'],
  },
  {
    path: '/expenses',
    label: 'المصاريف',
    aliases: ['المصاريف', 'المصروفات', 'المصروف'],
  },
  {
    path: '/invoices',
    label: 'الفواتير',
    aliases: ['الفواتير', 'فواتير البيع العامه', 'فواتير البيع العامة'],
  },
  {
    path: '/sellInvoices',
    label: 'فواتير البيع',
    aliases: ['فواتير البيع', 'بيع الفواتير', 'سجل فواتير البيع'],
  },
  {
    path: '/settings',
    label: 'الإعدادات',
    aliases: ['الاعدادات', 'الإعدادات', 'الضبط', 'الستنجات', 'settings'],
  },
  {
    path: '/users',
    label: 'المستخدمين',
    aliases: ['المستخدمين', 'الموظفين', 'اليوزرز', 'users'],
  },
  {
    path: '/audit-logs',
    label: 'سجل النشاط',
    aliases: ['سجل النشاط', 'السجل', 'سجلات النشاط', 'التدقيق', 'سجل التدقيق'],
  },
  {
    path: '/barcodes',
    label: 'الباركود',
    aliases: ['الباركود', 'الباركودات', 'barcode', 'barcodes'],
  },
  {
    path: '/price-tags',
    label: 'بطاقات الأسعار',
    aliases: ['بطاقات الاسعار', 'بطاقات الأسعار', 'الاسعار', 'الأسعار', 'price tags'],
  },
  {
    path: '/smart-warehouses',
    label: 'المستودعات الذكية',
    aliases: ['المستودعات الذكيه', 'المستودعات الذكية', 'الذكيه', 'الذكية'],
  },
  {
    path: '/warehouses',
    label: 'المستودعات',
    aliases: ['المستودعات', 'المخازن', 'المخزن', 'المستودع'],
  },
  {
    path: '/stock-transfers',
    label: 'نقل المخزون',
    aliases: ['نقل المخزون', 'التحويلات', 'تحويلات المخزون', 'النقل بين المستودعات'],
  },
  {
    path: '/profit-calc',
    label: 'حاسبة الربح',
    aliases: ['حاسبه الربح', 'حاسبة الربح', 'حساب الربح'],
  },
  {
    path: '/qr-codes',
    label: 'QR Codes',
    aliases: ['qr', 'qr code', 'qr codes', 'رموز qr'],
  },
  {
    path: '/currency-calc',
    label: 'حاسبة العملات',
    aliases: ['حاسبه العملات', 'حاسبة العملات', 'العملات', 'تحويل العملات'],
  },
];

const NAVIGATION_TRIGGERS = [
  'خذني الى',
  'خذني الي',
  'خدني الى',
  'خدني الي',
  'وديني الى',
  'وديني الي',
  'وديني على',
  'روح الى',
  'روح الي',
  'روح على',
  'افتح',
  'افتحلي',
  'افتح لي',
  'افتح صفحه',
  'افتح صفحة',
  'طلعلي صفحه',
  'طلعلي صفحة',
  'انتقل الى',
  'انتقل الي',
  'خذني',
  'خدني',
  'وديني',
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeAssistantCommand(input: string) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDarkThemeCommand(input: string) {
  const normalized = normalizeAssistantCommand(input);

  return [
    'اعمل الثيم دارك',
    'خلي الثيم دارك',
    'فعل الثيم دارك',
    'فعل الثيم الداكن',
    'حول الثيم دارك',
    'حول الثيم الداكن',
    'حول للوضع الداكن',
    'حوّل للوضع الداكن',
    'شغل الوضع الداكن',
    'الوضع الداكن',
    'ثيم دارك',
    'دارك مود',
  ].some((term) => normalized.includes(term));
}

function isLightThemeCommand(input: string) {
  const normalized = normalizeAssistantCommand(input);

  return [
    'اعمل الثيم فاتح',
    'اعمل الثيم ابيض',
    'خلي الثيم فاتح',
    'خلي الثيم ابيض',
    'فعل الثيم الفاتح',
    'فعل الثيم الابيض',
    'حول الثيم فاتح',
    'حول الثيم ابيض',
    'حول للوضع الفاتح',
    'حول للوضع الابيض',
    'حوّل للوضع الفاتح',
    'حوّل للوضع الابيض',
    'شغل الوضع الفاتح',
    'شغل الوضع الابيض',
    'الوضع الفاتح',
    'الوضع الابيض',
    'ثيم فاتح',
    'ثيم ابيض',
    'لايت مود',
  ].some((term) => normalized.includes(term));
}

function applyDarkThemeNow() {
  const html = document.documentElement;
  html.classList.add('dark-mode');
  html.style.colorScheme = 'dark';
}

function applyLightThemeNow() {
  const html = document.documentElement;
  html.classList.remove('dark-mode');
  html.style.colorScheme = 'light';
}

function parseNavigationRequest(input: string): {
  isNavigation: boolean;
  target: NavigationTarget | null;
} {
  const normalized = normalizeAssistantCommand(input);
  const isNavigation = NAVIGATION_TRIGGERS.some((term) => normalized.includes(term));

  if (!isNavigation) {
    return { isNavigation: false, target: null };
  }

  const target =
    NAVIGATION_TARGETS.find((item) =>
      item.aliases.some((alias) => normalized.includes(normalizeAssistantCommand(alias)))
    ) || null;

  return { isNavigation: true, target };
}

export default function AIAssistantModal({ open, onClose }: Props) {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
const handleMessageAction = (messageId: string, actionKind?: 'close_modal') => {
    if (actionKind === 'close_modal') {
        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === messageId
                    ? { ...msg, actionLabel: undefined, actionKind: undefined }
                    : msg
            )
        );
        onClose();
    }
};
  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  if (!open) return null;

  const sendMessage = async (forcedText?: string) => {
    const text = String(forcedText ?? input).trim();
    if (!text || loading) return;

    setError('');
    setInput('');

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMessage]);

    if (isDarkThemeCommand(text)) {
      applyDarkThemeNow();

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: 'تم تفعيل الثيم الداكن فورًا.',
          mode: 'local',
        },
      ]);
      return;
    }

    if (isLightThemeCommand(text)) {
      applyLightThemeNow();

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: 'تم تفعيل الثيم الفاتح فورًا.',
          mode: 'local',
        },
      ]);
      return;
    }

    const navigationRequest = parseNavigationRequest(text);
if (navigationRequest.isNavigation) {
  if (navigationRequest.target) {
    const target = navigationRequest.target;

    navigate(target.path);

    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        role: 'assistant',
        text: `تم نقلك إلى صفحة ${target.label}. عندما تنتهي اضغط "وصلت".`,
        mode: 'local',
        actionLabel: 'وصلت',
        actionKind: 'close_modal',
      },
    ]);

    return;
  }

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: [
            'فهمت أنك تريد التنقل داخل البرنامج، لكن لم أحدد الوجهة بدقة.',
            'جرّب مثلًا:',
            '• خذني إلى الطلبات',
            '• افتح المنتجات',
            '• روح إلى التقارير',
            '• وديني إلى الإعدادات',
          ].join('\n'),
          mode: 'local',
        },
      ]);
      return;
    }

    setLoading(true);

    try {
      const res = await aiApi.ask(text);
      const reply = res.data?.reply;

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: String(reply?.text || 'تعذر إنشاء رد مناسب حاليًا.'),
          mode: reply?.mode,
        },
      ]);
    } catch (e: any) {
      const message =
        e?.response?.data?.message ||
        e?.message ||
        'تعذر الوصول إلى مساعد الريان الآن.';

      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: 'تعذر الوصول إلى مساعد الريان الآن. تأكد من السيرفر ثم جرّب مجددًا.',
          mode: 'fallback',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--text-heading) 22%, transparent)' }}
      onClick={handleOverlayClick}
    >
      <div
        className="w-full max-w-3xl rounded-[28px] overflow-hidden shadow-2xl"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{
                background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
              }}
            >
              <Sparkles size={18} style={{ color: 'var(--primary)' }} />
            </div>

            <div>
              <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
                مساعد الريان
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                نسخة تجريبية — قراءة فقط
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            style={{
              color: 'var(--text-muted)',
              background: 'transparent',
              border: '1px solid var(--border)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setInput(prompt);
                  textareaRef.current?.focus();
                }}
                className="px-3 py-2 rounded-xl text-xs font-black transition-colors"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={listRef}
          className="px-5 py-4 h-[430px] overflow-y-auto space-y-3"
          style={{ background: 'var(--bg-card)' }}
        >
          {messages.map((message) => {
            const isAssistant = message.role === 'assistant';

            return (
              <div
                key={message.id}
                className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className="max-w-[85%] rounded-3xl px-4 py-3"
                  style={{
                    background: isAssistant
                      ? 'var(--bg-subtle)'
                      : 'color-mix(in srgb, var(--primary) 12%, transparent)',
                    color: isAssistant ? 'var(--text-primary)' : 'var(--text-heading)',
                    border: `1px solid ${isAssistant
                      ? 'var(--border)'
                      : 'color-mix(in srgb, var(--primary) 22%, var(--border))'
                      }`,
                  }}
                >
                  <div
                    className="text-[11px] font-black mb-1.5 flex items-center gap-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span>{isAssistant ? 'مساعد الريان' : 'أنت'}</span>

                    {isAssistant && message.mode && (
                      <span
                        className="px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {message.mode === 'openai' || message.mode === 'gemini'
                          ? 'AI'
                          : message.mode === 'local'
                            ? 'محلي'
                            : 'Fallback'}
                      </span>
                    )}
                  </div>

                 <div
  className="text-sm leading-7 whitespace-pre-wrap"
  style={{ color: isAssistant ? 'var(--text-primary)' : 'var(--text-heading)' }}
>
  {message.text}
</div>

{isAssistant && message.actionLabel && (
  <div className="mt-3">
    <button
      type="button"
      onClick={() => handleMessageAction(message.id, message.actionKind)}
      className="px-3 py-2 rounded-xl text-xs font-black transition-colors"
      style={{
        background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
        color: 'var(--text-heading)',
        border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
      }}
    >
      {message.actionLabel}
    </button>
  </div>
)}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div
                className="rounded-3xl px-4 py-3 flex items-center gap-2"
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm font-bold">جارٍ التفكير...</span>
              </div>
            </div>
          )}
        </div>

        <div
          className="px-5 py-4 border-t"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
        >
          {error && (
            <div
              className="mb-3 rounded-2xl px-3 py-2 text-xs font-bold"
              style={{
                background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-card))',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={3}
              placeholder="اكتب مثلًا: كم بعنا اليوم؟ أو خذني إلى الطلبات..."
              className="flex-1 rounded-3xl px-4 py-3 outline-none resize-none text-sm"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />

            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className="h-[52px] px-5 rounded-2xl text-sm font-black transition-opacity disabled:opacity-50"
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: '1px solid transparent',
              }}
            >
              <span className="flex items-center gap-2">
                <Send size={15} />
                إرسال
              </span>
            </button>
          </div>

          <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Enter للإرسال — Shift + Enter لسطر جديد
          </div>
        </div>
      </div>
    </div>
  );
}