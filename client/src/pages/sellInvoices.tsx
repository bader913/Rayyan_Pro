import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Search,
  RefreshCw,
  Eye,
  X,
  User,
  CalendarDays,
  Wallet,
  CreditCard,
  Package,
} from 'lucide-react';
import { reportsApi } from '../api/reports.ts';
import { apiClient } from '../api/client.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import CustomerLedgerModal from '../components/CustomerLedgerModal.tsx';
import SaleInvoiceDetailsModal from '../components/SaleInvoiceDetailsModal.tsx';
type SaleRow = {
  id: number;
  invoice_number: string;
  customer_id?: number | null;
  customer_name?: string | null;
  payment_method?: string | null;
  sale_type?: string | null;
  total_amount: string | number;
  paid_amount?: string | number;
  sale_discount?: string | number;
  created_at: string;
  notes?: string | null;
  items_preview?: string | null;
};

type SaleItem = {
  id?: number;
  product_id?: number;
  product_name?: string | null;
  product_unit?: string | null;
  quantity: string | number;
  unit_price: string | number;
  total_price?: string | number;
  item_discount?: string | number;
};

type SaleDetails = SaleRow & {
  shift_id?: number | null;
  pos_terminal_id?: number | null;
  items?: SaleItem[];
};

type WarehouseOption = {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
};

const PAGE_SIZE = 20;

const surfaceCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

const subtleCard: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
};

const text = {
  heading: { color: 'var(--text-heading)' } as React.CSSProperties,
  body: { color: 'var(--text-body)' } as React.CSSProperties,
  secondary: { color: 'var(--text-secondary)' } as React.CSSProperties,
  muted: { color: 'var(--text-muted)' } as React.CSSProperties,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  color: 'var(--text-body)',
};

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function getMonthStartString() {
  const d = new Date();
  d.setDate(1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fmtDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtNumber(value: number) {
  return value.toLocaleString('ar-EG-u-nu-latn', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function paymentMethodLabel(method?: string | null) {
  switch (method) {
    case 'cash':
      return 'نقدي';
    case 'card':
      return 'بطاقة';
    case 'credit':
      return 'آجل';
    case 'mixed':
      return 'مختلط';
    default:
      return method || '—';
  }
}

function saleTypeLabel(type?: string | null) {
  switch (type) {
    case 'retail':
      return 'مفرق';
    case 'wholesale':
      return 'جملة';
    default:
      return type || '—';
  }
}
function splitItemsPreview(preview?: string | null) {
  const raw = String(preview ?? '').trim();
  if (!raw) return { items: [] as string[], extra: '' };

  const extraMatch = raw.match(/\s\+(\d+)$/);
  const extra = extraMatch ? `+${extraMatch[1]}` : '';
  const base = extraMatch ? raw.slice(0, extraMatch.index).trim() : raw;

  const items = base
    .split('،')
    .map((part) => part.trim())
    .filter(Boolean);

  return { items, extra };
}

export default function InvoicesPage() {
  const { fmt } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = getTodayString();
  const monthStart = getMonthStartString();
  const initialToday = searchParams.get('today') === '1';
  const initialDateFrom = initialToday ? today : (searchParams.get('date_from') || monthStart);
  const initialDateTo = initialToday ? today : (searchParams.get('date_to') || today);
  const initialQ = searchParams.get('q') || '';
  const initialWarehouseIdRaw = searchParams.get('warehouse_id');
  const initialWarehouseId = initialWarehouseIdRaw ? parseInt(initialWarehouseIdRaw, 10) : null;
  const initialPage = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);

  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [warehouseId, setWarehouseId] = useState<number | ''>(initialWarehouseId && !Number.isNaN(initialWarehouseId) ? initialWarehouseId : '');
  const [page, setPage] = useState(initialPage);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedQ) params.set('q', debouncedQ);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (warehouseId) params.set('warehouse_id', String(warehouseId));
    if (page > 1) params.set('page', String(page));

    setSearchParams(params, { replace: true });
  }, [debouncedQ, dateFrom, dateTo, warehouseId, page, setSearchParams]);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['sales-invoices-warehouses'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; warehouses: WarehouseOption[] }>('/warehouses', {
        params: { active: 'true' },
      });
      return res.data.warehouses ?? [];
    },
    staleTime: 30000,
  });

  const {
    data: salesResponse,
    isLoading: salesLoading,
    isFetching: salesFetching,
    error: salesError,
    refetch: refetchSales,
  } = useQuery({
    queryKey: ['sales-invoices-page', debouncedQ, dateFrom, dateTo, warehouseId, page],
    queryFn: () =>
      apiClient
        .get('/sales', {
          params: {
            q: debouncedQ || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            warehouse_id: warehouseId || undefined,
            page,
            limit: PAGE_SIZE,
          },
        })
        .then((r) =>
          r.data as {
            sales?: SaleRow[];
            pagination?: { total: number; page: number; limit: number; pages: number };
          }
        ),
    staleTime: 15000,
  });

  const {
    data: saleDetailsResponse,
    isLoading: saleDetailsLoading,
  } = useQuery({
    queryKey: ['sale-details', selectedSaleId],
    queryFn: () =>
      apiClient
        .get(`/sales/${selectedSaleId}`)
        .then((r) => r.data as { sale: SaleDetails }),
    enabled: selectedSaleId !== null,
    staleTime: 10000,
  });

  const sales = useMemo(() => {
    return Array.isArray(salesResponse?.sales) ? salesResponse.sales : [];
  }, [salesResponse]);

  const totalCount = Number(salesResponse?.pagination?.total ?? 0);
  const totalPages = Math.max(1, Number(salesResponse?.pagination?.pages ?? 1));

  const pageSalesTotal = useMemo(
    () => sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0),
    [sales]
  );

  const pagePaidTotal = useMemo(
    () => sales.reduce((sum, sale) => sum + Number(sale.paid_amount || 0), 0),
    [sales]
  );

  
