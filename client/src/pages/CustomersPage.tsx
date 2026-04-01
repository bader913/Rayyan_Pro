import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customersApi, type Customer, type CustomerTransaction } from '../api/customers.ts';
import { settingsApi } from '../api/settings.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { useDebounce } from '../hooks/useDebounce.ts';
import { Users, Plus, Search, Eye, CreditCard, X, ChevronLeft, ChevronRight, Edit2, Filter, Info, Printer } from 'lucide-react';
import { printAccountStatementA4 } from '../utils/accountStatementPrint.ts';
import { printPaymentReceiptA4 } from '../utils/paymentReceiptPrint.ts';
import CustomerLedgerModal from '@/components/CustomerLedgerModal.tsx';
const CURRENCIES = [
  { code: 'USD', label: 'دولار أمريكي', symbol: '$', rateKey: '' },
  { code: 'SYP', label: 'ليرة سورية', symbol: 'ل.س', rateKey: 'usd_to_syp' },
  { code: 'TRY', label: 'ليرة تركية', symbol: 'TL', rateKey: 'usd_to_try' },
  { code: 'SAR', label: 'ريال سعودي', symbol: 'ر.س', rateKey: 'usd_to_sar' },
];

function getRateFromSettings(settings: Record<string, string> | undefined, currCode: string): number {
  if (currCode === 'USD' || !settings) return 1;
  const key = CURRENCIES.find(c => c.code === currCode)?.rateKey ?? '';
  return parseFloat(settings[key] ?? '1') || 1;
}
function isCustomerOverCreditLimit(customer: Customer) {
  const balance = parseFloat(String(customer.balance)) || 0;
  const creditLimit = parseFloat(String(customer.credit_limit)) || 0;
  return creditLimit > 0 && balance > creditLimit;
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const TX_LABELS: Record<string, string> = { sale: 'بيع', payment: 'دفعة', return: 'مرتجع', adjustment: 'تعديل' };
const TX_COLOR: Record<string, string> = { sale: 'text-red-400', payment: 'text-green-400', return: 'text-blue-400', adjustment: 'text-yellow-400' };
const TYPE_LABELS: Record<string, string> = { retail: 'تجزئة', wholesale: 'جملة' };
const surfaceCardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

const subtleSurfaceStyle: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
};
type AccountStatementRow = {
  key: string;
  created_at: string;
  label: string;
  debit_amount: string;
  credit_amount: string;
  balance_after: string;
  note: string;
  colorClass: string;
  paymentMethodLabel?: string;
};

