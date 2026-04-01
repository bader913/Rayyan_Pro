import React, { useState } from 'react';
import { X, CreditCard, ChevronLeft, ChevronRight, Truck, Phone, Printer } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { suppliersApi } from '../api/suppliers.ts';
import { settingsApi } from '../api/settings.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { printAccountStatementA4 } from '../utils/accountStatementPrint.ts';
const CURRENCIES = [
  { code: 'USD', label: 'دولار أمريكي', symbol: '$',   rateKey: '' },
  { code: 'SYP', label: 'ليرة سورية',  symbol: 'ل.س', rateKey: 'usd_to_syp' },
  { code: 'TRY', label: 'ليرة تركية',  symbol: 'TL',   rateKey: 'usd_to_try' },
  { code: 'SAR', label: 'ريال سعودي',  symbol: 'ر.س', rateKey: 'usd_to_sar' },
  { code: 'AED', label: 'درهم إماراتي',symbol: 'د.إ', rateKey: 'usd_to_aed' },
];

const TX_LABELS: Record<string, string> = {
  purchase: 'مشتريات',
  payment: 'دفعة',
  return: 'مرتجع شراء',
  adjustment: 'تعديل',
};
const TX_COLOR: Record<string, string> = {
  purchase: 'text-red-400',
  payment: 'text-green-400',
  return: 'text-blue-400',
  adjustment: 'text-yellow-400',
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Props {
  supplierId: number;
  supplierName: string;
  onClose: () => void;
}

export default function SupplierLedgerModal({ supplierId, supplierName, onClose }: Props) {
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [page, setPage]     = useState(1);
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', currency_code: 'USD', exchange_rate: '1', note: '' });
  const [payErr, setPayErr]   = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => settingsApi.getAll().then(r => r.data.settings),
    staleTime: 60_000,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['supplier-ledger', supplierId, page],
    queryFn:  () => suppliersApi.getAccount(supplierId, page).then(r => r.data),
    staleTime: 10_000,
  });

  const supplier    = data?.supplier;
  const transactions = data?.transactions ?? [];
  const totalPages  = Math.ceil((data?.total ?? 0) / 30);
  const balance     = parseFloat(String(supplier?.balance ?? '0'));

  function getRateFromSettings(currCode: string): number {
    if (currCode === 'USD' || !settingsData) return 1;
    const key = CURRENCIES.find(c => c.code === currCode)?.rateKey ?? '';
    return parseFloat((settingsData as Record<string, string>)[key] ?? '1') || 1;
  }

  const payMutation = useMutation({
    mutationFn: () => {
      const amount = parseFloat(payForm.amount);
      const rate   = parseFloat(payForm.exchange_rate) || 1;
      return suppliersApi.addPayment(supplierId, {
        amount,
        currency_code: payForm.currency_code,
        exchange_rate: rate,
        note:          payForm.note || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-ledger', supplierId] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      refetch();
      setShowPay(false);
      setPayForm({ amount: '', currency_code: 'USD', exchange_rate: '1', note: '' });
      setPayErr('');
    },
    onError: (e: unknown) => {
      if (axios.isAxiosError(e)) setPayErr(e.response?.data?.message ?? 'حدث خطأ');
    },
  });

  function handleCurrChange(code: string) {
    const rate = getRateFromSettings(code);
    setPayForm(f => ({ ...f, currency_code: code, exchange_rate: String(rate) }));
  }

  function submitPay(e: React.FormEvent) {
    e.preventDefault();
    if (!parseFloat(payForm.amount)) { setPayErr('أدخل مبلغاً صحيحاً'); return; }
    setPayErr('');
    payMutation.mutate();
  }

  const payAmt  = parseFloat(payForm.amount) || 0;
  const payRate = parseFloat(payForm.exchange_rate) || 1;
  const amtUSD  = payForm.currency_code === 'USD' ? payAmt : payAmt / payRate;
  const newBal  = balance - amtUSD;
  const currSym = CURRENCIES.find(c => c.code === payForm.currency_code)?.symbol ?? payForm.currency_code;


  // printer
    const handlePrintLedger = async () => {
    if (isPrinting) return;

    try {
      setIsPrinting(true);

      const esc = (v: unknown) =>
        String(v ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      let allTransactions = [...transactions];

      if (totalPages > 1) {
        const pages = await Promise.all(
          Array.from({ length: totalPages }, (_, i) =>
            suppliersApi.getAccount(supplierId, i + 1).then(r => r.data)
          )
        );

        allTransactions = pages.flatMap(pageData => pageData?.transactions ?? []);
      }

      const rows = allTransactions
        .map((tx: any) => `
          <tr>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${esc(fmtDate(tx.created_at))}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;color:#2563eb;">
              ${esc(TX_LABELS[tx.transaction_type] ?? tx.transaction_type)}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;">
              ${parseFloat(tx.debit_amount) > 0 ? esc(fmt(tx.debit_amount)) : '—'}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;">
              ${parseFloat(tx.credit_amount) > 0 ? esc(fmt(tx.credit_amount)) : '—'}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:800;color:#111827;">
              ${esc(fmt(tx.balance_after))}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#4b5563;">
              ${esc(tx.note ?? '—')}
            </td>
          </tr>
        `)
        .join('');

      const balanceLabel =
        balance > 0
          ? `${esc(fmt(balance))} (علينا للمورد)`
          : balance < 0
            ? `${esc(fmt(Math.abs(balance)))} (بذمة المورد)`
            : 'لا يوجد رصيد';

      printAccountStatementA4({
        title: 'كشف حساب مورد',
        subjectName: supplier?.name ?? supplierName,
        generatedAt: fmtDate(new Date().toISOString()),
        printedRowsCount: allTransactions.length,
        cards: [
          { label: 'المورد', value: supplier?.name ?? supplierName },
          { label: 'الهاتف', value: supplier?.phone ?? '—' },
          { label: 'الرصيد الحالي', value: balanceLabel },
          { label: 'إجمالي الحركات', value: String(data?.total ?? allTransactions.length) },
        ],
        rowsHtml: rows,
        footerText: 'تم إنشاء هذه الطباعة من كشف الحساب الكامل للمورد.',
      });
    } finally {
      setIsPrinting(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center">
              <Truck size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {supplier?.name ?? supplierName}
              </h2>
              <div className="flex items-center gap-3 text-sm mt-0.5">
                {supplier?.phone && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <Phone size={11} /> {supplier.phone}
                  </span>
                )}
                <span className="text-slate-400">
                  الرصيد:&nbsp;
                  {balance > 0
                    ? <span className="text-red-400 font-bold">{fmt(balance)} (علينا للمورد)</span>
                    : balance < 0
                      ? <span className="text-green-400 font-bold">{fmt(Math.abs(balance))} (بذمة المورد)</span>
                      : <span className="text-slate-500">لا يوجد رصيد</span>
                  }
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintLedger}
              disabled={isLoading || isPrinting}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition disabled:opacity-40"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              <Printer size={15} /> {isPrinting ? 'جاري تجهيز الطباعة...' : 'طباعة'}
            </button>

            {!showPay && (
              <button
                onClick={() => setShowPay(true)}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg transition"
              >
                <CreditCard size={15} /> تسجيل دفعة
              </button>
            )}

            <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Payment Form */}
        {showPay && (
          <div className="p-5 border-b border-slate-700 bg-slate-800/50 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-sm">تسجيل دفعة — {supplier?.name ?? supplierName}</h3>
              <button onClick={() => { setShowPay(false); setPayErr(''); }} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitPay} className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">المبلغ *</label>
                <input
                  type="number" step="any" min="0"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">العملة</label>
                <select
                  value={payForm.currency_code}
                  onChange={e => handleCurrChange(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                >
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label} ({c.symbol})</option>)}
                </select>
              </div>
              {payForm.currency_code !== 'USD' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">سعر الصرف (1 USD = ؟ {payForm.currency_code})</label>
                  <input
                    type="number" step="any" min="0"
                    value={payForm.exchange_rate}
                    onChange={e => setPayForm(f => ({ ...f, exchange_rate: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                  />
                </div>
              )}
              <div className={payForm.currency_code !== 'USD' ? '' : 'col-span-2'}>
                <label className="block text-xs text-slate-400 mb-1">ملاحظة</label>
                <input
                  type="text"
                  value={payForm.note}
                  onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                  placeholder="اختياري..."
                />
              </div>
              {payAmt > 0 && (
                <div className="col-span-2 rounded-lg bg-slate-700/60 border border-slate-600 px-3 py-2 text-xs text-slate-300 flex justify-between">
                  <span>المبلغ بالدولار: <strong className="text-white">${amtUSD.toFixed(2)}</strong></span>
                  <span>الرصيد بعد الدفعة: <strong className={newBal > 0 ? 'text-red-400' : newBal < 0 ? 'text-green-400' : 'text-slate-300'}>{fmt(Math.abs(newBal))} {newBal > 0 ? '(علينا)' : newBal < 0 ? '(بذمة المورد)' : ''}</strong></span>
                </div>
              )}
              {payErr && <div className="col-span-2 text-xs text-red-400">{payErr}</div>}
              <div className="col-span-2 flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowPay(false); setPayErr(''); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-600 rounded-lg transition">إلغاء</button>
                <button type="submit" disabled={payMutation.isPending} className="px-4 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition">
                  {payMutation.isPending ? 'جاري...' : `تأكيد الدفعة${payAmt > 0 ? ` (${payAmt.toLocaleString('en-US')} ${currSym})` : ''}`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Transactions Table */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <p className="text-center text-slate-500 py-10">جاري التحميل...</p>
          ) : transactions.length === 0 ? (
            <p className="text-center text-slate-500 py-10">لا توجد حركات لهذا المورد</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-right border-b border-slate-700">
                  <th className="pb-2 font-semibold">التاريخ</th>
                  <th className="pb-2 font-semibold">النوع</th>
                  <th className="pb-2 text-left font-semibold">مدين</th>
                  <th className="pb-2 text-left font-semibold">دائن</th>
                  <th className="pb-2 text-left font-semibold">الرصيد</th>
                  <th className="pb-2 font-semibold">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 text-slate-400 text-xs">{fmtDate(tx.created_at)}</td>
                    <td className={`py-2.5 font-semibold text-xs ${TX_COLOR[tx.transaction_type] ?? 'text-slate-300'}`}>
                      {TX_LABELS[tx.transaction_type] ?? tx.transaction_type}
                    </td>
                    <td className="py-2.5 text-left text-red-300 text-xs">{parseFloat(tx.debit_amount) > 0 ? fmt(tx.debit_amount) : '—'}</td>
                    <td className="py-2.5 text-left text-green-300 text-xs">{parseFloat(tx.credit_amount) > 0 ? fmt(tx.credit_amount) : '—'}</td>
                    <td className="py-2.5 text-left text-white font-semibold text-xs">{fmt(tx.balance_after)}</td>
                    <td className="py-2.5 text-slate-400 text-xs max-w-[150px] truncate">{tx.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-700 flex-shrink-0">
            <span className="text-sm text-slate-400">صفحة {page} من {totalPages} · {data?.total ?? 0} حركة</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded bg-slate-700 disabled:opacity-40 hover:bg-slate-600 transition">
                <ChevronRight size={16} className="text-white" />
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded bg-slate-700 disabled:opacity-40 hover:bg-slate-600 transition">
                <ChevronLeft size={16} className="text-white" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
