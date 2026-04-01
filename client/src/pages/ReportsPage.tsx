import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { reportsApi } from '../api/reports.ts';
import { apiClient } from '../api/client.ts';
import { settingsApi } from '../api/settings.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import CustomerLedgerModal from '../components/CustomerLedgerModal.tsx';
import SupplierLedgerModal from '../components/SupplierLedgerModal.tsx';
import SaleInvoiceDetailsModal from '../components/SaleInvoiceDetailsModal.tsx';
import PurchaseInvoiceDetailsModal from '../components/PurchaseInvoiceDetailsModal.tsx';
import { BarChart2, FileText, Package, TrendingUp, Search, Download, Warehouse } from 'lucide-react';



const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });

const today = new Date().toISOString().split('T')[0];
const monthStart = new Date(new Date().setDate(1)).toISOString().split('T')[0];



type ReportTab = 'sales' | 'purchases' | 'stock' | 'profit';

type WarehouseOption = {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
};

type WarehouseReportFields = {
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
};

type SalesReportResponse =
  Omit<Awaited<ReturnType<typeof reportsApi.sales>>['data'], 'data'> & {
    data: Array<
      Awaited<ReturnType<typeof reportsApi.sales>>['data']['data'][number] & WarehouseReportFields
    >;
  };

type PurchasesReportResponse =
  Omit<Awaited<ReturnType<typeof reportsApi.purchases>>['data'], 'data'> & {
    data: Array<
      Awaited<ReturnType<typeof reportsApi.purchases>>['data']['data'][number] & WarehouseReportFields
    >;
  };
type StockReportResponse = Awaited<ReturnType<typeof reportsApi.stock>>['data'];
type ProfitReportResponse = Awaited<ReturnType<typeof reportsApi.profit>>['data'];
const formatWarehouseLabel = (row: WarehouseReportFields) =>
  row.warehouse_name
    ? `${row.warehouse_name}${row.warehouse_code ? ` (${row.warehouse_code})` : ''}`
    : row.warehouse_code || (row.warehouse_id ? `#${row.warehouse_id}` : '—');

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

const STATUS_COLORS_LIGHT: Record<string, { bg: string; color: string }> = {
  paid: { bg: '#d1fae5', color: '#065f46' },
  partial: { bg: '#fef3c7', color: '#92400e' },
  unpaid: { bg: '#fee2e2', color: '#991b1b' },
  cancelled: { bg: '#f1f5f9', color: '#64748b' },
};

