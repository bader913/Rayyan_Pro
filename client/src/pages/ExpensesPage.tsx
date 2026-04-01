import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Plus, Trash2, Edit2, X, Check,
  TrendingDown, Calendar, RefreshCw, ChevronDown,
} from 'lucide-react';
import { expensesApi, type Expense, type CreateExpenseInput } from '../api/expenses.ts';
import { useCurrency } from '../hooks/useCurrency.ts';

const PRESET_CATEGORIES = ['إيجار', 'رواتب', 'كهرباء وماء', 'صيانة', 'شحن ونقل', 'تسويق', 'ضرائب', 'عام', 'أخرى'];

const today = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

const EMPTY_FORM: Omit<CreateExpenseInput, 'exchange_rate'> & { exchange_rate: string } = {
  title:         '',
  category:      'عام',
  amount:        0,
  currency:      'USD',
  exchange_rate: '1',
  expense_date:  today(),
  notes:         '',
};

export default function ExpensesPage() {
  const { fmt, currency: userCurrency, rate: userRate } = useCurrency();
  const qc = useQueryClient();

  const [from,      setFrom]      = useState(firstOfMonth());
  const [to,        setTo]        = useState(today());
  const [catFilter, setCatFilter] = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState<number | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY_FORM });
  const [deleteId,  setDeleteId]  = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['expenses', from, to, catFilter],
    queryFn:  () => expensesApi.getAll({
      from, to,
      ...(catFilter ? { category: catFilter } : {}),
    }).then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (d: CreateExpenseInput) => expensesApi.create(d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['expenses'] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<CreateExpenseInput> }) => expensesApi.update(id, d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['expenses'] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setDeleteId(null); },
  });

  const closeForm = () => { setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM }); };

  const openEdit = (exp: Expense) => {
    setEditId(exp.id);
    setForm({
      title:         exp.title,
      category:      exp.category,
      amount:        parseFloat(exp.amount),
      currency:      exp.currency,
      exchange_rate: exp.exchange_rate,
      expense_date:  exp.expense_date.split('T')[0],
      notes:         exp.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateExpenseInput = {
      ...form,
      amount:        Number(form.amount),
      exchange_rate: parseFloat(form.exchange_rate) || 1,
    };
    if (editId) updateMut.mutate({ id: editId, d: payload });
    else        createMut.mutate(payload);
  };

  const expenses     = data?.expenses     ?? [];
  const totalUsd     = data?.total_usd    ?? 0;
  const byCategory   = data?.by_category  ?? [];

  const CURRENCIES = ['USD', 'SYP', 'TRY', 'SAR', 'AED'];

  return (
    <div className="p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text-heading)' }}>
            المصاريف
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            تسجيل وإدارة مصاريف المحل (إيجارات، صيانة، رواتب، وغيرها)
          </p>
        </div>
        <button
          onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-black text-sm"
          style={{ background: 'var(--primary)' }}
        >
          <Plus size={16} />
          إضافة مصروف
        </button>
      </div>

      {/* Filters */}
      <div
        className="rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div>
          <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>من</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm focus:outline-none"
            style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>إلى</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm focus:outline-none"
            style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>الفئة</div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm font-bold focus:outline-none"
            style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <option value="">كل الفئات</option>
            {PRESET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl transition-colors"
          style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="lg:col-span-2 rounded-2xl p-5 flex items-center gap-4"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
            <TrendingDown size={22} className="text-red-500" />
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>إجمالي المصاريف</div>
            <div className="text-2xl font-black tabular-nums text-red-500">
              {fmt(totalUsd)}
            </div>
          </div>
        </div>
        {byCategory.slice(0, 2).map((bc) => (
          <div key={bc.category} className="rounded-2xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>{bc.category}</div>
            <div className="text-lg font-black text-red-400">{fmt(parseFloat(bc.total_usd))}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{bc.count} عملية</div>
          </div>
        ))}
      </div>

      {/* Expenses List */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-black border-b"
          style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
          <div className="col-span-4">العنوان / الفئة</div>
          <div className="col-span-2 text-center">التاريخ</div>
          <div className="col-span-2 text-center">المبلغ</div>
          <div className="col-span-2 text-center">ما يعادل $</div>
          <div className="col-span-2 text-center">إجراءات</div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12" style={{ background: 'var(--bg-card)' }}>
            <RefreshCw className="animate-spin" size={28} style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            <Receipt size={40} />
            <span className="text-sm">لا توجد مصاريف في هذه الفترة</span>
          </div>
        ) : (
          expenses.map((exp, i) => (
            <div key={exp.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b"
              style={{
                background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-muted)',
                borderColor: 'var(--border)',
              }}>
              <div className="col-span-4">
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{exp.title}</div>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                  {exp.category}
                </span>
              </div>
              <div className="col-span-2 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                {exp.expense_date.split('T')[0]}
              </div>
              <div className="col-span-2 text-center text-sm font-bold text-red-500">
                {parseFloat(exp.amount).toLocaleString()} {exp.currency}
              </div>
              <div className="col-span-2 text-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                ${parseFloat(exp.amount_usd).toFixed(2)}
              </div>
              <div className="col-span-2 flex items-center justify-center gap-2">
                <button onClick={() => openEdit(exp)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: 'var(--bg-muted)', color: 'var(--primary)' }}>
                  <Edit2 size={13} />
                </button>
                <button onClick={() => setDeleteId(exp.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600"
                  style={{ background: 'var(--bg-muted)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Add/Edit Form Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-[480px] rounded-2xl shadow-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
                {editId ? 'تعديل مصروف' : 'إضافة مصروف جديد'}
              </h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>العنوان *</label>
                <input required type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="مثال: إيجار شهر مارس"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                  style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>الفئة</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    {PRESET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>التاريخ</label>
                  <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>المبلغ *</label>
                  <input required type="number" min="0.01" step="0.01" value={form.amount || ''}
                    onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>العملة</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>سعر الصرف</label>
                  <input type="number" min="0.0001" step="0.0001" value={form.exchange_rate}
                    onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                    placeholder="1"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              {form.amount > 0 && (
                <div className="text-xs font-bold text-center" style={{ color: 'var(--text-muted)' }}>
                  يعادل: ${(Number(form.amount) / (parseFloat(form.exchange_rate) || 1)).toFixed(2)}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>ملاحظات</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none resize-none"
                  style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 py-2.5 rounded-xl text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'var(--primary)' }}>
                  <Check size={15} />
                  {editId ? 'حفظ التعديلات' : 'إضافة المصروف'}
                </button>
                <button type="button" onClick={closeForm}
                  className="px-5 py-2.5 rounded-xl font-black text-sm"
                  style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-[320px] rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h3 className="font-black text-base mb-1" style={{ color: 'var(--text-heading)' }}>حذف المصروف</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>هل أنت متأكد من حذف هذا المصروف؟</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-white font-black text-sm disabled:opacity-50"
                style={{ background: '#ef4444' }}>حذف</button>
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl font-black text-sm"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