useEffect(() => {
  if (page > totalPages) {
    setPage(totalPages);
  }
}, [page, totalPages]);
  const resetFilters = () => {
    setQ('');
    setDebouncedQ('');
    setDateFrom('');
    setDateTo('');
    setWarehouseId('');
    setPage(1);
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div
        className="rounded-3xl px-5 py-4 md:px-6 md:py-5"
        style={{
          ...surfaceCard,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle)) 0%, var(--bg-card) 100%)',
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl md:text-[28px] font-black tracking-tight" style={text.heading}>
              فواتير المبيعات
            </h1>
            <p className="text-sm font-semibold mt-1" style={text.secondary}>
              استعراض جميع فواتير البيع مع الفلاتر والتفاصيل الكاملة
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
  onClick={() => {
    const t = getTodayString();
    setDateFrom(t);
    setDateTo(t);
    setPage(1);
  }}
  className="px-4 py-2.5 rounded-2xl text-sm font-black transition"
  style={{
    ...subtleCard,
    color: 'var(--text-body)',
    background:
      dateFrom === getTodayString() && dateTo === getTodayString()
        ? 'rgba(37,99,235,0.10)'
        : 'var(--bg-subtle)',
    border:
      dateFrom === getTodayString() && dateTo === getTodayString()
        ? '1px solid rgba(37,99,235,0.25)'
        : '1px solid var(--border)',
  }}
>
  فواتير اليوم
