import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Play, Square, TrendingUp, DollarSign,
  CreditCard, Users, RefreshCw, ChevronDown, CheckCircle2,
  AlertCircle, X, Printer,
} from 'lucide-react';
import { shiftsApi, type Shift, type ShiftSummary } from '../api/shifts.ts';
import { useAuthStore } from '../store/authStore.ts';

function dur(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}س ${m}د` : `${m} دقيقة`;
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('ar-EG-u-nu-latn', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtUSD(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ShiftSummaryPrint(sum: ShiftSummary) {
  const win = window.open('', '_blank');
  if (!win) return;
  const diff = parseFloat(sum.difference);
  const diffStr = diff === 0 ? 'مطابق' : diff > 0 ? `زيادة ${fmtUSD(diff)}` : `عجز ${fmtUSD(Math.abs(diff))}`;
  const diffColor = diff === 0 ? '#059669' : diff > 0 ? '#3b82f6' : '#ef4444';

  win.document.write(`
    <html><head><title>تقرير الوردية</title>
    <style>
      * { box-sizing: border-box; margin:0; padding:0; }
      body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; color: #1e293b; font-size: 13px; padding: 24px; max-width: 380px; margin: auto; }
      h1 { font-size: 18px; font-weight: 900; text-align: center; margin-bottom: 4px; }
      .sub { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 16px; }
      .divider { height: 1px; background: #e2e8f0; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
      .label { font-size: 12px; color: #64748b; }
      .value { font-size: 12px; font-weight: 700; }
      .big { font-size: 16px; font-weight: 900; }
      .diff { font-size: 14px; font-weight: 900; color: ${diffColor}; text-align: center; padding: 8px; background: ${diff === 0 ? '#d1fae5' : diff > 0 ? '#dbeafe' : '#fee2e2'}; border-radius: 8px; margin-top: 10px; }
      .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: center; }
      @media print { @page { margin: 0.3cm; size: 80mm auto; } }
    </style></head>
    <body>
      <h1>تقرير الوردية #${sum.id}</h1>
      <div class="sub">${sum.cashier_name} ${sum.terminal_name ? `· ${sum.terminal_name}` : ''}</div>
      <div class="divider"></div>
      <div class="row"><span class="label">وقت الفتح</span><span class="value">${fmtTime(sum.opened_at)}</span></div>
      ${sum.closed_at ? `<div class="row"><span class="label">وقت الإغلاق</span><span class="value">${fmtTime(sum.closed_at)}</span></div>` : ''}
      <div class="divider"></div>
      <div class="row"><span class="label">رصيد الافتتاح</span><span class="value">${fmtUSD(sum.opening_balance)}</span></div>
      <div class="row"><span class="label">عدد الفواتير</span><span class="value big">${sum.sales_count}</span></div>
      <div class="row"><span class="label">إجمالي المبيعات</span><span class="value big" style="color:#059669">${fmtUSD(sum.sales_total)}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">مبيعات نقدية</span><span class="value">${fmtUSD(sum.cash_total)}</span></div>
      <div class="row"><span class="label">مبيعات شام كاش</span><span class="value">${fmtUSD(sum.card_total)}</span></div>
      <div class="row"><span class="label">مبيعات آجلة</span><span class="value">${fmtUSD(sum.credit_total)}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">النقد المتوقع في الصندوق</span><span class="value">${fmtUSD(sum.expected_cash)}</span></div>
      <div class="row"><span class="label">النقد الفعلي المعدود</span><span class="value">${fmtUSD(sum.closing_cash_counted)}</span></div>
      <div class="diff">${diffStr}</div>
      ${sum.closing_note ? `<div style="margin-top:8px;font-size:11px;color:#64748b">ملاحظة الإغلاق: ${sum.closing_note}</div>` : ''}
      <div class="footer">طُبع بتاريخ ${new Date().toLocaleString('ar-EG-u-nu-latn')}</div>
    </body>
    <script>window.onload=()=>{ window.print(); window.close(); }<\/script>
    </html>`);
  win.document.close();
}

// ── Open Shift Modal ──────────────────────────────────────────────────────────
function OpenShiftModal({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const [balance, setBalance] = useState('0');
  const [note,    setNote]    = useState('');
  const [error,   setError]   = useState('');
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => shiftsApi.open({
      opening_balance: parseFloat(balance) || 0,
      opening_note:    note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      qc.invalidateQueries({ queryKey: ['shifts-list'] });
      onOpened();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'حدث خطأ'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-[400px] rounded-2xl shadow-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Play size={16} className="text-emerald-500" /> فتح وردية جديدة
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              رصيد الافتتاح النقدي ($)
            </label>
            <input
              type="number" min="0" step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-lg font-black focus:outline-none"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              المبلغ النقدي الموجود في الصندوق عند بداية الوردية
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>ملاحظة (اختياري)</label>
            <textarea
              rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="أي ملاحظة عند فتح الوردية..."
              className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none resize-none"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#059669' }}
            >
              <Play size={15} />
              {mut.isPending ? 'جارٍ الفتح...' : 'فتح الوردية'}
            </button>
            <button onClick={onClose}
              className="px-5 py-3 rounded-xl font-black text-sm"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Close Shift Modal ─────────────────────────────────────────────────────────
function CloseShiftModal({
  shift, onClose, onClosed,
}: {
  shift: Shift; onClose: () => void; onClosed: (summary: ShiftSummary) => void;
}) {
  const [cash,  setCash]  = useState('');
  const [note,  setNote]  = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => shiftsApi.close(shift.id, {
      closing_cash_counted: parseFloat(cash) || 0,
      closing_note:         note || undefined,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      qc.invalidateQueries({ queryKey: ['shifts-list'] });
      onClosed(res.data.summary);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'حدث خطأ'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-[440px] rounded-2xl shadow-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Square size={16} className="text-red-500" /> إغلاق الوردية
          </h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        {/* Shift info */}
        <div className="rounded-xl p-3 mb-4 grid grid-cols-2 gap-2 text-xs" style={{ background: 'var(--bg-muted)' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>الكاشير: </span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{shift.cashier_name}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>مدة الوردية: </span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{dur(shift.opened_at)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>رصيد الافتتاح: </span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{fmtUSD(shift.opening_balance)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>وقت الفتح: </span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{fmtTime(shift.opened_at)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              النقد الفعلي في الصندوق ($) *
            </label>
            <input
              type="number" min="0" step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-xl border text-xl font-black focus:outline-none"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              اعدّ النقود الموجودة في الصندوق وأدخل المبلغ
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>ملاحظة (اختياري)</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none resize-none"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !cash}
              className="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#ef4444' }}
            >
              <Square size={15} />
              {mut.isPending ? 'جارٍ الإغلاق...' : 'إغلاق الوردية'}
            </button>
            <button onClick={onClose}
              className="px-5 py-3 rounded-xl font-black text-sm"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shift Summary Modal (after close) ────────────────────────────────────────
function SummaryModal({ summary, onClose }: { summary: ShiftSummary; onClose: () => void }) {
  const diff     = parseFloat(summary.difference);
  const isMatch  = Math.abs(diff) < 0.01;
  const isExcess = diff > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-[480px] rounded-2xl shadow-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <CheckCircle2 size={18} className="text-emerald-500" /> ملخص الوردية #{summary.id}
          </h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'عدد الفواتير',      value: String(summary.sales_count), icon: <TrendingUp size={16}/>, color: '#3b82f6' },
            { label: 'إجمالي المبيعات',   value: fmtUSD(summary.sales_total), icon: <DollarSign size={16}/>, color: '#10b981' },
            { label: 'مبيعات نقدية',      value: fmtUSD(summary.cash_total),  icon: <DollarSign size={16}/>, color: '#f59e0b' },
            { label: 'شام كاش',           value: fmtUSD(summary.card_total),  icon: <CreditCard size={16}/>, color: '#8b5cf6' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}20`, color }}>
                {icon}
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
                <div className="text-sm font-black tabular-nums" style={{ color: 'var(--text-heading)' }}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Cash reconciliation */}
        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-black mb-3" style={{ color: 'var(--text-muted)' }}>تسوية الصندوق</div>
          <div className="space-y-2">
            {[
              { label: 'رصيد الافتتاح',          value: fmtUSD(summary.opening_balance) },
              { label: 'المبيعات النقدية',        value: fmtUSD(summary.cash_total) },
              { label: 'النقد المتوقع في الصندوق', value: fmtUSD(summary.expected_cash) },
              { label: 'النقد الفعلي المعدود',     value: fmtUSD(summary.closing_cash_counted) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Difference badge */}
        <div
          className="rounded-xl p-3 text-center font-black text-base mb-4"
          style={{
            background: isMatch ? 'rgba(16,185,129,0.1)' : isExcess ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)',
            color: isMatch ? '#059669' : isExcess ? '#3b82f6' : '#ef4444',
            border: `1px solid ${isMatch ? 'rgba(16,185,129,0.3)' : isExcess ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          {isMatch ? '✓ الصندوق مطابق تماماً' : isExcess ? `↑ زيادة ${fmtUSD(diff)}` : `↓ عجز ${fmtUSD(Math.abs(diff))}`}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => ShiftSummaryPrint(summary)}
            className="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            <Printer size={15} /> طباعة التقرير
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl font-black text-sm"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShiftsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [showOpen,    setShowOpen]    = useState(false);
  const [showClose,   setShowClose]   = useState(false);
  const [closedSummary, setClosedSummary] = useState<ShiftSummary | null>(null);
  const [historyView, setHistoryView]  = useState<'open' | 'closed' | 'all'>('all');

  const { data: currentData, isLoading: loadingCurrent } = useQuery({
    queryKey: ['current-shift'],
    queryFn:  () => shiftsApi.getCurrent().then((r) => r.data.shift),
    refetchInterval: 30000,
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['shifts-list', historyView],
    queryFn:  () => shiftsApi.getAll({
      status: historyView === 'all' ? undefined : historyView,
      limit:  50,
    }).then((r) => r.data.shifts),
    enabled: !!user && ['admin', 'manager'].includes(user.role),
  });

  const currentShift = currentData ?? null;
  const isAdmin = user && ['admin', 'manager'].includes(user.role);

  return (
    <div className="p-6" dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text-heading)' }}>
          الورديات
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          إدارة ورديات الكاشير وتسوية الصندوق في نهاية كل وردية
        </p>
      </div>

      {/* Current Shift Card */}
      <div className="mb-6">
        {loadingCurrent ? (
          <div className="flex justify-center py-10">
            <RefreshCw className="animate-spin" size={28} style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : currentShift ? (
          <div
            className="rounded-2xl p-6"
            style={{
              background: 'rgba(16,185,129,0.06)',
              border: '2px solid rgba(16,185,129,0.3)',
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(16,185,129,0.15)' }}>
                  <Clock size={26} className="text-emerald-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                      وردية مفتوحة
                    </span>
                    <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                      #{currentShift.id}
                    </span>
                  </div>
                  <div className="text-lg font-black" style={{ color: 'var(--text-heading)' }}>
                    {currentShift.cashier_name}
                    {currentShift.terminal_name && (
                      <span className="text-sm font-normal mr-2" style={{ color: 'var(--text-muted)' }}>
                        · {currentShift.terminal_name}
                      </span>
                    )}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    مفتوحة منذ: {fmtTime(currentShift.opened_at)} ({dur(currentShift.opened_at)})
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>رصيد الافتتاح</div>
                  <div className="text-xl font-black text-emerald-600">{fmtUSD(currentShift.opening_balance)}</div>
                </div>
                <button
                  onClick={() => setShowClose(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-black"
                  style={{ background: '#ef4444' }}
                >
                  <Square size={16} />
                  إغلاق الوردية
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-6 flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '2px dashed var(--border)' }}
          >
            <div>
              <div className="text-base font-black mb-1" style={{ color: 'var(--text-heading)' }}>
                لا توجد وردية مفتوحة
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                افتح وردية جديدة للبدء بتسجيل المبيعات
              </div>
            </div>
            <button
              onClick={() => setShowOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-black"
              style={{ background: '#059669' }}
            >
              <Play size={16} />
              فتح وردية جديدة
            </button>
          </div>
        )}
      </div>

      {/* History — admin/manager only */}
      {isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
              سجل الورديات
            </h2>
            <div className="flex gap-2">
              {(['all', 'open', 'closed'] as const).map((v) => (
                <button key={v} onClick={() => setHistoryView(v)}
                  className="px-4 py-1.5 rounded-xl text-xs font-black transition-colors"
                  style={historyView === v
                    ? { background: 'var(--primary)', color: '#fff' }
                    : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {v === 'all' ? 'الكل' : v === 'open' ? 'مفتوحة' : 'مغلقة'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {/* Table header */}
                       <div
              className="grid gap-2 px-4 py-2.5 text-xs font-black border-b"
              style={{
                background: 'var(--bg-muted)',
                color: 'var(--text-muted)',
                borderColor: 'var(--border)',
                gridTemplateColumns: '0.7fr 2fr 1.6fr 1.6fr 0.9fr 1.4fr 1.1fr 1fr 1fr 0.8fr',
              }}
            >
              <div>#</div>
              <div>الكاشير</div>
              <div>وقت الفتح</div>
              <div>وقت الإغلاق</div>
              <div className="text-center">الفواتير</div>
              <div className="text-center">المبيعات</div>
              <div className="text-center">الافتتاح</div>
              <div className="text-center">الفرق</div>
              <div className="text-center">الحالة</div>
              <div className="text-center">تقرير</div>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center py-12" style={{ background: 'var(--bg-card)' }}>
                <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : (historyData ?? []).length === 0 ? (
              <div className="py-14 text-center text-sm" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                لا توجد ورديات
              </div>
            ) : (
              (historyData ?? []).map((s, i) => {
                const diff = parseFloat(s.difference);
                const diffColor = Math.abs(diff) < 0.01 ? '#10b981' : diff > 0 ? '#3b82f6' : '#ef4444';

                const salesCount = Number((s as any).sales_count ?? 0);
                const salesTotal = (s as any).sales_total ?? '0';

                return (
                  <div
                    key={s.id}
                    className="grid gap-2 px-4 py-3 items-center border-b text-sm"
                    style={{
                      background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-muted)',
                      borderColor: 'var(--border)',
                      gridTemplateColumns: '0.7fr 2fr 1.6fr 1.6fr 0.9fr 1.4fr 1.1fr 1fr 1fr 0.8fr',
                    }}
                  >
                    <div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      #{s.id}
                    </div>

                    <div>
                      <div className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {s.cashier_name}
                      </div>
                      {s.terminal_name && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {s.terminal_name}
                        </div>
                      )}
                    </div>

                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {fmtTime(s.opened_at)}
                    </div>

                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {s.closed_at ? fmtTime(s.closed_at) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </div>

                    <div className="text-center font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {salesCount}
                    </div>

                    <div className="text-center font-black tabular-nums text-xs" style={{ color: '#059669' }}>
                      {fmtUSD(salesTotal)}
                    </div>

                    <div className="text-center font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtUSD(s.opening_balance)}
                    </div>

                    <div className="text-center font-black tabular-nums text-xs" style={{ color: diffColor }}>
                      {s.status === 'open'
                        ? '—'
                        : Math.abs(diff) < 0.01
                        ? '✓'
                        : diff > 0
                        ? `+${fmtUSD(diff)}`
                        : fmtUSD(diff)}
                    </div>

                    <div className="flex justify-center">
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded-full"
                        style={
                          s.status === 'open'
                            ? { background: 'rgba(16,185,129,0.15)', color: '#059669' }
                            : { background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                        }
                      >
                        {s.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                      </span>
                    </div>

                    <div className="flex justify-center">
                      {s.status === 'closed' && (
                        <button
                          onClick={async () => {
                            const res = await shiftsApi.getSummary(s.id);
                            ShiftSummaryPrint(res.data.summary);
                          }}
                          className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                          style={{ background: 'var(--bg-muted)', color: 'var(--primary)' }}
                          title="طباعة التقرير"
                        >
                          <Printer size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showOpen   && <OpenShiftModal   onClose={() => setShowOpen(false)} onOpened={() => setShowOpen(false)} />}
      {showClose  && currentShift && (
        <CloseShiftModal
          shift={currentShift}
          onClose={() => setShowClose(false)}
          onClosed={(summary) => { setShowClose(false); setClosedSummary(summary); }}
        />
      )}
      {closedSummary && (
        <SummaryModal summary={closedSummary} onClose={() => setClosedSummary(null)} />
      )}
    </div>
  );
}
