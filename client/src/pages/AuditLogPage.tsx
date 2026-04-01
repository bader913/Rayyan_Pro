import React, { useState, useEffect } from 'react';
import { auditLogsApi, type AuditLogRow } from '../api/auditLogs.ts';
import { Shield, Search, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';

const today     = new Date().toISOString().split('T')[0];
const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ar-EG-u-nu-latn', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

/* Semi-transparent tints — work well in both light and dark mode */
const ACTION_BADGE: Record<string, { bg: string; color: string }> = {
  login:           { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  logout:          { bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
  create:          { bg: 'rgba(59,130,246,0.12)',  color: '#2563eb' },
  update:          { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  delete:          { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  activate:        { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  deactivate:      { bg: 'rgba(249,115,22,0.12)',  color: '#ea580c' },
  change_password: { bg: 'rgba(139,92,246,0.12)', color: '#7c3aed' },
  payment:         { bg: 'rgba(6,182,212,0.12)',   color: '#0891b2' },
  bulk_update:     { bg: 'rgba(99,102,241,0.12)',  color: '#4f46e5' },
};

const ACTION_LABELS: Record<string, string> = {
  login: 'دخول', logout: 'خروج', create: 'إنشاء', update: 'تعديل',
  delete: 'حذف', activate: 'تفعيل', deactivate: 'تعطيل',
  change_password: 'تغيير كلمة مرور', payment: 'دفعة', bulk_update: 'تعديل جماعي',
};
const ENTITY_LABELS: Record<string, string> = {
  auth: 'المصادقة', user: 'مستخدم', product: 'منتج', sale: 'مبيعة',
  purchase: 'مشترى', customer: 'عميل', supplier: 'مورد', setting: 'إعداد',
};

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_BADGE[action] ?? { bg: 'rgba(100,116,139,0.12)', color: '#64748b' };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

export default function AuditLogPage() {
  const [from,       setFrom]       = useState(weekStart);
  const [to,         setTo]         = useState(today);
  const [action,     setAction]     = useState('');
  const [entityType, setEntityType] = useState('');
  const [page,       setPage]       = useState(1);

  const [rows,        setRows]        = useState<AuditLogRow[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [actions,     setActions]     = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [detail,      setDetail]      = useState<AuditLogRow | null>(null);

  const limit = 50;

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await auditLogsApi.list({
        from, to,
        action:      action      || undefined,
        entity_type: entityType  || undefined,
        page:        p,
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    auditLogsApi.meta()
      .then(m => { setActions(m.data.actions); setEntityTypes(m.data.entityTypes); })
      .catch(() => {});
    load(1);
  }, []);

  const handleSearch = () => { setPage(1); load(1); };
  const totalPages   = Math.ceil(total / limit);

  const inputCls = [
    'rounded-xl px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-violet-500',
  ].join(' ');
  const inputStyle = {
    background:   'var(--bg-input)',
    borderColor:  'var(--border)',
    color:        'var(--text-heading)',
  };

  return (
    <div className="p-6 space-y-5" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-7 h-7 text-violet-500" />
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>سجل العمليات</h1>
        <span className="text-sm mr-auto" style={{ color: 'var(--text-muted)' }}>
          {total.toLocaleString('en-US')} سجل
        </span>
      </div>

      {/* Filters */}
      <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>من</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>إلى</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>العملية</label>
            <select value={action} onChange={e => setAction(e.target.value)}
              className={inputCls} style={inputStyle}>
              <option value="">الكل</option>
              {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>نوع الكيان</label>
            <select value={entityType} onChange={e => setEntityType(e.target.value)}
              className={inputCls} style={inputStyle}>
              <option value="">الكل</option>
              {entityTypes.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>)}
            </select>
          </div>
          <button onClick={handleSearch} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition hover:opacity-90"
            style={{ background: '#7c3aed' }}>
            <Search className="w-4 h-4" />
            {loading ? 'جاري...' : 'بحث'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
              {['المستخدم', 'العملية', 'الكيان', 'رقم الكيان', 'IP', 'الوقت', ''].map(h => (
                <th key={h} className="px-4 py-3 text-right text-xs font-black"
                  style={{ color: 'var(--text-secondary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
                  جاري التحميل...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
                  لا توجد سجلات
                </td>
              </tr>
            )}
            {!loading && rows.map(r => (
              <tr key={r.id} className="border-t transition-colors"
                style={{ borderColor: 'var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td className="px-4 py-2.5">
                  <p className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>{r.user_name ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.username ?? ''}</p>
                </td>
                <td className="px-4 py-2.5">
                  <ActionBadge action={r.action} />
                </td>
                <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-body)' }}>
                  {ENTITY_LABELS[r.entity_type] ?? r.entity_type}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {r.entity_id ?? '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {r.ip_address ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {fmtDate(r.created_at)}
                </td>
                <td className="px-4 py-2.5">
                  {(r.old_data || r.new_data) && (
                    <button onClick={() => setDetail(r)}
                      className="p-1.5 rounded-lg transition hover:bg-violet-100"
                      style={{ color: 'var(--text-muted)' }}
                      title="عرض التفاصيل">
                      <Info className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <button disabled={page <= 1}
            onClick={() => { setPage(page - 1); load(page - 1); }}
            className="p-2 rounded-xl border transition disabled:opacity-40 hover:opacity-80"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm px-3" style={{ color: 'var(--text-secondary)' }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages}
            onClick={() => { setPage(page + 1); load(page + 1); }}
            className="p-2 rounded-xl border transition disabled:opacity-40 hover:opacity-80"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setDetail(null)}>
          <div className="rounded-2xl p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                <Shield className="w-4 h-4 text-violet-500" />
                تفاصيل السجل #{detail.id}
              </h3>
              <button onClick={() => setDetail(null)}
                className="p-1.5 rounded-lg transition hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {detail.old_data && (
              <div className="mb-3">
                <p className="text-xs font-black uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--text-muted)' }}>البيانات القديمة</p>
                <pre className="rounded-xl p-3 text-xs text-red-500 overflow-auto"
                  style={{ background: 'var(--bg-muted)' }}>
                  {JSON.stringify(detail.old_data, null, 2)}
                </pre>
              </div>
            )}
            {detail.new_data && (
              <div>
                <p className="text-xs font-black uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--text-muted)' }}>البيانات الجديدة</p>
                <pre className="rounded-xl p-3 text-xs text-emerald-500 overflow-auto"
                  style={{ background: 'var(--bg-muted)' }}>
                  {JSON.stringify(detail.new_data, null, 2)}
                </pre>
              </div>
            )}

            <button onClick={() => setDetail(null)}
              className="mt-4 w-full py-2 rounded-xl text-sm font-bold transition hover:opacity-80 border"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
