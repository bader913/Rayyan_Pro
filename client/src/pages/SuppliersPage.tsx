import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce.ts';
import { suppliersApi, type Supplier, type SupplierTransaction } from '../api/suppliers.ts';
import { settingsApi } from '../api/settings.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { printAccountStatementA4 } from '../utils/accountStatementPrint.ts';
import { printPaymentReceiptA4 } from '../utils/paymentReceiptPrint.ts';
import {
  Truck,
  Plus,
  Search,
  Eye,
  CreditCard,
  X,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Info,
  Filter,
  Printer,
} from 'lucide-react';

const surfaceCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

const subtleCard: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-color)',
};

const text = {
  heading: { color: 'var(--text-heading)' } as React.CSSProperties,
  body: { color: 'var(--text-color)' } as React.CSSProperties,
  secondary: { color: 'var(--text-secondary)' } as React.CSSProperties,
  muted: { color: 'var(--text-muted)' } as React.CSSProperties,
};

const CURRENCIES = [
  { code: 'USD', label: 'دولار أمريكي', symbol: '$', rateKey: '' },
  { code: 'SYP', label: 'ليرة سورية', symbol: 'ل.س', rateKey: 'usd_to_syp' },
  { code: 'TRY', label: 'ليرة تركية', symbol: 'TL', rateKey: 'usd_to_try' },
  { code: 'SAR', label: 'ريال سعودي', symbol: 'ر.س', rateKey: 'usd_to_sar' },
];