const STATUS_LABELS: Record<string, string> = {
  paid: 'مدفوع',
  partial: 'جزئي',
  unpaid: 'غير مدفوع',
  cancelled: 'ملغي',
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS_LIGHT[status] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-black"
      style={{ background: s.bg, color: s.color }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function pickApiError(error: unknown, fallback: string) {
  const e = error as {
    message?: string;
    response?: {
      status?: number;
      data?: {
        message?: string;
        error?: string;
      };
    };
  };

  return (
    e?.response?.data?.message ||
    e?.response?.data?.error ||
    (e?.response?.status ? `HTTP ${e.response.status}` : '') ||
    e?.message ||
    fallback
  );
}
function exportExcel(headers: string[], rows: (string | number)[][], filename: string, sheetName = 'تقرير') {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  void range;
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.replace(/\.csv$/, '.xlsx'));
}

export default function ReportsPage() {
  const { fmt } = useCurrency();

  const [tab, setTab] = useState<ReportTab>('sales');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const [salesData, setSalesData] = useState<SalesReportResponse | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);

  const [purData, setPurData] = useState<PurchasesReportResponse | null>(null);
  const [purLoading, setPurLoading] = useState(false);

  const [stockData, setStockData] = useState<Awaited<ReturnType<typeof reportsApi.stock>>['data'] | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockQ, setStockQ] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);

  const [profitData, setProfitData] = useState<ProfitReportResponse | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);

  const [customerLedger, setCustomerLedger] = useState<{ id: number; name: string } | null>(null);
  const [supplierLedger, setSupplierLedger] = useState<{ id: number; name: string } | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null);

  const [reportWarehouseId, setReportWarehouseId] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });

  const isMultiWarehouseEnabled = settings?.enable_multi_warehouse === 'true';

  const { data: warehouses = [] } = useQuery({
    queryKey: ['report-warehouses'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; warehouses: WarehouseOption[] }>('/warehouses', {
        params: { active: 'true' },
      });
      return res.data.warehouses ?? [];
    },
    enabled: isMultiWarehouseEnabled,
    staleTime: 30000,
  });
  const selectedReportWarehouse =
    isMultiWarehouseEnabled && reportWarehouseId
      ? warehouses.find((w) => String(w.id) === String(reportWarehouseId)) ?? null
      : null;
    const loadSales = async () => {
    setSalesLoading(true);
    setReportError(null);
    try {
      const res = await apiClient.get<SalesReportResponse>('/reports/sales', {
        params: {
          from,
          to,
          warehouse_id: isMultiWarehouseEnabled && reportWarehouseId ? reportWarehouseId : undefined,
        },
      });
      setSalesData(res.data);
    } catch (error) {
      console.error('reports/sales failed', error);
      setReportError(pickApiError(error, 'تعذر تحميل تقرير المبيعات'));
      setSalesData(null);
    }
    setSalesLoading(false);
  };

    const loadPurchases = async () => {
    setPurLoading(true);
    setReportError(null);
    try {
      const res = await apiClient.get<PurchasesReportResponse>('/reports/purchases', {
        params: {
          from,
          to,
          warehouse_id: isMultiWarehouseEnabled && reportWarehouseId ? reportWarehouseId : undefined,
        },
      });
      setPurData(res.data);
    } catch (error) {
      console.error('reports/purchases failed', error);
      setReportError(pickApiError(error, 'تعذر تحميل تقرير المشتريات'));
      setPurData(null);
    }
    setPurLoading(false);
  };
    const loadStock = async () => {
    setStockLoading(true);
    setReportError(null);
    try {
      const res = await apiClient.get<StockReportResponse>('/reports/stock', {
        params: {
          q: stockQ || undefined,
          low_stock: showLowStock || undefined,
          warehouse_id: isMultiWarehouseEnabled && reportWarehouseId ? reportWarehouseId : undefined,
        },
      });

      setStockData(res.data);
    } catch (error) {
      console.error('reports/stock failed', error);
      setReportError(pickApiError(error, 'تعذر تحميل تقرير المخزون'));
      setStockData(null);
    }
    setStockLoading(false);
  };

   const loadProfit = async () => {
    setProfitLoading(true);
    setReportError(null);
    try {
      const res = await apiClient.get<ProfitReportResponse>('/reports/profit', {
        params: {
          from,
          to,
          warehouse_id: isMultiWarehouseEnabled && reportWarehouseId ? reportWarehouseId : undefined,
        },
      });
      setProfitData(res.data);
    } catch (error) {
      console.error('reports/profit failed', error);
      setReportError(pickApiError(error, 'تعذر تحميل تقرير الربح والخسارة'));
      setProfitData(null);
    }
    setProfitLoading(false);
  };

  const TABS: Array<{ key: ReportTab; label: string; icon: React.ReactNode }> = [
    { key: 'sales', label: 'المبيعات', icon: <FileText className="w-4 h-4" /> },
    { key: 'purchases', label: 'المشتريات', icon: <BarChart2 className="w-4 h-4" /> },
    { key: 'stock', label: 'المخزون', icon: <Package className="w-4 h-4" /> },
    { key: 'profit', label: 'الربح والخسارة', icon: <TrendingUp className="w-4 h-4" /> },
  ];

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
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: '#e0f2fe', color: '#0ea5e9' }}
          >
            <BarChart2 className="w-5 h-5" />
          </div>

          <div>
            <h1 className="text-2xl md:text-[28px] font-black tracking-tight" style={text.heading}>
              التقارير
            </h1>
            <p className="text-sm font-semibold mt-1" style={text.secondary}>
              تقارير المبيعات والمشتريات والمخزون والربح
            </p>
          </div>
        </div>
      </div>
            {reportError && (
        <div
          className="rounded-2xl px-4 py-3 text-sm font-bold"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.22)',
            color: '#b91c1c',
          }}
        >
          {reportError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-black transition"
            style={
              tab === t.key
                ? { background: '#0ea5e9', color: '#fff' }
                : { ...subtleCard, color: 'var(--text-body)' }
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Sales */}
      {tab === 'sales' && (
        <div className="space-y-4">
          <DateFilterBar
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onSearch={loadSales}
            loading={salesLoading}
            showWarehouseFilter={isMultiWarehouseEnabled}
            warehouseId={reportWarehouseId}
            warehouses={warehouses}
            onWarehouseChange={setReportWarehouseId}
          />

          {salesData && (
            <>
              <SummaryRow
                cards={[
                  { label: 'إجمالي المبيعات', value: fmt(salesData.summary.totalRevenue), color: '#10b981' },
                  { label: 'المبالغ المحصلة', value: fmt(salesData.summary.totalPaid), color: '#3b82f6' },
                  { label: 'إجمالي الخصومات', value: fmt(salesData.summary.totalDiscount), color: '#f59e0b' },
                  { label: 'عدد الفواتير', value: String(salesData.summary.invoiceCount), color: 'var(--text-heading)' },
                ]}
              />

              <TableToolbar
                title={`${salesData.total} فاتورة`}
                onExport={() =>
                  exportExcel(
                    [
                      'رقم الفاتورة',
                      'العميل',
                      ...(isMultiWarehouseEnabled ? ['المستودع'] : []),
                      'الكاشير',
                      'الإجمالي',
                      'المدفوع',
                      'الحالة',
                      'التاريخ',
                    ],
                    salesData.data.map((r) => [
                      r.invoice_number,
                      r.customer_name ?? '—',
                      ...(isMultiWarehouseEnabled ? [formatWarehouseLabel(r)] : []),
                      r.cashier_name ?? '—',
                      r.total_amount,
                      r.paid_amount,
                      r.payment_status,
                      fmtDate(r.created_at),
                    ]),
                    `sales_${from}_${to}.xlsx`
                  )
                }
              />

              <ReportTable
                cols={[
                  'رقم الفاتورة',
                  'العميل',
                  ...(isMultiWarehouseEnabled ? ['المستودع'] : []),
                  'الكاشير',
                  'الإجمالي',
                  'المدفوع',
                  'الحالة',
                  'التاريخ',
                ]}
              >
                {salesData.data.length === 0 ? (
                  <EmptyRow cols={isMultiWarehouseEnabled ? 8 : 7} />
                ) : (
                  salesData.data.map((r, idx) => (
                    <tr
                      key={r.id}
                      className="border-t transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-subtle) 88%, transparent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)';
                      }}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedSaleId(r.id)}
                          className="font-mono text-xs text-sky-500 hover:underline focus:outline-none"
                          title="عرض تفاصيل فاتورة البيع"
                        >
                          {r.invoice_number}
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        {r.customer_id ? (
                          <button
                            onClick={() => setCustomerLedger({ id: r.customer_id!, name: r.customer_name ?? '—' })}
                            className="text-sm font-bold text-sky-600 hover:underline focus:outline-none"
                          >
                            {r.customer_name ?? 'زبون نقدي'}
                          </button>
                        ) : (
                          <span className="text-sm font-medium" style={text.body}>
                            {r.customer_name ?? 'زبون نقدي'}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs font-medium" style={text.secondary}>
                        {r.cashier_name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-left font-black" style={text.heading}>
                        {fmt(r.total_amount)}
                      </td>

                      <td className="px-4 py-3 text-left text-emerald-500 font-bold">
                        {fmt(r.paid_amount)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={r.payment_status} />
                      </td>

                      <td className="px-4 py-3 text-xs font-medium" style={text.muted}>
                        {fmtDate(r.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </ReportTable>
            </>
          )}
        </div>
      )}

      {/* Purchases */}
      {tab === 'purchases' && (
        <div className="space-y-4">
          <DateFilterBar
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onSearch={loadPurchases}
            loading={purLoading}
            showWarehouseFilter={isMultiWarehouseEnabled}
            warehouseId={reportWarehouseId}
            warehouses={warehouses}
            onWarehouseChange={setReportWarehouseId}
          />

          {purData && (
            <>
              <SummaryRow
                cards={[
                  { label: 'إجمالي المشتريات', value: fmt(purData.summary.totalAmount), color: '#f59e0b' },
                  { label: 'المدفوع للموردين', value: fmt(purData.summary.totalPaid), color: '#10b981' },
                  { label: 'المستحق للموردين', value: fmt(purData.summary.totalDebt), color: '#ef4444' },
                  { label: 'عدد الفواتير', value: String(purData.summary.count), color: 'var(--text-heading)' },
                ]}
              />

              <TableToolbar
                title={`${purData.total} فاتورة`}
                onExport={() =>
                  exportExcel(
                    [
                      'رقم الفاتورة',
                      'المورد',
                      ...(isMultiWarehouseEnabled ? ['المستودع'] : []),
                      'الإجمالي',
                      'المدفوع',
                      'الحالة',
                      'التاريخ',
                    ],
                    purData.data.map((r) => [
                      r.invoice_number,
                      r.supplier_name ?? '—',
                      ...(isMultiWarehouseEnabled ? [formatWarehouseLabel(r)] : []),
                      r.total_amount,
                      r.paid_amount,
                      r.payment_status,
                      fmtDate(r.created_at),
                    ]),
                    `purchases_${from}_${to}.xlsx`
                  )
                }
              />

              <ReportTable
                cols={[
                  'رقم الفاتورة',
                  'المورد',
                  ...(isMultiWarehouseEnabled ? ['المستودع'] : []),
                  'الإجمالي',
                  'المدفوع',
                  'الحالة',
                  'التاريخ',
                ]}
              >
                {purData.data.length === 0 ? (
                  <EmptyRow cols={isMultiWarehouseEnabled ? 7 : 6} />
                ) : (
                  purData.data.map((r, idx) => (
                    <tr
                      key={r.id}
                      className="border-t transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-subtle) 88%, transparent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)';
                      }}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedPurchaseId(r.id)}
                          className="font-mono text-xs text-amber-500 hover:underline focus:outline-none"
                          title="عرض تفاصيل فاتورة الشراء"
                        >
                          {r.invoice_number}
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        {r.supplier_id ? (
                          <button
                            onClick={() => setSupplierLedger({ id: r.supplier_id!, name: r.supplier_name ?? '—' })}
                            className="text-sm font-bold text-amber-600 hover:underline focus:outline-none"
                          >
                            {r.supplier_name ?? '—'}
                          </button>
                        ) : (
                          <span className="text-sm font-medium" style={text.body}>
                            {r.supplier_name ?? '—'}
                          </span>
                        )}
                      </td>

                      {isMultiWarehouseEnabled && (
                        <td className="px-4 py-3 text-xs font-medium" style={text.secondary}>
                          {formatWarehouseLabel(r)}
                        </td>
                      )}

                      <td className="px-4 py-3 text-left font-black" style={text.heading}>
                        {fmt(r.total_amount)}
                      </td>

                      <td className="px-4 py-3 text-left text-emerald-500 font-bold">
                        {fmt(r.paid_amount)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={r.payment_status} />
                      </td>

                      <td className="px-4 py-3 text-xs font-medium" style={text.muted}>
                        {fmtDate(r.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </ReportTable>
            </>
          )}
        </div>
      )}

      {/* Stock */}
      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
            <div className="flex gap-3 flex-wrap items-end">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={text.muted} />
                <input
                  value={stockQ}
                  onChange={(e) => setStockQ(e.target.value)}
                  placeholder="بحث بالاسم أو الكود..."
                  className="rounded-2xl px-3 py-2.5 text-sm font-medium outline-none pr-9 w-64"
                  style={inputStyle}
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={text.body}>
                <input
                  type="checkbox"
                  checked={showLowStock}
                  onChange={(e) => setShowLowStock(e.target.checked)}
                  className="rounded"
                />
                منتجات نفاد المخزون فقط
              </label>

              {isMultiWarehouseEnabled && (
                <div className="relative">
                  <Warehouse className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={text.muted} />
                  <select
                    value={reportWarehouseId}
                    onChange={(e) => setReportWarehouseId(e.target.value)}
                    className="rounded-2xl px-3 py-2.5 pr-9 text-sm font-medium outline-none min-w-[220px]"
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
              )}

              <SearchButton onClick={loadStock} loading={stockLoading} />
            </div>
          </div>

          {stockData && (
            <>
              <SummaryRow
                cards={[
                  {
                    label: selectedReportWarehouse ? 'عدد أصناف المستودع' : 'عدد الأصناف',
                    value: String(stockData.summary.totalProducts),
                    color: 'var(--text-heading)',
                  },
                  {
                    label: selectedReportWarehouse ? 'قيمة مخزون المستودع' : 'قيمة المخزون',
                    value: fmt(stockData.summary.totalStockValue),
                    color: '#3b82f6',
                  },
                  {
                    label: selectedReportWarehouse ? 'منخفضة في هذا المستودع' : 'أصناف قاربت النفاد',
                    value: String(stockData.summary.lowStockCount),
                    color: '#f59e0b',
                  },
                ]}
              />

              <TableToolbar
                title={
                  selectedReportWarehouse
                    ? `${stockData.data.length} صنف — ${selectedReportWarehouse.name}${selectedReportWarehouse.code ? ` (${selectedReportWarehouse.code})` : ''}`
                    : `${stockData.data.length} صنف`
                }
                onExport={() =>
                  exportExcel(
                    [
                      'الكود',
                      'المنتج',
                      'الفئة',
                      selectedReportWarehouse ? 'كمية المستودع' : 'الكمية',
                      'الحد الأدنى',
                      'التكلفة',
                      'الجملة',
                      'التجزئة',
                    ],
                    stockData.data.map((r) => [
                      r.barcode,
                      r.name,
                      r.category_name ?? '—',
                      r.stock_quantity,
                      r.min_stock_level,
                      r.purchase_price,
                      r.wholesale_price,
                      r.retail_price,
                    ]),
                    selectedReportWarehouse
                      ? `stock_${selectedReportWarehouse.code || selectedReportWarehouse.id}.csv`
                      : 'stock_report.csv'
                  )
                }
              />

              <ReportTable
                cols={[
                  'الكود',
                  'المنتج',
                  'الفئة',
                  selectedReportWarehouse ? 'كمية المستودع' : 'الكمية',
                  'الحد الأدنى',
                  'تكلفة',
                  'جملة',
                  'تجزئة',
                ]}
              >
                {stockData.data.length === 0 ? (
                  <EmptyRow cols={8} />
                ) : (
                  stockData.data.map((r, idx) => {
                    const isLow = parseFloat(r.stock_quantity) <= parseFloat(r.min_stock_level);
                    return (
                      <tr
                        key={r.id}
                        className="border-t transition-colors"
                        style={{
                          borderColor: 'var(--border)',
                          background: isLow
                            ? 'rgba(245,158,11,0.06)'
                            : idx % 2 === 0
                              ? 'var(--bg-card)'
                              : 'var(--bg-subtle)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-subtle) 88%, transparent)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isLow
                            ? 'rgba(245,158,11,0.06)'
                            : idx % 2 === 0
                              ? 'var(--bg-card)'
                              : 'var(--bg-subtle)';
                        }}
                      >
                        <td className="px-4 py-3 font-mono text-xs" style={text.muted}>
                          {r.barcode}
                        </td>
                        <td className="px-4 py-3 font-bold" style={text.heading}>
                          {r.name}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium" style={text.secondary}>
                          {r.category_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-left font-black" style={isLow ? { color: '#f59e0b' } : text.heading}>
                          {r.stock_quantity}
                        </td>
                        <td className="px-4 py-3 text-left font-medium" style={text.secondary}>
                          {r.min_stock_level}
                        </td>
                        <td className="px-4 py-3 text-left font-medium" style={text.body}>
                          {fmt(r.purchase_price)}
                        </td>
                        <td className="px-4 py-3 text-left font-medium" style={text.body}>
                          {fmt(r.wholesale_price)}
                        </td>
                        <td className="px-4 py-3 text-left font-medium" style={text.body}>
                          {fmt(r.retail_price)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </ReportTable>
            </>
          )}
        </div>
      )}

      {/* Profit */}
      {tab === 'profit' && (
        <div className="space-y-4">
          <DateFilterBar
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onSearch={loadProfit}
            loading={profitLoading}
            showWarehouseFilter={isMultiWarehouseEnabled}
            warehouseId={reportWarehouseId}
            warehouses={warehouses}
            onWarehouseChange={setReportWarehouseId}
          />
          {isMultiWarehouseEnabled && selectedReportWarehouse && (
            <div
              className="rounded-2xl px-4 py-3 text-sm font-semibold"
              style={{
                background: 'rgba(14, 165, 233, 0.08)',
                border: '1px solid rgba(14, 165, 233, 0.22)',
                color: 'var(--text-secondary)',
              }}
            >
              تم فلترة المبيعات والمرتجعات والتكلفة حسب المستودع المحدد،
              بينما المصاريف العامة مستبعدة مؤقتًا من هذا العرض حتى لا يظهر صافي مضلل.
            </div>
          )}

          {profitData && (
            <>
              <SummaryRow
                cards={[
                  {
                    label: selectedReportWarehouse ? 'إيرادات المستودع' : 'إجمالي الإيرادات',
                    value: fmt(profitData.summary.totalRevenue),
                    color: '#10b981',
                  },
                  {
                    label: selectedReportWarehouse ? 'تكلفة المستودع' : 'إجمالي التكلفة',
                    value: fmt(profitData.summary.totalCost),
                    color: '#ef4444',
                  },
                  {
                    label: selectedReportWarehouse ? 'ربح المستودع' : 'ربح المبيعات',
                    value: fmt(profitData.summary.grossProfit),
                    color: profitData.summary.grossProfit >= 0 ? '#10b981' : '#ef4444',
                  },
                  {
                    label: selectedReportWarehouse ? 'المصاريف المطبقة' : 'إجمالي المصاريف',
                    value: fmt(profitData.summary.totalExpenses ?? 0),
                    color: '#f59e0b',
                  },
                  {
                    label: selectedReportWarehouse ? 'الصافي بعد المصاريف المطبقة' : 'صافي الربح',
                    value: fmt(profitData.summary.netProfit ?? profitData.summary.grossProfit),
                    color: (profitData.summary.netProfit ?? profitData.summary.grossProfit) >= 0 ? '#10b981' : '#ef4444',
                  },
                  {
                    label: selectedReportWarehouse ? 'هامش الربح' : 'هامش الربح الصافي',
                    value: `${profitData.summary.margin}%`,
                    color: '#0ea5e9',
                  },
                ]}
              />

              <TableToolbar
                title={
                  selectedReportWarehouse
                    ? `${profitData.data.length} منتج — ${selectedReportWarehouse.name}${selectedReportWarehouse.code ? ` (${selectedReportWarehouse.code})` : ''}`
                    : `${profitData.data.length} منتج`
                }
                onExport={() =>
                  exportExcel(
                    ['المنتج', 'الكود', 'الكمية الصافية', 'المرتجع', 'الإيرادات الصافية', 'التكلفة الصافية', 'الربح الإجمالي'],
                    profitData.data.map((r) => [
                      r.product_name,
                      r.sku ?? '—',
                      r.total_sold,
                      r.total_returned,
                      r.total_revenue,
                      r.total_cost,
                      r.gross_profit,
                    ]),
                    `profit_${from}_${to}.xlsx`
                  )
                }
              />

              <ReportTable cols={['المنتج', 'الكود', 'الكمية', 'الإيرادات', 'التكلفة', 'الربح']}>
                {profitData.data.length === 0 ? (
                  <EmptyRow cols={6} />
                ) : (
                  profitData.data.map((r, idx) => {
                    const profit = parseFloat(String(r.gross_profit));
                    return (
                      <tr
                        key={r.id}
                        className="border-t transition-colors"
                        style={{
                          borderColor: 'var(--border)',
                          background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-subtle) 88%, transparent)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)';
                        }}
                      >
                        <td className="px-4 py-3 font-bold" style={text.heading}>
                          {r.product_name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs" style={text.muted}>
                          {r.sku ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-left font-medium" style={text.body}>
                          {r.total_sold}
                        </td>
                        <td className="px-4 py-3 text-left text-emerald-500 font-bold">
                          {fmt(r.total_revenue)}
                        </td>
                        <td className="px-4 py-3 text-left text-red-500 font-bold">
                          {fmt(r.total_cost)}
                        </td>
                        <td
                          className="px-4 py-3 text-left font-black"
                          style={{ color: profit >= 0 ? '#10b981' : '#ef4444' }}
                        >
                          {fmt(r.gross_profit)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </ReportTable>
            </>
          )}
        </div>
      )}

      <SaleInvoiceDetailsModal
        saleId={selectedSaleId}
        open={selectedSaleId !== null}
        onClose={() => setSelectedSaleId(null)}
      />

      <PurchaseInvoiceDetailsModal
        purchaseId={selectedPurchaseId}
        open={selectedPurchaseId !== null}
        onClose={() => setSelectedPurchaseId(null)}
      />

      {customerLedger && (
        <CustomerLedgerModal
          customerId={customerLedger.id}
          customerName={customerLedger.name}
          onClose={() => setCustomerLedger(null)}
        />
      )}

      {supplierLedger && (
        <SupplierLedgerModal
          supplierId={supplierLedger.id}
          supplierName={supplierLedger.name}
          onClose={() => setSupplierLedger(null)}
        />
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function DateFilterBar({
  from,
  to,
  onFromChange,
  onToChange,
  onSearch,
  loading,
  showWarehouseFilter = false,
  warehouseId = '',
  warehouses = [],
  onWarehouseChange,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  showWarehouseFilter?: boolean;
  warehouseId?: string;
  warehouses?: WarehouseOption[];
  onWarehouseChange?: (v: string) => void;
}) {
  return (
    <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs font-black mb-1.5" style={text.secondary}>
            من
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="rounded-2xl px-3 py-2.5 text-sm font-medium outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-xs font-black mb-1.5" style={text.secondary}>
            إلى
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="rounded-2xl px-3 py-2.5 text-sm font-medium outline-none"
            style={inputStyle}
          />
        </div>

        {showWarehouseFilter && (
          <div>
            <label className="block text-xs font-black mb-1.5" style={text.secondary}>
              المستودع
            </label>
            <div className="relative">
              <Warehouse
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={text.muted}
              />
              <select
                value={warehouseId}
                onChange={(e) => onWarehouseChange?.(e.target.value)}
                className="rounded-2xl px-3 py-2.5 pr-9 text-sm font-medium outline-none min-w-[220px]"
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
        )}

        <SearchButton onClick={onSearch} loading={loading} />
      </div>
    </div>
  );
}

function SearchButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-50 transition hover:opacity-90"
      style={{ background: '#0ea5e9' }}
    >
      <Search className="w-4 h-4" />
      {loading ? 'جاري...' : 'عرض'}
    </button>
  );
}

function SummaryRow({ cards }: { cards: Array<{ label: string; value: string; color: string }> }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-3xl p-4 md:p-5 transition-transform duration-200 hover:-translate-y-[1px]"
          style={surfaceCard}
        >
          <p className="text-[13px] font-semibold mb-1" style={text.secondary}>
            {c.label}
          </p>
          <p className="text-2xl font-black tracking-tight" style={{ color: c.color }}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function TableToolbar({ title, onExport }: { title: string; onExport: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-sm font-semibold" style={text.secondary}>
        {title}
      </span>

      <button
        onClick={onExport}
        className="flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-2xl transition hover:opacity-85"
        style={{ ...subtleCard, color: 'var(--text-body)' }}
      >
        <Download className="w-4 h-4" />
        تصدير Excel
      </button>
    </div>
  );
}

function ReportTable({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              {cols.map((c) => (
                <th
                  key={c}
                  className="px-4 py-3.5 text-right text-xs font-black"
                  style={text.secondary}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center py-10 text-sm font-semibold" style={text.muted}>
        لا توجد بيانات
      </td>
    </tr>
  );
}