function buildAccountStatementRows(transactions: CustomerTransaction[]): AccountStatementRow[] {
  const source = transactions as Array<CustomerTransaction & {
    id: number | string;
    reference_id?: number | string | null;
    reference_type?: string | null;
    sale_payment_method?: string | null;
  }>;
  function getPaymentMethodLabel(method?: string | null) {
    switch (method) {
      case 'cash':
        return 'نقدي';
      case 'card':
        return 'شام كاش';
      case 'mixed':
        return 'مختلط';
      case 'credit':
        return 'آجل';
      default:
        return '';
    }
  }

  const used = new Set<string>();
  const rows: AccountStatementRow[] = [];

  for (const tx of source) {
    const txId = String(tx.id);
    if (used.has(txId)) continue;

    const hasSaleRef =
      tx.reference_type === 'sale' &&
      tx.reference_id !== null &&
      tx.reference_id !== undefined;

    if (hasSaleRef) {
      const refId = String(tx.reference_id);

      const saleTx = source.find(
        (item) =>
          !used.has(String(item.id)) &&
          item.transaction_type === 'sale' &&
          item.reference_type === 'sale' &&
          String(item.reference_id ?? '') === refId
      );

      const paymentTx = source.find(
        (item) =>
          !used.has(String(item.id)) &&
          item.transaction_type === 'payment' &&
          item.reference_type === 'sale' &&
          String(item.reference_id ?? '') === refId
      );

      if (saleTx && paymentTx) {
        used.add(String(saleTx.id));
        used.add(String(paymentTx.id));

        const debit = parseFloat(String(saleTx.debit_amount)) || 0;
        const credit = parseFloat(String(paymentTx.credit_amount)) || 0;

        let label = 'فاتورة';
        let colorClass = 'text-blue-400';

        if (credit === debit) {
          label = 'فاتورة مدفوعة بالكامل';
          colorClass = 'text-emerald-400';
        } else if (credit > debit) {
          label = 'فاتورة مدفوعة مع زيادة';
          colorClass = 'text-cyan-400';
        } else {
          label = 'فاتورة مدفوعة جزئيًا';
          colorClass = 'text-amber-400';
        }

        rows.push({
          key: `merged-sale-${refId}`,
          created_at: saleTx.created_at,
          label,
          debit_amount: String(saleTx.debit_amount ?? '0'),
          credit_amount: String(paymentTx.credit_amount ?? '0'),
          balance_after: String(paymentTx.balance_after ?? saleTx.balance_after ?? '0'),
          note: saleTx.note ?? paymentTx.note ?? '—',
          colorClass,
          paymentMethodLabel: getPaymentMethodLabel(saleTx.sale_payment_method),
        });

        continue;
      }
    }

    used.add(txId);

    rows.push({
      key: `tx-${txId}`,
      created_at: tx.created_at,
      label: TX_LABELS[tx.transaction_type] ?? tx.transaction_type,
      debit_amount: String(tx.debit_amount ?? '0'),
      credit_amount: String(tx.credit_amount ?? '0'),
      balance_after: String(tx.balance_after ?? '0'),
      note: tx.note ?? '—',
      colorClass: TX_COLOR[tx.transaction_type] ?? 'text-slate-300',
      paymentMethodLabel:
        tx.reference_type === 'sale' ? getPaymentMethodLabel((tx as { sale_payment_method?: string | null }).sale_payment_method) : '',
    });
  }

  return rows;
}

export default function CustomersPage() {
  const { fmt } = useCurrency();
  const queryClient = useQueryClient();
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then(r => r.data.settings),
    staleTime: 30_000,
  });
  // fot telegram

  const [creditAlertEnabled, setCreditAlertEnabled] = useState(true);
  const [creditAlertSaving, setCreditAlertSaving] = useState(false);
  const [creditAlertErr, setCreditAlertErr] = useState('');