</button>

            <button
              onClick={() => refetchSales()}
              className="px-4 py-2.5 rounded-2xl text-sm font-black transition flex items-center gap-2"
              style={{ ...subtleCard, color: 'var(--text-body)' }}
            >
              <RefreshCw size={15} />
              تحديث
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-black mb-1.5" style={text.secondary}>
              بحث
            </label>
            <div className="relative">
              <Search
                size={15}
                className="absolute top-1/2 -translate-y-1/2 right-3"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="رقم الفاتورة أو اسم العميل"
                className="w-full pr-9 pl-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black mb-1.5" style={text.secondary}>
              من تاريخ
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-black mb-1.5" style={text.secondary}>
              إلى تاريخ
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-black mb-1.5" style={text.secondary}>
              المستودع
            </label>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value ? parseInt(e.target.value, 10) : '');
                setPage(1);
              }}
              className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
              style={inputStyle}
            >
              <option value="">كل المستودعات</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={resetFilters}
            className="px-4 py-2.5 rounded-2xl text-sm font-black transition"
            style={{ ...subtleCard, color: 'var(--text-body)' }}
          >
            تصفير الفلاتر
          </button>

          {(salesFetching || salesLoading) && (
            <span className="text-xs font-bold" style={text.muted}>
              جارٍ تحميل البيانات...
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <SummaryCard
          icon={<FileText size={18} />}
          label="عدد الفواتير"
          value={fmtNumber(totalCount)}
          sub="حسب الفلاتر الحالية"
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
        />
        <SummaryCard
          icon={<Wallet size={18} />}
          label="إجمالي الصفحة الحالية"
          value={fmt(pageSalesTotal)}
          sub={`${fmtNumber(sales.length)} فاتورة معروضة`}
          iconBg="#d1fae5"
          iconColor="#065f46"
        />
        <SummaryCard
          icon={<CreditCard size={18} />}
          label="المقبوض في الصفحة"
          value={fmt(pagePaidTotal)}
          sub="مجموع المدفوع في النتائج المعروضة"
          iconBg="#fef3c7"
          iconColor="#92400e"
        />
      </div>

      {/* Error */}
      {salesError ? (
        <div className="rounded-3xl p-8 text-center" style={surfaceCard}>
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)' }}
          >
            <RefreshCw className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>

          <p className="text-sm font-bold" style={text.body}>
            تعذّر تحميل فواتير المبيعات
          </p>
          <p className="text-xs mt-2 font-medium" style={text.muted}>
            تأكد من الصلاحيات أو من اتصال السيرفر
          </p>
        </div>
      ) : null}

      {/* Table */}
      {!salesError && (
        <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
          <div
            className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-black border-b"
            style={{
              background: 'var(--bg-subtle)',
              ...text.secondary,
              borderColor: 'var(--border)',
            }}
          >
            <div className="col-span-2">رقم الفاتورة</div>
            <div className="col-span-2">العميل</div>
            <div className="col-span-1 text-center">طريقة الدفع</div>
            <div className="col-span-1 text-center">نوع البيع</div>
            <div className="col-span-3">أبرز الأصناف</div>
            <div className="col-span-1 text-center">الإجمالي</div>
            <div className="col-span-2 text-left">التاريخ</div>
          </div>

          {salesLoading ? (
            <div
              className="p-10 text-center text-sm font-semibold"
              style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
            >
              جارٍ تحميل الفواتير...
            </div>
          ) : sales.length === 0 ? (
            <div
              className="p-10 text-center text-sm font-semibold"
              style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
            >
              لا توجد فواتير مطابقة
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)' }}>
              {sales.map((sale, idx) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)',
                  }}
                >
                  <div className="col-span-2 min-w-0">
                    <button
                      onClick={() => setSelectedSaleId(sale.id)}
                      className="text-sm font-black truncate hover:underline"
                      style={{ color: '#2563eb' }}
                      title="عرض تفاصيل الفاتورة"
                    >
                      {sale.invoice_number}
                    </button>
                  </div>

                  <div className="col-span-2 text-sm truncate">
                    {sale.customer_id && sale.customer_name ? (
                      <button
                        onClick={() =>
                          setLedgerCustomer({ id: sale.customer_id!, name: sale.customer_name! })
                        }
                        className="truncate hover:underline transition text-right font-bold"
                        style={{ color: '#2563eb' }}
                        title="فتح كشف حساب العميل"
                      >
                        {sale.customer_name}
                      </button>
                    ) : (
                      <span style={text.body}>
                        {sale.customer_name || 'زبون نقدي'}
                      </span>
                    )}
                  </div>

                  <div className="col-span-1 text-center text-xs font-bold" style={text.secondary}>
                    {paymentMethodLabel(sale.payment_method)}
                  </div>

                  <div className="col-span-1 text-center text-xs font-bold" style={text.secondary}>
                    {saleTypeLabel(sale.sale_type)}
                  </div>

                  <div
                    className="col-span-3 min-w-0"
                    title={sale.items_preview || '—'}
                  >
                    {sale.items_preview ? (
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const { items, extra } = splitItemsPreview(sale.items_preview);

                          return (
                            <>
                              {items.map((item, index) => (
                                <span
                                  key={`${sale.id}-item-${index}`}
                                  className="inline-flex items-center px-2 py-1 rounded-xl text-[11px] font-black max-w-full"
                                  style={{
                                    background: 'color-mix(in srgb, var(--bg-subtle) 82%, var(--bg-card))',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-body)',
                                  }}
                                >
                                  <span className="truncate">{item}</span>
                                </span>
                              ))}

                              {extra && (
                                <span
                                  className="inline-flex items-center px-2 py-1 rounded-xl text-[11px] font-black"
                                  style={{
                                    background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                                    border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
                                    color: 'var(--primary)',
                                  }}
                                >
                                  {extra}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs font-bold" style={text.muted}>—</span>
                    )}
                  </div>

                  <div className="col-span-1 text-center text-sm font-black" style={text.heading}>
                    {fmt(Number(sale.total_amount || 0))}
                  </div>

                  <div className="col-span-2 text-left text-xs font-medium" style={text.muted}>
                    {fmtDateTime(sale.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!salesError && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2.5 rounded-2xl text-sm font-black transition disabled:opacity-40"
            style={{ ...subtleCard, color: 'var(--text-body)' }}
          >
            السابق
          </button>

          <div
            className="px-4 py-2.5 rounded-2xl text-sm font-black"
            style={{ ...surfaceCard, color: 'var(--text-body)' }}
          >
            صفحة {fmtNumber(page)} من {fmtNumber(totalPages)}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2.5 rounded-2xl text-sm font-black transition disabled:opacity-40"
            style={{ ...subtleCard, color: 'var(--text-body)' }}
          >
            التالي
          </button>
        </div>
      )}

      {/* Details Modal */}
      <SaleInvoiceDetailsModal
  saleId={selectedSaleId}
  open={selectedSaleId !== null}
  onClose={() => setSelectedSaleId(null)}
/>

      {ledgerCustomer && (
        <CustomerLedgerModal
          customerId={ledgerCustomer.id}
          customerName={ledgerCustomer.name}
          onClose={() => setLedgerCustomer(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  iconBg,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div
      className="rounded-3xl p-4 md:p-5 transition-transform duration-200 hover:-translate-y-[1px]"
      style={surfaceCard}
    >
      <div
        className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-4 flex-shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>

      <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </p>

      <p className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-heading)' }}>
        {value}
      </p>

      <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
        {sub}
      </p>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl p-4" style={subtleCard}>
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color: 'var(--text-muted)' }}>{icon}</div>
        <div className="text-xs font-black" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </div>
      </div>
      <div className="text-sm font-black" style={{ color: 'var(--text-body)' }}>
        {value}
      </div>
    </div>
  );
}