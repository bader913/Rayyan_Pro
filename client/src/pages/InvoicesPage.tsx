import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Plus, X, Printer, Search, RefreshCw,
  Building2, User, Trash2, Save,
} from 'lucide-react';
import { apiClient } from '../api/client.ts';
import { settingsApi } from '../api/settings.ts';
import { openPrintWindowHtml } from '../utils/printWindow.ts';
import { printInvoiceDocumentA4 } from '../utils/invoiceDocumentPrint.ts';
interface Product {
  id:             number;
  name:           string;
  retail_price:   string;
  wholesale_price:string;
  barcode:        string | null;
  unit:           string | null;
}

interface LineItem {
  id:          number;
  name:        string;
  qty:         number;
  unit_price:  number;
  discount:    number;
}

type DocType = 'invoice' | 'quote';

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'SYP', symbol: 'ل.س' },
  { code: 'TRY', symbol: 'TL' },
  { code: 'SAR', symbol: 'ر.س' },
  { code: 'AED', symbol: 'د.إ' },
];

function genInvoiceNo(type: DocType) {
  const prefix = type === 'invoice' ? 'INV' : 'QUO';
  const d = new Date();
  return `${prefix}-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000)+1000}`;
}

export default function InvoicesPage() {
  const [docType,      setDocType]      = useState<DocType>('invoice');
  const [invoiceNo,    setInvoiceNo]    = useState(() => genInvoiceNo('invoice'));
  const [invoiceDate,  setInvoiceDate]  = useState(new Date().toISOString().split('T')[0]);
  const [dueDate,      setDueDate]      = useState('');
  const [currency,     setCurrency]     = useState('USD');
  const [customerName, setCustomerName] = useState('');
  const [customerInfo, setCustomerInfo] = useState('');
  const [notes,        setNotes]        = useState('');
  const [items,        setItems]        = useState<LineItem[]>([]);
  const [search,       setSearch]       = useState('');
  const [debouncedQ,   setDebouncedQ]   = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setInvoiceNo(genInvoiceNo(docType));
  }, [docType]);

  const { data: productData } = useQuery({
    queryKey: ['products-invoice', debouncedQ],
    queryFn:  () => apiClient.get('/products', { params: { q: debouncedQ, limit: 20 } })
      .then((r) => r.data as { products: Product[] }),
    enabled: debouncedQ.length > 0,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 0,
  });

  const shopName    = settings?.shop_name    ?? 'اسم المحل';
  const shopPhone   = settings?.shop_phone   ?? '';
  const shopAddress = settings?.shop_address ?? '';

  const addProduct = (p: Product) => {
    setItems((prev) => {
      const existing = prev.find((x) => x.id === p.id);
      if (existing) return prev.map((x) => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { id: p.id, name: p.name, qty: 1, unit_price: parseFloat(p.retail_price) || 0, discount: 0 }];
    });
    setSearch(''); setDebouncedQ('');
  };

  const updateItem = (id: number, field: keyof LineItem, val: number) =>
    setItems((prev) => prev.map((x) => x.id === id ? { ...x, [field]: val } : x));

  const removeItem = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  const sym    = CURRENCIES.find((c) => c.code === currency)?.symbol ?? '$';
  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const discountTotal = items.reduce((s, i) => s + i.discount, 0);
  const total  = Math.max(0, subtotal - discountTotal);

  const fmt = (n: number) =>
    `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;

   const handlePrint = () => {
    const isInvoice = docType === 'invoice';
    const title = isInvoice ? 'فاتورة بيع' : 'عرض سعر';
    const accentColor = isInvoice ? '#059669' : '#7c3aed';

    const rows = items.map((item, i) => {
      const lineTotal = (item.qty * item.unit_price) - item.discount;
      return [
        String(i + 1),
        item.name,
        item.qty.toLocaleString('en-US'),
        `${item.unit_price.toFixed(2)} ${sym}`,
        item.discount > 0 ? `${item.discount.toFixed(2)} ${sym}` : '—',
        `${lineTotal.toFixed(2)} ${sym}`,
      ];
    });

    const cards = [
      { label: isInvoice ? 'فاتورة إلى' : 'مقدم إلى', value: customerName || '—' },
      { label: 'العملة', value: `${currency} (${sym})` },
      { label: 'المجموع الفرعي', value: fmt(subtotal) },
      { label: 'إجمالي الخصم', value: discountTotal > 0 ? fmt(discountTotal) : '—' },
      { label: 'الإجمالي الكلي', value: fmt(total) },
      ...(customerInfo
        ? [{ label: 'معلومات إضافية', value: customerInfo.replace(/\n/g, ' | ') }]
        : []),
    ];

    const sideMetaLines = [
      `رقم المستند: ${invoiceNo}`,
      `التاريخ: ${invoiceDate}`,
      ...(dueDate ? [`تاريخ الانتهاء: ${dueDate}`] : []),
      `العملة: ${currency}`,
      ...(!isInvoice ? ['عرض سعر — غير ملزم'] : []),
    ];

    printInvoiceDocumentA4({
      title,
      accentColor,
      invoiceNumber: invoiceNo,
      dateText: invoiceDate,
      sideMetaLines,
      cards,
      columns: [
        { label: '#', width: '40px', align: 'center' },
        { label: 'الصنف', align: 'right' },
        { label: 'الكمية', width: '90px', align: 'center' },
        { label: 'سعر الوحدة', width: '140px', align: 'center' },
        { label: 'الخصم', width: '120px', align: 'center' },
        { label: 'الإجمالي', width: '140px', align: 'center' },
      ],
      rows,
      totals: [
        { label: 'المجموع الفرعي', value: fmt(subtotal) },
        ...(discountTotal > 0 ? [{ label: 'إجمالي الخصم', value: `- ${fmt(discountTotal)}` }] : []),
        { label: 'الإجمالي الكلي', value: fmt(total), highlight: true },
      ],
      notes: notes || undefined,
    });
  };

  const products = productData?.products ?? [];

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text-heading)' }}>
          الفواتير وعروض الأسعار
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          أصدر فواتير احترافية وعروض أسعار باسم محلك
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left panel: settings + product search */}
        <div className="flex flex-col gap-4">
          {/* Doc type */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-black mb-3" style={{ color: 'var(--text-muted)' }}>نوع المستند</div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['invoice', 'quote'] as DocType[]).map((t) => (
                <button key={t} onClick={() => setDocType(t)}
                  className="py-2.5 rounded-xl text-sm font-black transition-colors flex items-center justify-center gap-2"
                  style={docType === t
                    ? { background: t === 'invoice' ? '#059669' : '#7c3aed', color: '#fff' }
                    : { background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                  {t === 'invoice' ? <><FileText size={15}/> فاتورة</> : <><Save size={15}/> عرض سعر</>}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>رقم المستند</label>
                <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm font-mono focus:outline-none"
                  style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>التاريخ</label>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>تاريخ الانتهاء</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>العملة</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm font-bold focus:outline-none"
                  style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <User size={14} style={{ color: 'var(--text-muted)' }} />
              <div className="text-xs font-black" style={{ color: 'var(--text-muted)' }}>بيانات العميل</div>
            </div>
            <div className="flex flex-col gap-2">
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اسم العميل أو الشركة"
                className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              <textarea rows={2} value={customerInfo} onChange={(e) => setCustomerInfo(e.target.value)}
                placeholder="هاتف / عنوان / معلومات إضافية"
                className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none resize-none"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          {/* Product search */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-black mb-3" style={{ color: 'var(--text-muted)' }}>إضافة صنف</div>
            <div className="relative mb-2">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3" style={{ color: 'var(--text-muted)' }} />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن صنف..."
                className="w-full pr-8 pl-3 py-2 rounded-xl border text-sm focus:outline-none"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
            {products.length > 0 && (
              <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {products.map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-right w-full transition-colors text-sm"
                    style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}>
                    <Plus size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <span className="flex-1 truncate font-bold">{p.name}</span>
                    <span className="text-xs font-black" style={{ color: 'var(--primary)' }}>
                      ${parseFloat(p.retail_price).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Document preview / items */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          {/* Items table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black border-b"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
              <div className="col-span-4">الصنف</div>
              <div className="col-span-1 text-center">كمية</div>
              <div className="col-span-3 text-center">سعر الوحدة</div>
              <div className="col-span-2 text-center">خصم</div>
              <div className="col-span-1 text-center">المجموع</div>
              <div className="col-span-1" />
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3"
                style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                <FileText size={40} />
                <span className="text-sm">أضف أصناف من القائمة اليسرى</span>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)' }}>
                {items.map((item, i) => {
                  const lineTotal = item.qty * item.unit_price - item.discount;
                  return (
                    <div key={item.id}
                      className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center border-b"
                      style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-muted)' }}>
                      <div className="col-span-4 text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.name}
                      </div>
                      <div className="col-span-1">
                        <input type="number" min="0.001" step="1" value={item.qty}
                          onChange={(e) => updateItem(item.id, 'qty', parseFloat(e.target.value) || 1)}
                          className="w-full text-center px-1 py-1 rounded-lg border text-xs font-bold focus:outline-none"
                          style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                      </div>
                      <div className="col-span-3">
                        <input type="number" min="0" step="0.01" value={item.unit_price}
                          onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full text-center px-1 py-1 rounded-lg border text-xs font-bold focus:outline-none"
                          style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.01" value={item.discount || 0}
                          onChange={(e) => updateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                          className="w-full text-center px-1 py-1 rounded-lg border text-xs font-bold focus:outline-none"
                          style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                      </div>
                      <div className="col-span-1 text-center text-xs font-black" style={{ color: '#059669' }}>
                        {lineTotal.toFixed(2)}
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Totals + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-black mb-2" style={{ color: 'var(--text-muted)' }}>ملاحظات</div>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات على المستند..."
                className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none resize-none"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'المجموع الفرعي', value: fmt(subtotal), color: 'var(--text-primary)' },
                  ...(discountTotal > 0 ? [{ label: 'إجمالي الخصم', value: `- ${fmt(discountTotal)}`, color: '#ef4444' }] : []),
                  { label: 'الإجمالي الكلي', value: fmt(total), color: docType === 'invoice' ? '#059669' : '#7c3aed' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span className="text-sm font-black tabular-nums" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Print */}
          <button onClick={handlePrint} disabled={!items.length}
            className="w-full py-4 rounded-xl text-white font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: docType === 'invoice' ? '#059669' : '#7c3aed' }}>
            <Printer size={18} />
            {docType === 'invoice' ? 'طباعة الفاتورة' : 'طباعة عرض السعر'}
          </button>
        </div>
      </div>
    </div>
  );
}