function getRateFromSettings(settings: Record<string, string> | undefined, code: string): number {
  if (code === 'USD' || !settings) return 1;
  const key = CURRENCIES.find((c) => c.code === code)?.rateKey ?? '';
  return parseFloat(settings[key] ?? '1') || 1;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSupplierBalance(value: string | number | null | undefined) {
  return parseFloat(String(value ?? 0)) || 0;
}

function getPurchasesCount(value: string | number | null | undefined) {
  return parseInt(String(value ?? 0), 10) || 0;
}

function getPurchasesAmount(value: string | number | null | undefined) {
  return parseFloat(String(value ?? 0)) || 0;
}

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

export default function SuppliersPage() {
  const { fmt } = useCurrency();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30_000,
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<
    'name_asc' | 'name_desc' | 'highest_balance' | 'highest_purchases' | 'most_invoices' | 'newest'
  >('name_asc');
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [accountModal, setAccountModal] = useState<{
    supplier: Supplier;
    transactions: SupplierTransaction[];
    total: number;
    page: number;
  } | null>(null);
  const [acctLoading, setAcctLoading] = useState(false);
  const [accountPrinting, setAccountPrinting] = useState(false);

  const [payModal, setPayModal] = useState<Supplier | null>(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    currency_code: 'USD',
    exchange_rate: '1',
    note: '',
  });
  const [payErr, setPayErr] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [printReceiptAfterPayment, setPrintReceiptAfterPayment] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const loadSuppliers = useCallback(
    async (q = search, sort = sortBy) => {
      setLoading(true);
      try {
        const res = await suppliersApi.list({
          q: q || undefined,
          sort,
          limit: 50,
        });
        setSuppliers(res.data.suppliers);
      } catch {
        // ignore
      }
      setLoading(false);
    },
    [search, sortBy]
  );

  useEffect(() => {
    loadSuppliers(debouncedSearch, sortBy);
  }, [debouncedSearch, sortBy]);

  const openAccount = async (s: Supplier, page = 1) => {
    setAcctLoading(true);
    setAccountModal({ supplier: s, transactions: [], total: 0, page });
    try {
      const res = await suppliersApi.getAccount(s.id, page);
      setAccountModal({
        supplier: res.data.supplier,
        transactions: res.data.transactions,
        total: res.data.total,
        page: res.data.page,
      });
    } catch {
      // ignore
    }
    setAcctLoading(false);
  };
// printer
  const handlePrintAccount = async () => {
    if (!accountModal || accountPrinting) return;

    try {
      setAccountPrinting(true);

      const esc = (v: unknown) =>
        String(v ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const totalPages = Math.max(1, Math.ceil((accountModal.total || 0) / 30));

      let allTransactions = [...accountModal.transactions];
      let currentSupplier = accountModal.supplier;

      if (totalPages > 1) {
        const pages = await Promise.all(
          Array.from({ length: totalPages }, (_, i) =>
            suppliersApi.getAccount(accountModal.supplier.id, i + 1).then((r) => r.data)
          )
        );

        allTransactions = pages.flatMap((pageData) => pageData?.transactions ?? []);
        currentSupplier = pages[0]?.supplier ?? currentSupplier;
      }

      const htmlRows = allTransactions
        .map(
          (tx) => `
            <tr>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${esc(fmtDate(tx.created_at))}</td>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:800;color:#2563eb;">
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
          `
        )
        .join('');

      const balance = getSupplierBalance(currentSupplier.balance);
      const balanceLabel =
        balance > 0
          ? `${esc(fmt(balance))} (علينا للمورد)`
          : balance < 0
            ? `${esc(fmt(Math.abs(balance)))} (بذمة المورد)`
            : 'لا يوجد رصيد';

      printAccountStatementA4({
        title: 'كشف حساب مورد',
        subjectName: currentSupplier.name,
        generatedAt: fmtDate(new Date().toISOString()),
        printedRowsCount: allTransactions.length,
        cards: [
          { label: 'المورد', value: currentSupplier.name },
          { label: 'الهاتف', value: currentSupplier.phone ?? '—' },
          { label: 'العنوان', value: currentSupplier.address ?? '—' },
          { label: 'الرصيد الحالي', value: balanceLabel },
          { label: 'عدد فواتير الشراء', value: String(getPurchasesCount(currentSupplier.purchases_count)) },
          { label: 'إجمالي المشتريات', value: fmt(getPurchasesAmount(currentSupplier.total_purchases_amount)) },
        ],
        rowsHtml: htmlRows,
        footerText: 'تم إنشاء هذه الطباعة من نافذة كشف حساب المورد داخل صفحة الموردين.',
      });
    } finally {
      setAccountPrinting(false);
    }
  };
  const openForm = (s?: Supplier) => {
    setEditTarget(s ?? null);
    setForm({
      name: s?.name ?? '',
      phone: s?.phone ?? '',
      address: s?.address ?? '',
      notes: s?.notes ?? '',
    });
    setFormErr('');
    setShowForm(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormErr('');
    try {
      if (editTarget) {
        await suppliersApi.update(editTarget.id, {
          name: form.name,
          phone: form.phone || undefined,
          address: form.address || undefined,
          notes: form.notes || undefined,
        });
      } else {
        await suppliersApi.create({
          name: form.name,
          phone: form.phone || undefined,
          address: form.address || undefined,
          notes: form.notes || undefined,
        });
      }
      setShowForm(false);
      loadSuppliers(search, sortBy);
    } catch (err: unknown) {
      setFormErr((err as { message?: string }).message ?? 'حدث خطأ');
    }
    setSaving(false);
  };

  const openPay = (s: Supplier) => {
    const rate = getRateFromSettings(settingsData, 'USD');
    setPayModal(s);
    setPayForm({ amount: '', currency_code: 'USD', exchange_rate: String(rate), note: '' });
    setPayErr('');
    setPrintReceiptAfterPayment(false);
  };

  const handlePayCurrencyChange = (code: string) => {
    const rate = getRateFromSettings(settingsData, code);
    setPayForm((p) => ({ ...p, currency_code: code, exchange_rate: String(rate) }));
  };


  // print

    const printSupplierPaymentReceipt = (
    supplier: Supplier,
    payload: {
      amount: number;
      currency_code: string;
      exchange_rate: number;
      note?: string;
      balance_before: number;
      balance_after: number;
    }
  ) => {
    const currency = CURRENCIES.find(c => c.code === payload.currency_code);
    const currSym = currency?.symbol ?? payload.currency_code;

    const amountUSD =
      payload.currency_code === 'USD'
        ? payload.amount
        : payload.exchange_rate > 0
          ? payload.amount / payload.exchange_rate
          : 0;

    const receiptNumber = `SP-${supplier.id}-${Date.now()}`;

    const balanceBeforeLabel =
      payload.balance_before > 0
        ? `${fmt(payload.balance_before)} (علينا للمورد)`
        : payload.balance_before < 0
          ? `${fmt(Math.abs(payload.balance_before))} (بذمة المورد)`
          : 'لا يوجد رصيد';

    const balanceAfterLabel =
      payload.balance_after > 0
        ? `${fmt(payload.balance_after)} (متبقي علينا)`
        : payload.balance_after < 0
          ? `${fmt(Math.abs(payload.balance_after))} (بذمة المورد)`
          : 'صفر — مسدّد بالكامل';

    const paymentStatus =
      payload.balance_after < 0
        ? 'دفعة مع زيادة'
        : payload.balance_after > 0
          ? 'دفعة جزئية'
          : 'تسديد كامل';

    printPaymentReceiptA4({
      title: 'سند دفع',
      subjectName: supplier.name,
      generatedAt: fmtDate(new Date().toISOString()),
      receiptNumber,
      receiptTypeLabel: 'دفعة مورد',
      paymentStatus,
      note: payload.note,
      titleColor: '#2563eb',
      summaryAccentBg: '#eff6ff',
      summaryAccentColor: '#1d4ed8',
      cards: [
        { label: 'اسم المورد', value: supplier.name },
        { label: 'الهاتف', value: supplier.phone ?? '—' },
        { label: 'المبلغ المدفوع', value: `${payload.amount.toLocaleString('en-US')} ${currSym}` },
        { label: 'ما يعادل بالدولار', value: fmt(amountUSD) },
        { label: 'الرصيد قبل الدفعة', value: balanceBeforeLabel },
        { label: 'الرصيد بعد الدفعة', value: balanceAfterLabel },
        { label: 'العملة', value: `${payload.currency_code} — ${currSym}` },
        { label: 'سعر الصرف', value: payload.currency_code === 'USD' ? '1' : String(payload.exchange_rate) },
      ],
      summaryRows: [
        { label: 'المبلغ المسجل', value: `${payload.amount.toLocaleString('en-US')} ${currSym}` },
        { label: 'المبلغ بالدولار', value: fmt(amountUSD) },
        { label: 'نتيجة الدفعة', value: paymentStatus },
      ],
    });
  };
  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) {
      setPayErr('أدخل مبلغاً صحيحاً');
      return;
    }

    const currentSupplier = payModal!;
    const currentBalance = getSupplierBalance(currentSupplier.balance);
    const exchangeRate = parseFloat(payForm.exchange_rate) || 1;
    const amountUSD = payForm.currency_code === 'USD'
      ? amt
      : (exchangeRate > 0 ? amt / exchangeRate : 0);
    const newBalance = currentBalance - amountUSD;

    setPayLoading(true);
    setPayErr('');

    try {
      await suppliersApi.addPayment(currentSupplier.id, {
        amount: amt,
        currency_code: payForm.currency_code,
        exchange_rate: exchangeRate,
        note: payForm.note || undefined,
      });

      if (printReceiptAfterPayment) {
        printSupplierPaymentReceipt(currentSupplier, {
          amount: amt,
          currency_code: payForm.currency_code,
          exchange_rate: exchangeRate,
          note: payForm.note || undefined,
          balance_before: currentBalance,
          balance_after: newBalance,
        });
      }

      setPayModal(null);
      loadSuppliers(search, sortBy);

      if (accountModal && accountModal.supplier.id === currentSupplier.id) {
        openAccount({ ...currentSupplier }, accountModal.page);
      }
    } catch (err: unknown) {
      setPayErr((err as { message?: string }).message ?? 'حدث خطأ');
    }

    setPayLoading(false);
  };

  const totalDue = suppliers.reduce((sum, s) => {
    const balance = getSupplierBalance(s.balance);
    return balance > 0 ? sum + balance : sum;
  }, 0);

  const totalPurchases = suppliers.reduce((sum, s) => {
    return sum + getPurchasesAmount(s.total_purchases_amount);
  }, 0);

  const totalInvoices = suppliers.reduce((sum, s) => {
    return sum + getPurchasesCount(s.purchases_count);
  }, 0);

  const payableSuppliersCount = suppliers.filter((s) => getSupplierBalance(s.balance) > 0).length;
  const activeSuppliersCount = suppliers.filter((s) => getPurchasesCount(s.purchases_count) > 0).length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Truck className="w-7 h-7" style={{ color: '#f59e0b' }} />
          <h1 className="text-2xl font-black" style={text.heading}>
            الموردون
          </h1>
        </div>

        <button
          onClick={() => openForm()}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl font-semibold transition hover:opacity-90"
          style={{ background: '#f59e0b', color: '#111827' }}
        >
          <Plus className="w-4 h-4" />
          مورد جديد
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4" style={surfaceCard}>
          <p className="text-sm" style={text.secondary}>
            إجمالي المستحق للموردين
          </p>
          <p className="text-2xl font-bold mt-1 text-red-500">{fmt(totalDue)}</p>
        </div>

        <div className="rounded-2xl p-4" style={surfaceCard}>
          <p className="text-sm" style={text.secondary}>
            إجمالي المشتريات
          </p>
          <p className="text-2xl font-bold mt-1 text-blue-500">{fmt(totalPurchases)}</p>
        </div>

        <div className="rounded-2xl p-4" style={surfaceCard}>
          <p className="text-sm" style={text.secondary}>
            عدد فواتير الشراء
          </p>
          <p className="text-2xl font-bold mt-1 text-purple-500">{totalInvoices}</p>
        </div>

        <div className="rounded-2xl p-4" style={surfaceCard}>
          <p className="text-sm" style={text.secondary}>
            موردون لهم مستحقات علينا
          </p>
          <p className="text-2xl font-bold mt-1 text-amber-500">{payableSuppliersCount}</p>
          <p className="text-xs mt-1" style={text.muted}>
            من أصل {activeSuppliersCount} مورد نشط
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            className="w-full rounded-xl pr-10 pl-4 py-2 text-sm outline-none focus:border-amber-500"
            style={inputStyle}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <select
            value={sortBy}
            onChange={(e) => {
              const value = e.target.value as
                | 'name_asc'
                | 'name_desc'
                | 'highest_balance'
                | 'highest_purchases'
                | 'most_invoices'
                | 'newest';
              setSortBy(value);
              loadSuppliers(search, value);
            }}
            className="rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500"
            style={inputStyle}
          >
            <option value="name_asc">الاسم: أ → ي</option>
            <option value="name_desc">الاسم: ي → أ</option>
            <option value="highest_balance">الأكثر استحقاقًا</option>
            <option value="highest_purchases">الأكثر شراءً</option>
            <option value="most_invoices">الأكثر فواتير</option>
            <option value="newest">الأحدث</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={surfaceCard}>
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-right"
              style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
            >
              <th className="px-4 py-3">المورد</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">العنوان</th>
              <th className="px-4 py-3 text-left">الرصيد</th>
              <th className="px-4 py-3 text-left">عدد الفواتير</th>
              <th className="px-4 py-3 text-left">إجمالي الشراء</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-center">إجراءات</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12" style={text.muted}>
                  جاري التحميل...
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12" style={text.muted}>
                  لا يوجد موردون
                </td>
              </tr>
            ) : (
              suppliers.map((s) => {
                const balance = getSupplierBalance(s.balance);
                const purchasesCount = getPurchasesCount(s.purchases_count);
                const purchasesAmount = getPurchasesAmount(s.total_purchases_amount);

                return (
                  <tr key={s.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => openAccount(s)}
                          className="font-semibold hover:underline transition text-right"
                          style={{ color: '#f59e0b' }}
                        >
                          {s.name}
                        </button>

                        {s.notes && (
                          <span className="text-[11px] max-w-[220px] truncate" style={text.muted}>
                            {s.notes}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3" style={text.body}>
                      {s.phone ?? '—'}
                    </td>

                    <td className="px-4 py-3 max-w-xs truncate" style={text.muted}>
                      {s.address ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-left">
                      {balance > 0 ? (
                        <span className="font-semibold text-red-500">
                          {fmt(balance)}
                          <span className="text-xs mr-1">(علينا)</span>
                        </span>
                      ) : balance < 0 ? (
                        <span className="font-semibold text-green-500">
                          {fmt(Math.abs(balance))}
                          <span className="text-xs mr-1">(بذمته)</span>
                        </span>
                      ) : (
                        <span style={text.muted}>—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-left font-medium" style={text.body}>
                      {purchasesCount}
                    </td>

                    <td className="px-4 py-3 text-left font-medium" style={text.body}>
                      {purchasesAmount > 0 ? fmt(purchasesAmount) : <span style={text.muted}>—</span>}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {balance > 0 && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-red-600 dark:text-red-400"
                            style={subtleCard}
                          >
                            علينا للمورد
                          </span>
                        )}

                        {balance < 0 && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-green-600 dark:text-green-400"
                            style={subtleCard}
                          >
                            بذمة المورد
                          </span>
                        )}

                        {purchasesCount >= 5 && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-blue-600 dark:text-blue-400"
                            style={subtleCard}
                          >
                            مورد نشط
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openAccount(s)}
                          title="حساب المورد"
                          className="p-1.5 rounded transition hover:opacity-70"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {balance !== 0 && (
                          <button
                            onClick={() => openPay(s)}
                            title="تسجيل دفعة"
                            className="p-1.5 rounded transition hover:opacity-70"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => openForm(s)}
                          title="تعديل"
                          className="p-1.5 rounded transition hover:opacity-70"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Account Modal */}
      {accountModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" style={surfaceCard}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-lg font-bold" style={text.heading}>
                  حساب: {accountModal.supplier.name}
                </h2>
                <p className="text-sm mt-0.5" style={text.muted}>
                  الرصيد:{' '}
                  {(() => {
                    const b = getSupplierBalance(accountModal.supplier.balance);
                    return b > 0 ? (
                      <span className="font-bold text-red-500">{fmt(b)} (علينا للمورد)</span>
                    ) : b < 0 ? (
                      <span className="font-bold text-green-500">{fmt(Math.abs(b))} (بذمة المورد)</span>
                    ) : (
                      <span className="font-bold" style={text.muted}>
                        لا يوجد رصيد
                      </span>
                    );
                  })()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintAccount}
                  disabled={acctLoading || accountPrinting}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                  style={{
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-color)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <Printer className="w-4 h-4" />
                  {accountPrinting ? 'جاري تجهيز الطباعة...' : 'طباعة'}
                </button>

                {getSupplierBalance(accountModal.supplier.balance) !== 0 && (
                  <button
                    onClick={() => {
                      setAccountModal(null);
                      openPay(accountModal.supplier);
                    }}
                    className="flex items-center gap-1.5 text-white text-sm px-3 py-1.5 rounded-lg transition hover:opacity-90"
                    style={{ background: '#10b981' }}
                  >
                    <CreditCard className="w-4 h-4" />
                    دفعة
                  </button>
                )}

                <button
                  onClick={() => setAccountModal(null)}
                  className="hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {acctLoading ? (
                <p className="text-center py-10" style={text.muted}>
                  جاري التحميل...
                </p>
              ) : accountModal.transactions.length === 0 ? (
                <p className="text-center py-10" style={text.muted}>
                  لا توجد حركات لهذا المورد
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-right border-b"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <th className="pb-2">التاريخ</th>
                      <th className="pb-2">النوع</th>
                      <th className="pb-2 text-left">مدين</th>
                      <th className="pb-2 text-left">دائن</th>
                      <th className="pb-2 text-left">الرصيد</th>
                      <th className="pb-2">ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountModal.transactions.map((tx) => (
                      <tr key={tx.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2 text-xs" style={text.muted}>
                          {fmtDate(tx.created_at)}
                        </td>
                        <td className={`py-2 font-medium ${TX_COLOR[tx.transaction_type] ?? ''}`}>
                          {TX_LABELS[tx.transaction_type] ?? tx.transaction_type}
                        </td>
                        <td className="py-2 text-left text-red-400">
                          {parseFloat(tx.debit_amount) > 0 ? fmt(tx.debit_amount) : '—'}
                        </td>
                        <td className="py-2 text-left text-green-400">
                          {parseFloat(tx.credit_amount) > 0 ? fmt(tx.credit_amount) : '—'}
                        </td>
                        <td className="py-2 text-left font-medium" style={text.heading}>
                          {fmt(tx.balance_after)}
                        </td>
                        <td className="py-2 text-xs max-w-xs truncate" style={text.muted}>
                          {tx.note ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {accountModal.total > 30 && (
              <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm" style={text.muted}>
                  صفحة {accountModal.page} من {Math.ceil(accountModal.total / 30)}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={accountModal.page <= 1}
                    onClick={() => openAccount(accountModal.supplier, accountModal.page - 1)}
                    className="p-1.5 rounded disabled:opacity-40 hover:opacity-70 transition"
                    style={{ background: 'var(--bg-subtle)', color: 'var(--text-color)' }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    disabled={accountModal.page >= Math.ceil(accountModal.total / 30)}
                    onClick={() => openAccount(accountModal.supplier, accountModal.page + 1)}
                    className="p-1.5 rounded disabled:opacity-40 hover:opacity-70 transition"
                    style={{ background: 'var(--bg-subtle)', color: 'var(--text-color)' }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal &&
        (() => {
          const currBalance = getSupplierBalance(payModal.balance);
          const payAmt = parseFloat(payForm.amount) || 0;
          const rate = parseFloat(payForm.exchange_rate) || 1;
          const amtUSD = payForm.currency_code === 'USD' ? payAmt : rate > 0 ? payAmt / rate : 0;
          const newBalance = currBalance - amtUSD;
          const currSym = CURRENCIES.find((c) => c.code === payForm.currency_code)?.symbol ?? payForm.currency_code;
          const isOverpaid = newBalance < 0;

          return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
              <div className="rounded-2xl w-full max-w-md" style={surfaceCard}>
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="text-lg font-bold" style={text.heading}>
                    دفعة للمورد — {payModal.name}
                  </h2>
                  <button
                    onClick={() => setPayModal(null)}
                    className="hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={submitPay} className="p-5 space-y-4">
                  <div
                    className="rounded-lg p-3 text-sm flex justify-between items-center"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  >
                    <span style={text.muted}>الرصيد الحالي</span>
                    <span
                      className={`font-bold text-base ${
                        currBalance > 0 ? 'text-red-400' : currBalance < 0 ? 'text-green-400' : ''
                      }`}
                      style={currBalance === 0 ? text.muted : undefined}
                    >
                      {currBalance > 0
                        ? `${fmt(currBalance)} (علينا للمورد)`
                        : currBalance < 0
                        ? `${fmt(Math.abs(currBalance))} (بذمة المورد)`
                        : 'لا يوجد رصيد'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm mb-1" style={text.secondary}>
                        المبلغ المدفوع *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={payForm.amount}
                          onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:border-green-500 pr-16"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-color)' }}
                          placeholder="0.00"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={text.muted}>
                          {currSym}
                        </span>
                      </div>

                      {payAmt > 0 && payForm.currency_code !== 'USD' && (
                        <p className="text-xs mt-1 flex items-center gap-1 text-emerald-500">
                          <Info size={11} />
                          يعادل: <span className="font-bold">{amtUSD.toFixed(4)} $</span>
                          {rate > 1 && <span style={text.muted}>(1 $ = {rate} {currSym})</span>}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm mb-1" style={text.secondary}>
                        العملة
                      </label>
                      <select
                        value={payForm.currency_code}
                        onChange={(e) => handlePayCurrencyChange(e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-color)' }}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {payForm.currency_code !== 'USD' && (
                      <div>
                        <label className="block text-sm mb-1" style={text.secondary}>
                          سعر الصرف (1 $ = ؟ {currSym})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={payForm.exchange_rate}
                          onChange={(e) => setPayForm((p) => ({ ...p, exchange_rate: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-color)' }}
                        />
                      </div>
                    )}

                    <div className="col-span-2">
                      <label
                        className="flex items-center gap-2 text-sm cursor-pointer"
                        style={text.body}
                      >
                        <input
                          type="checkbox"
                          checked={printReceiptAfterPayment}
                          onChange={(e) => setPrintReceiptAfterPayment(e.target.checked)}
                          className="rounded"
                        />
                        طباعة سند بعد تسجيل الدفعة
                      </label>
                    </div>
                  </div>

                  {payAmt > 0 && (
                    <div
                      className={`rounded-lg p-3 text-sm border ${isOverpaid ? 'bg-blue-950/40 border-blue-700/40' : ''}`}
                      style={
                        !isOverpaid
                          ? { background: 'var(--bg-subtle)', border: '1px solid var(--border)' }
                          : {}
                      }
                    >
                      <div className="flex justify-between items-center">
                        <span style={text.muted}>الرصيد بعد الدفع</span>
                        <span
                          className={`font-bold ${
                            isOverpaid ? 'text-blue-400' : newBalance > 0 ? 'text-yellow-400' : 'text-green-400'
                          }`}
                        >
                          {isOverpaid
                            ? `${fmt(Math.abs(newBalance))} (بذمة المورد)`
                            : newBalance > 0
                            ? fmt(newBalance)
                            : 'صفر — مسدّد بالكامل ✓'}
                        </span>
                      </div>

                      {isOverpaid && (
                        <p className="text-blue-300 text-xs mt-1 flex items-center gap-1">
                          <Info size={11} />
                          الدفع يزيد عن الدين — سيُسجَّل الباقي رصيداً بذمة المورد
                        </p>
                      )}
                    </div>
                  )}

                  {payErr && <p className="text-red-400 text-sm">{payErr}</p>}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setPayModal(null)}
                      className="flex-1 py-2.5 rounded-lg transition text-sm"
                      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={payLoading}
                      className="flex-1 py-2.5 rounded-lg transition text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: '#10b981' }}
                    >
                      {payLoading ? 'جاري التسجيل...' : 'تسجيل الدفعة'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="rounded-2xl w-full max-w-md" style={surfaceCard}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-bold" style={text.heading}>
                {editTarget ? 'تعديل مورد' : 'مورد جديد'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitForm} className="p-5 space-y-4">
              <div>
                <label className="block text-sm mb-1" style={text.secondary}>
                  الاسم *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-color)' }}
                />
              </div>

              <div>
                <label className="block text-sm mb-1" style={text.secondary}>
                  الهاتف
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-color)' }}
                />
              </div>

              <div>
                <label className="block text-sm mb-1" style={text.secondary}>
                  العنوان
                </label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-color)' }}
                />
              </div>

              <div>
                <label className="block text-sm mb-1" style={text.secondary}>
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 resize-none"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-color)' }}
                />
              </div>

              {formErr && <p className="text-red-400 text-sm">{formErr}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-lg transition text-sm"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg transition text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: '#f59e0b' }}
                >
                  {saving ? 'جاري الحفظ...' : editTarget ? 'حفظ التعديلات' : 'إضافة مورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}