const [bonusEnabled, setBonusEnabled] = useState(false);
  const [bonusRate, setBonusRate] = useState('0');
  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusErr, setBonusErr] = useState('');
  useEffect(() => {
    setCreditAlertEnabled(
      (settingsData?.telegram_alert_customer_credit_limit ?? 'true') !== 'false'
    );
  }, [settingsData]);

    useEffect(() => {
    setBonusEnabled(settingsData?.customer_bonus_enabled === 'true');
    setBonusRate(String(Math.min(100, Math.max(0, parseFloat(settingsData?.customer_bonus_rate ?? '0') || 0))));
  }, [settingsData]);

  const toggleCreditAlert = async () => {
    const next = !creditAlertEnabled;

    setCreditAlertEnabled(next);
    setCreditAlertSaving(true);
    setCreditAlertErr('');

    try {
      await settingsApi.update(
        'telegram_alert_customer_credit_limit',
        next ? 'true' : 'false'
      );
    } catch {
      setCreditAlertEnabled(!next);
      setCreditAlertErr('تعذر حفظ إعداد تنبيه حد الائتمان');
    }

    setCreditAlertSaving(false);
  };

    const toggleBonusEnabled = async () => {
    const next = !bonusEnabled;

    setBonusEnabled(next);
    setBonusSaving(true);
    setBonusErr('');

    try {
      await settingsApi.bulkUpdate({
        customer_bonus_enabled: next ? 'true' : 'false',
        customer_bonus_rate: String(Math.min(100, Math.max(0, parseFloat(bonusRate) || 0))),
      });
    } catch {
      setBonusEnabled(!next);
      setBonusErr('تعذر حفظ إعداد تفعيل البونص');
    }

    setBonusSaving(false);
  };

  const saveBonusRate = async () => {
    const safeRate = Math.min(100, Math.max(0, parseFloat(bonusRate) || 0));

    setBonusRate(String(safeRate));
    setBonusSaving(true);
    setBonusErr('');

    try {
      await settingsApi.bulkUpdate({
        customer_bonus_enabled: bonusEnabled ? 'true' : 'false',
        customer_bonus_rate: String(safeRate),
      });
    } catch {
      setBonusErr('تعذر حفظ نسبة البونص');
    }

    setBonusSaving(false);
  };
    

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'highest_debt' | 'highest_purchases' | 'most_invoices' | 'newest'>('name_asc');
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', customer_type: 'retail', credit_limit: '0', notes: '' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [accountModal, setAccountModal] = useState<{ customer: Customer; transactions: CustomerTransaction[]; total: number; page: number } | null>(null);
  const [acctLoading, setAcctLoading] = useState(false);
  const [accountPrinting, setAccountPrinting] = useState(false);

  const [payModal, setPayModal] = useState<Customer | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', currency_code: 'USD', exchange_rate: '1', note: '' });
  const [payErr, setPayErr] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [printReceiptAfterPayment, setPrintReceiptAfterPayment] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const loadCustomers = useCallback(async (q = search, type = typeFilter, sort = sortBy) => {
    setLoading(true);
    try {
      const res = await customersApi.list({
        q: q || undefined,
        type: type || undefined,
        sort,
        limit: 50,
      });
      setCustomers(res.data.customers);
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, typeFilter, sortBy]);

  useEffect(() => { loadCustomers('', '', sortBy); }, []);

  useEffect(() => {
    loadCustomers(debouncedSearch, typeFilter, sortBy);
  }, [debouncedSearch, typeFilter, sortBy]);

  const openAccount = (c: Customer) => {
  setAccountModal({
    customer: c,
    transactions: [],
    total: 0,
    page: 1,
  });
};
// print
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

      const getPrintColor = (className?: string) => {
        if (!className) return '#374151';
        if (className.includes('emerald') || className.includes('green')) return '#10b981';
        if (className.includes('cyan')) return '#06b6d4';
        if (className.includes('blue')) return '#3b82f6';
        if (className.includes('amber') || className.includes('yellow')) return '#f59e0b';
        if (className.includes('red')) return '#ef4444';
        return '#374151';
      };

      const totalPages = Math.max(1, Math.ceil((accountModal.total || 0) / 30));

      let allTransactions = [...accountModal.transactions];
      let currentCustomer = accountModal.customer;

      if (totalPages > 1) {
        const pages = await Promise.all(
          Array.from({ length: totalPages }, (_, i) =>
            customersApi.getAccount(accountModal.customer.id, i + 1).then((r) => r.data)
          )
        );

        allTransactions = pages.flatMap((pageData) => pageData?.transactions ?? []);
        currentCustomer = pages[0]?.customer ?? currentCustomer;
      }

      const rows = buildAccountStatementRows(allTransactions);

      const htmlRows = rows
        .map(
          (row) => `
            <tr>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${esc(fmtDate(row.created_at))}</td>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:800;color:${getPrintColor(row.colorClass)};">
                ${esc(row.label)}${row.paymentMethodLabel ? ` — ${esc(row.paymentMethodLabel)}` : ''}
              </td>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;">
                ${parseFloat(row.debit_amount) > 0 ? esc(fmt(row.debit_amount)) : '—'}
              </td>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;">
                ${parseFloat(row.credit_amount) > 0 ? esc(fmt(row.credit_amount)) : '—'}
              </td>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:800;color:#111827;">
                ${esc(fmt(row.balance_after))}
              </td>
              <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#4b5563;">
                ${esc(row.note ?? '—')}
              </td>
            </tr>
          `
        )
        .join('');

      const balance = parseFloat(String(currentCustomer.balance ?? '0')) || 0;
      const balanceLabel =
        balance > 0
          ? `${esc(fmt(balance))} (دين)`
          : balance < 0
            ? `${esc(fmt(Math.abs(balance)))} (بذمتنا)`
            : 'لا يوجد رصيد';

      printAccountStatementA4({
        title: 'كشف حساب عميل',
        subjectName: currentCustomer.name,
        generatedAt: fmtDate(new Date().toISOString()),
        printedRowsCount: rows.length,
        cards: [
          { label: 'العميل', value: currentCustomer.name },
          { label: 'الهاتف', value: currentCustomer.phone ?? '—' },
          { label: 'الرصيد الحالي', value: balanceLabel },
          { label: 'حد الائتمان', value: fmt(currentCustomer.credit_limit ?? '0') },
          { label: 'رصيد البونص', value: fmt(currentCustomer.bonus_balance ?? '0') },
          { label: 'إجمالي الحركات', value: String(accountModal.total || rows.length) },
        ],
        rowsHtml: htmlRows,
        footerText: 'تم إنشاء هذه الطباعة من نافذة كشف حساب العميل داخل صفحة العملاء.',
      });
    } finally {
      setAccountPrinting(false);
    }
  };
  const openForm = (c?: Customer) => {
    setEditTarget(c ?? null);
    setForm({
      name: c?.name ?? '', phone: c?.phone ?? '', address: c?.address ?? '',
      customer_type: c?.customer_type ?? 'retail',
      credit_limit: c?.credit_limit ? String(parseFloat(c.credit_limit)) : '0',
      notes: c?.notes ?? '',
    });
    setFormErr('');
    setShowForm(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormErr('');
    try {
      const payload = {
        name: form.name, phone: form.phone || undefined, address: form.address || undefined,
        customer_type: form.customer_type, credit_limit: parseFloat(form.credit_limit) || 0,
        notes: form.notes || undefined,
      };
      if (editTarget) await customersApi.update(editTarget.id, payload);
      else await customersApi.create(payload);
      setShowForm(false);
      loadCustomers(search, typeFilter);
    } catch (err: unknown) {
      setFormErr((err as { message?: string }).message ?? 'حدث خطأ');
    }
    setSaving(false);
  };

  const openPay = (c: Customer) => {
    setPayModal(c);
    const rate = getRateFromSettings(settingsData, 'USD');
    setPayForm({ amount: '', currency_code: 'USD', exchange_rate: String(rate), note: '' });
    setPayErr('');
    setPrintReceiptAfterPayment(false);
  };

  const handlePayCurrencyChange = (code: string) => {
    const rate = getRateFromSettings(settingsData, code);
    setPayForm(p => ({ ...p, currency_code: code, exchange_rate: String(rate) }));
  };

  //print
    const printCustomerPaymentReceipt = (
    customer: Customer,
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

    const receiptNumber = `CR-${customer.id}-${Date.now()}`;

    const balanceBeforeLabel =
      payload.balance_before > 0
        ? `${fmt(payload.balance_before)} (عليه دين)`
        : payload.balance_before < 0
          ? `${fmt(Math.abs(payload.balance_before))} (بذمتنا)`
          : 'لا يوجد رصيد';

    const balanceAfterLabel =
      payload.balance_after > 0
        ? `${fmt(payload.balance_after)} (متبقي على العميل)`
        : payload.balance_after < 0
          ? `${fmt(Math.abs(payload.balance_after))} (بذمتنا للعميل)`
          : 'صفر — مسدّد بالكامل';

    const paymentStatus =
      payload.balance_after < 0
        ? 'دفعة مع زيادة'
        : payload.balance_after > 0
          ? 'دفعة جزئية'
          : 'تسديد كامل';

    printPaymentReceiptA4({
      title: 'سند قبض',
      subjectName: customer.name,
      generatedAt: fmtDate(new Date().toISOString()),
      receiptNumber,
      receiptTypeLabel: 'دفعة عميل',
      paymentStatus,
      note: payload.note,
      titleColor: '#16a34a',
      summaryAccentBg: '#f0fdf4',
      summaryAccentColor: '#166534',
      cards: [
        { label: 'اسم العميل', value: customer.name },
        { label: 'الهاتف', value: customer.phone ?? '—' },
        { label: 'المبلغ المقبوض', value: `${payload.amount.toLocaleString('en-US')} ${currSym}` },
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
    if (!amt || amt <= 0) { setPayErr('أدخل مبلغاً صحيحاً'); return; }

    const currentCustomer = payModal!;
    const currentBalance = parseFloat(String(currentCustomer.balance)) || 0;
    const exchangeRate = parseFloat(payForm.exchange_rate) || 1;
    const amountUSD = payForm.currency_code === 'USD'
      ? amt
      : (exchangeRate > 0 ? amt / exchangeRate : 0);
    const newBalance = currentBalance - amountUSD;

    setPayLoading(true);
    setPayErr('');

    try {
      await customersApi.addPayment(currentCustomer.id, {
        amount: amt,
        currency_code: payForm.currency_code,
        exchange_rate: exchangeRate,
        note: payForm.note || undefined,
      });

      if (printReceiptAfterPayment) {
        printCustomerPaymentReceipt(currentCustomer, {
          amount: amt,
          currency_code: payForm.currency_code,
          exchange_rate: exchangeRate,
          note: payForm.note || undefined,
          balance_before: currentBalance,
          balance_after: newBalance,
        });
      }

      setPayModal(null);
      loadCustomers(search, typeFilter);
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', currentCustomer.id] });

      if (accountModal && accountModal.customer.id === currentCustomer.id) {
        openAccount({ ...currentCustomer });
      }
    } catch (err: unknown) {
      setPayErr((err as { message?: string }).message ?? 'حدث خطأ');
    }

    setPayLoading(false);
  };

  const totalDebt = customers.reduce((s, c) => {
    const balance = parseFloat(String(c.balance)) || 0;
    return balance > 0 ? s + balance : s;
  }, 0);

  const totalPurchases = customers.reduce((s, c) => {
    return s + (parseFloat(String(c.total_sales_amount ?? '0')) || 0);
  }, 0);

  const totalInvoices = customers.reduce((s, c) => {
    return s + (parseInt(String(c.sales_count ?? '0'), 10) || 0);
  }, 0);

  const debtorsCount = customers.filter(c => (parseFloat(String(c.balance)) || 0) > 0).length;
  const overLimitCount = customers.filter(isCustomerOverCreditLimit).length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-7 h-7 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">العملاء</h1>
        </div>
        <button onClick={() => openForm()}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2 rounded-lg transition">
          <Plus className="w-4 h-4" /> عميل جديد
        </button>
      </div>

      {/* Credit limit Telegram alert toggle */}
      <div
        className="rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap"
        style={surfaceCardStyle}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            <p className="text-sm font-semibold text-white">
              تنبيه تجاوز حد الائتمان عبر Telegram
            </p>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            يرسل تنبيهًا مرة واحدة عند أول تجاوز لحد الائتمان، ثم لا يكرر الإرسال حتى يعود العميل ضمن الحد ويتجاوزه مجددًا.
          </p>
          {creditAlertErr && (
            <p className="text-xs text-red-400 mt-2">{creditAlertErr}</p>
          )}
        </div>

        <button
          type="button"
          onClick={toggleCreditAlert}
          disabled={creditAlertSaving}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-60 border ${creditAlertEnabled
              ? 'bg-green-600 hover:bg-green-700 text-white border-green-500'
              : 'bg-red-600 hover:bg-red-700 text-white border-red-500'
            }`}
        >
          {creditAlertSaving
            ? 'جاري الحفظ...'
            : creditAlertEnabled
              ? 'مفعّل'
              : 'معطّل'}
        </button>
      </div>
            {/* Customer bonus toggle */}
      <div className="rounded-2xl p-4 space-y-4" style={surfaceCardStyle}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-color)' }}>
              نظام بونص العملاء
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              يمنح العميل رصيد بونص تلقائيًا عند الشراء إذا كان محددًا على الفاتورة.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleBonusEnabled}
            disabled={bonusSaving}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-60 border ${
              bonusEnabled
                ? 'bg-green-600 hover:bg-green-700 text-white border-green-500'
                : 'bg-red-600 hover:bg-red-700 text-white border-red-500'
            }`}
          >
            {bonusSaving ? 'جاري الحفظ...' : bonusEnabled ? 'مفعّل' : 'معطّل'}
          </button>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[180px]">
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              نسبة البونص %
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={bonusRate}
              onChange={(e) => setBonusRate(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-color)]"
              placeholder="0"
            />
          </div>

          <button
            type="button"
            onClick={saveBonusRate}
            disabled={bonusSaving}
            className="px-4 py-2 rounded-xl text-sm font-semibold border transition disabled:opacity-60"
            style={{
              background: 'var(--bg-subtle)',
              borderColor: 'var(--border)',
              color: 'var(--text-color)',
            }}
          >
            {bonusSaving ? 'جاري الحفظ...' : 'حفظ النسبة'}
          </button>

          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            مثال: إذا كانت النسبة 5% وفاتورة العميل 100$ ⇒ يكسب 5$ بونص
          </div>
        </div>

        {bonusErr && (
          <p className="text-sm text-red-500">{bonusErr}</p>
        )}
      </div>

      {/* Summary Cards */}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4" style={surfaceCardStyle}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>إجمالي الديون المستحقة</p>
          <p className="text-2xl font-bold mt-1 text-red-500">{fmt(totalDebt)}</p>
        </div>

        <div className="rounded-2xl p-4" style={surfaceCardStyle}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>إجمالي مشتريات العملاء</p>
          <p className="text-2xl font-bold mt-1 text-blue-500">{fmt(totalPurchases)}</p>
        </div>

        <div className="rounded-2xl p-4" style={surfaceCardStyle}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>عدد الفواتير</p>
          <p className="text-2xl font-bold mt-1 text-purple-500">{totalInvoices}</p>
        </div>

        <div className="rounded-2xl p-4" style={surfaceCardStyle}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>عملاء فوق حد الائتمان</p>
          <p className="text-2xl font-bold mt-1 text-amber-500">{overLimitCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            من أصل {debtorsCount} عميل عليه دين
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            className="w-full rounded-xl pr-10 pl-4 py-2 text-sm focus:outline-none focus:border-purple-500 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-color)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={typeFilter}
            onChange={e => {
              setTypeFilter(e.target.value);
              loadCustomers(search, e.target.value, sortBy);
            }}
            className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-color)]"
          >
            <option value="">الكل</option>
            <option value="retail">تجزئة</option>
            <option value="wholesale">جملة</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={sortBy}
            onChange={e => {
              const value = e.target.value as 'name_asc' | 'name_desc' | 'highest_debt' | 'highest_purchases' | 'most_invoices' | 'newest';
              setSortBy(value);
              loadCustomers(search, typeFilter, value);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="name_asc">الاسم: أ → ي</option>
            <option value="name_desc">الاسم: ي → أ</option>
            <option value="highest_debt">الأكثر ديونًا</option>
            <option value="highest_purchases">الأكثر شراءً</option>
            <option value="most_invoices">الأكثر فواتير</option>
            <option value="newest">الأحدث</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={surfaceCardStyle}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
              <th className="px-4 py-3">العميل</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3 text-left">حد الائتمان</th>
              <th className="px-4 py-3 text-left">الرصيد</th>
              <th className="px-4 py-3 text-left">عدد الفواتير</th>
              <th className="px-4 py-3 text-left">إجمالي الشراء</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-500">جاري التحميل...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12"
                style={{ color: 'var(--text-muted)' }}>لا يوجد عملاء</td></tr>
            ) : customers.map(c => (
              <tr
                key={c.id}
                className="border-t transition hover:bg-[var(--bg-subtle)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => openAccount(c)}
                      className="font-semibold text-blue-400 hover:text-blue-300 hover:underline transition text-right"
                    >
                      {c.name}
                    </button>
                    {c.notes && (
                      <span className="text-[11px] text-slate-500 max-w-[220px] truncate">
                        {c.notes}
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3 text-slate-300">{c.phone ?? '—'}</td>

                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.customer_type === 'wholesale' ? 'bg-blue-900/40 text-blue-400' : 'bg-slate-700 text-slate-300'}`}>
                    {TYPE_LABELS[c.customer_type]}
                  </span>
                </td>

                <td className="px-4 py-3 text-left text-slate-300">
                  {(parseFloat(String(c.credit_limit)) || 0) > 0 ? fmt(c.credit_limit) : <span className="text-slate-500">—</span>}
                </td>

                <td className="px-4 py-3 text-left">
                  {(() => {
                    const b = parseFloat(String(c.balance)) || 0;
                    return b > 0
                      ? <span className="text-red-400 font-semibold">{fmt(b)}<span className="text-xs text-red-500 mr-1">(دين)</span></span>
                      : b < 0
                        ? <span className="text-green-400 font-semibold">{fmt(Math.abs(b))}<span className="text-xs text-green-600 mr-1">(بذمتنا)</span></span>
                        : <span className="text-slate-500">—</span>;
                  })()}
                </td>

                <td className="px-4 py-3 text-left text-slate-200 font-medium">
                  {parseInt(String(c.sales_count ?? '0'), 10) || 0}
                </td>

                <td className="px-4 py-3 text-left text-slate-200 font-medium">
                  {(parseFloat(String(c.total_sales_amount ?? '0')) || 0) > 0
                    ? fmt(c.total_sales_amount ?? '0')
                    : <span className="text-slate-500">—</span>}
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {isCustomerOverCreditLimit(c) && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-amber-600 dark:text-amber-400" style={subtleSurfaceStyle}>
                        فوق الحد
                      </span>
                    )}

                    {(parseFloat(String(c.balance)) || 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-red-600 dark:text-red-400" style={subtleSurfaceStyle}>
                        عليه دين
                      </span>
                    )}

                    {(parseFloat(String(c.balance)) || 0) < 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-green-600 dark:text-green-400" style={subtleSurfaceStyle}>
                        له رصيد
                      </span>
                    )}

                    {(parseInt(String(c.sales_count ?? '0'), 10) || 0) >= 10 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-blue-600 dark:text-blue-400" style={subtleSurfaceStyle}>
                        عميل نشط
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => openAccount(c)} title="سجل الحساب"
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition">
                      <Eye className="w-4 h-4" />
                    </button>
                    {(parseFloat(String(c.balance)) || 0) !== 0 && (
                      <button onClick={() => openPay(c)} title="تسجيل دفعة"
                        className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded transition">
                        <CreditCard className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => openForm(c)} title="تعديل"
                      className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-slate-700 rounded transition">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {accountModal && (
        <CustomerLedgerModal
          customerId={accountModal.customer.id}
          customerName={accountModal.customer.name}
          onClose={() => setAccountModal(null)}
        />
      )}

      {/* Payment Modal */}
      {payModal && (() => {
        const currBalance = parseFloat(String(payModal.balance)) || 0;
        const payAmt = parseFloat(payForm.amount) || 0;
        const rate = parseFloat(payForm.exchange_rate) || 1;
        const amtUSD = payForm.currency_code === 'USD' ? payAmt : (rate > 0 ? payAmt / rate : 0);
        const newBalance = currBalance - amtUSD;
        const currSym = CURRENCIES.find(c => c.code === payForm.currency_code)?.symbol ?? payForm.currency_code;
        const isOverpaid = newBalance < 0;
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-slate-700">
                <h2 className="text-lg font-bold text-white">تسجيل دفعة — {payModal.name}</h2>
                <button onClick={() => setPayModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={submitPay} className="p-5 space-y-4">

                {/* Current balance */}
                <div
                  className="rounded-lg p-3 text-sm flex justify-between items-center"
                  style={currBalance > 0
                    ? { background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }
                    : currBalance < 0
                      ? { background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }
                      : { background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>الرصيد الحالي</span>
                  <span className="font-bold text-base" style={{ color: currBalance > 0 ? '#ef4444' : currBalance < 0 ? '#10b981' : 'var(--text-muted)' }}>
                    {currBalance > 0 ? `${fmt(currBalance)} (عليه دين)` : currBalance < 0 ? `${fmt(Math.abs(currBalance))} (بذمتنا)` : 'لا يوجد رصيد'}
                  </span>
                </div>

                {/* Amount + Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-400 mb-1">المبلغ المدفوع *</label>
                    <div className="relative">
                      <input type="number" step="0.01" min="0.01" required value={payForm.amount}
                        onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500 pr-16"
                        placeholder="0.00" />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">{currSym}</span>
                    </div>
                    {/* USD equivalent preview */}
                    {payAmt > 0 && payForm.currency_code !== 'USD' && (
                      <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                        <Info size={11} />
                        يعادل: <span className="font-bold">{amtUSD.toFixed(4)} $</span>
                        {rate > 1 && <span className="text-slate-500">(1 $ = {rate} {currSym})</span>}
                      </p>
                    )}
                  </div>

                  {/* Currency selector */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">العملة</label>
                    <select value={payForm.currency_code}
                      onChange={e => handlePayCurrencyChange(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500">
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Exchange rate (hidden for USD) */}
                  {payForm.currency_code !== 'USD' && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">سعر الصرف (1 $ = ؟ {currSym})</label>
                      <input type="number" step="0.01" min="0.01" value={payForm.exchange_rate}
                        onChange={e => setPayForm(p => ({ ...p, exchange_rate: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" />
                    </div>
                  )}

                  <div className={payForm.currency_code !== 'USD' ? 'col-span-2' : 'col-span-2'}>
                    <label className="block text-sm text-slate-400 mb-1">ملاحظة</label>
                    <input value={payForm.note}
                      onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))}
                      placeholder="اختياري"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" />
                  </div>
                                    <div className="col-span-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
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

                {/* New balance preview */}
                {payAmt > 0 && (
                  <div className={`rounded-lg p-3 text-sm border ${isOverpaid ? 'bg-blue-950/40 border-blue-700/40' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">الرصيد بعد الدفع</span>
                      <span className={`font-bold ${isOverpaid ? 'text-blue-400' : newBalance > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {isOverpaid
                          ? `${fmt(Math.abs(newBalance))} (بذمتنا)`
                          : newBalance > 0
                            ? fmt(newBalance)
                            : 'صفر — مسدّد بالكامل ✓'}
                      </span>
                    </div>
                    {isOverpaid && (
                      <p className="text-blue-300 text-xs mt-1 flex items-center gap-1">
                        <Info size={11} />
                        الدفع يزيد عن الدين — سيُسجَّل الباقي رصيداً بذمتنا للعميل
                      </p>
                    )}
                  </div>
                )}

                {payErr && <p className="text-red-400 text-sm">{payErr}</p>}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setPayModal(null)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg transition text-sm">
                    إلغاء
                  </button>
                  <button type="submit" disabled={payLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-lg transition text-sm font-semibold">
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
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">{editTarget ? 'تعديل عميل' : 'عميل جديد'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitForm} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">الاسم *</label>
                <input required value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">الهاتف</label>
                <input value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">نوع العميل</label>
                  <select value={form.customer_type}
                    onChange={e => setForm(p => ({ ...p, customer_type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500">
                    <option value="retail">تجزئة</option>
                    <option value="wholesale">جملة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">حد الائتمان $</label>
                  <input type="number" min="0" step="0.01" value={form.credit_limit}
                    onChange={e => setForm(p => ({ ...p, credit_limit: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">العنوان</label>
                <input value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">ملاحظات</label>
                <textarea rows={2} value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>

              {formErr && <p className="text-red-400 text-sm">{formErr}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition text-sm">
                  إلغاء
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-lg transition text-sm font-semibold">
                  {saving ? 'جاري الحفظ...' : editTarget ? 'حفظ التعديلات' : 'إضافة عميل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
