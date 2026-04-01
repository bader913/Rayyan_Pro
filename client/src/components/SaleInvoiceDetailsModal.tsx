import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { openPrintWindowHtml } from '../utils/printWindow.ts';
import { settingsApi } from '../api/settings.ts';
import { printSaleReceipt } from '../utils/print.ts';
import { printInvoiceDocumentA4 } from '../utils/invoiceDocumentPrint.ts';
import {
  FileText,
  X,
  User,
  CalendarDays,
  Wallet,
  CreditCard,
  Package,
  Printer,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { apiClient } from '../api/client.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import CustomerLedgerModal from './CustomerLedgerModal.tsx';

function isCashWalkInCustomer(name?: string | null) {
  const v = String(name || '').trim();
  return (
    !v ||
    v === 'زبون نقدي' ||
    v === 'عميل نقدي' ||
    v === 'عميل عادي' ||
    v === 'نقدي' ||
    v === 'كاش'
  );
}
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
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  items?: SaleItem[];
};

type SaleReturnItem = {
  sale_item_id?: number | null;
  product_id?: number | null;
  quantity?: string | number | null;
  returned_quantity?: string | number | null;
};

type SaleReturnRow = {
  id: number;
  items?: SaleReturnItem[];
  return_items?: SaleReturnItem[];
  sale_return_items?: SaleReturnItem[];
};

function normalizeSaleReturnsPayload(payload: unknown): SaleReturnRow[] {
  if (Array.isArray(payload)) return payload as SaleReturnRow[];

  if (payload && typeof payload === 'object') {
    const maybeObject = payload as {
      returns?: SaleReturnRow[];
      data?: SaleReturnRow[];
      saleReturns?: SaleReturnRow[];
    };

    if (Array.isArray(maybeObject.returns)) return maybeObject.returns;
    if (Array.isArray(maybeObject.data)) return maybeObject.data;
    if (Array.isArray(maybeObject.saleReturns)) return maybeObject.saleReturns;
  }

  return [];
}

function extractReturnItems(row: SaleReturnRow): SaleReturnItem[] {
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.return_items)) return row.return_items;
  if (Array.isArray(row.sale_return_items)) return row.sale_return_items;
  return [];
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

export default function SaleInvoiceDetailsModal({
  saleId,
  open,
  onClose,
}: {
  saleId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { fmt, rate, symbol } = useCurrency();
  const navigate = useNavigate();
    const [ledgerCustomer, setLedgerCustomer] = React.useState<{ id: number; name: string } | null>(null);
    const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });

  const { data: saleDetailsResponse, isLoading: saleDetailsLoading } = useQuery({
    queryKey: ['sale-details-modal', saleId],
    queryFn: () =>
      apiClient
        .get(`/sales/${saleId}`)
        .then((r) => r.data as { sale: SaleDetails }),
    enabled: open && saleId !== null,
    staleTime: 10000,
  });

  const selectedSale = saleDetailsResponse?.sale ?? null;
  const saleItems = selectedSale?.items ?? [];
  const canOpenCustomerLedger =
    !!selectedSale?.customer_id &&
    !!selectedSale?.customer_name &&
    !isCashWalkInCustomer(selectedSale.customer_name);
  // for invoice ret

  const shouldCheckReturnStatus = !!selectedSale;

  const { data: saleReturns = [], isLoading: saleReturnsLoading } = useQuery({
    queryKey: ['sale-returns-status', saleId],
    queryFn: () =>
      apiClient
        .get(`/sales/${saleId}/returns`)
        .then((r) => normalizeSaleReturnsPayload(r.data)),
    enabled: open && saleId !== null && shouldCheckReturnStatus,
    staleTime: 10000,
  });

  const saleReturnStatus = React.useMemo(() => {
    if (!selectedSale) {
      return { kind: 'none' as const, returnsCount: 0 };
    }

    if (saleReturns.length === 0) {
      return { kind: 'none' as const, returnsCount: 0 };
    }

    const returnedQtyBySaleItem = new Map<number, number>();

    for (const saleReturn of saleReturns) {
      for (const item of extractReturnItems(saleReturn)) {
        const saleItemId = Number(item.sale_item_id || 0);
        const qty = Number(item.quantity ?? item.returned_quantity ?? 0);

        if (!saleItemId || !Number.isFinite(qty) || qty <= 0) continue;

        returnedQtyBySaleItem.set(
          saleItemId,
          (returnedQtyBySaleItem.get(saleItemId) || 0) + qty
        );
      }
    }

    const comparableSaleItems = saleItems.filter(
      (item) => Number(item.id || 0) > 0 && Number(item.quantity || 0) > 0
    );

    if (comparableSaleItems.length === 0) {
      return { kind: 'partial' as const, returnsCount: saleReturns.length };
    }

    let returnedLines = 0;
    let fullLines = 0;

    for (const item of comparableSaleItems) {
      const saleItemId = Number(item.id || 0);
      const soldQty = Number(item.quantity || 0);
      const returnedQty = returnedQtyBySaleItem.get(saleItemId) || 0;

      if (returnedQty > 0) {
        returnedLines += 1;
      }

      if (returnedQty + 0.000001 >= soldQty) {
        fullLines += 1;
      }
    }

    if (fullLines === comparableSaleItems.length) {
      return { kind: 'full' as const, returnsCount: saleReturns.length };
    }

    if (returnedLines > 0) {
      return { kind: 'partial' as const, returnsCount: saleReturns.length };
    }

    return { kind: 'none' as const, returnsCount: 0 };
  }, [selectedSale, saleItems, saleReturns]);

    const handlePrintSale = () => {
    if (!selectedSale) return;

    const rows = saleItems.map((item, idx) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const discount = Number(item.item_discount || 0);
      const total =
        item.total_price !== undefined
          ? Number(item.total_price || 0)
          : quantity * unitPrice - discount;

      return [
        String(idx + 1),
        `${item.product_name || 'صنف'}${item.product_unit ? ` (${item.product_unit})` : ''}`,
        fmtNumber(quantity),
        fmt(unitPrice),
        discount > 0 ? fmt(discount) : '—',
        fmt(total),
      ];
    });

    const cards = [
      { label: 'العميل', value: selectedSale.customer_name || 'زبون نقدي' },
      { label: 'إجمالي الفاتورة', value: fmt(Number(selectedSale.total_amount || 0)) },
      { label: 'المدفوع', value: fmt(Number(selectedSale.paid_amount || 0)) },
      { label: 'عدد الأصناف', value: fmtNumber(saleItems.length) },
      ...(selectedSale.warehouse_id
        ? [
            {
              label: 'المستودع',
              value: selectedSale.warehouse_name
                ? `${selectedSale.warehouse_name}${selectedSale.warehouse_code ? ` (${selectedSale.warehouse_code})` : ''}`
                : selectedSale.warehouse_code || `#${selectedSale.warehouse_id}`,
            },
          ]
        : []),
    ];

    printInvoiceDocumentA4({
      title: 'فاتورة مبيعات',
      accentColor: '#2563eb',
      invoiceNumber: selectedSale.invoice_number,
      dateText: fmtDateTime(selectedSale.created_at),
      sideMetaLines: [
        `نوع البيع: ${saleTypeLabel(selectedSale.sale_type)}`,
        `طريقة الدفع: ${paymentMethodLabel(selectedSale.payment_method)}`,
      ],
      cards,
      columns: [
        { label: '#', width: '50px', align: 'center' },
        { label: 'الصنف', align: 'right' },
        { label: 'الكمية', width: '90px', align: 'center' },
        { label: 'سعر الوحدة', width: '140px', align: 'center' },
        { label: 'الخصم', width: '120px', align: 'center' },
        { label: 'الإجمالي', width: '140px', align: 'center' },
      ],
      rows,
      totals: [
        { label: 'الإجمالي', value: fmt(Number(selectedSale.total_amount || 0)) },
        { label: 'المدفوع', value: fmt(Number(selectedSale.paid_amount || 0)), highlight: true },
      ],
      notes: selectedSale.notes || undefined,
    });
  };
    const handlePrintThermal = () => {
    if (!selectedSale) return;

    printSaleReceipt(
      {
        invoice_number: selectedSale.invoice_number,
        created_at: selectedSale.created_at,
        customer_name: selectedSale.customer_name,
        sale_type: selectedSale.sale_type,
        payment_method: selectedSale.payment_method,
        total_amount: selectedSale.total_amount,
        paid_amount: selectedSale.paid_amount,
        sale_discount: selectedSale.sale_discount,
        notes: selectedSale.notes,
        items: saleItems.map((item) => ({
          product_name: item.product_name || 'صنف',
          quantity: item.quantity,
          unit: item.product_unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
          item_discount: item.item_discount,
        })),
      },
      settings?.shop_name ?? 'ريان برو',
      { symbol, rate }
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <div
              className="text-lg font-black"
              style={{ color: 'var(--text-heading)' }}
            >
              تفاصيل فاتورة المبيعات
            </div>
            <div
              className="text-xs mt-1"
              style={{ color: 'var(--text-muted)' }}
            >
              عرض كامل للفاتورة مع الطباعة والمرتجع
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintSale}
              disabled={!selectedSale}
              className="px-4 py-2 rounded-xl text-sm font-black transition-colors disabled:opacity-40 flex items-center gap-2"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              <Printer size={15} />
              A4 كبيرة
            </button>

            <button
              onClick={handlePrintThermal}
              disabled={!selectedSale}
              className="px-4 py-2 rounded-xl text-sm font-black transition-colors disabled:opacity-40 flex items-center gap-2"
              style={{
                background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 26%, var(--border))',
              }}
            >
              <Printer size={15} />
              حراري صغيرة
            </button>

            <button
              onClick={() => {
                if (!selectedSale || saleReturnStatus.kind === 'full') return;
                onClose();
                navigate(`/returns?saleId=${selectedSale.id}`);
              }}
              disabled={
                !selectedSale ||
                (shouldCheckReturnStatus && saleReturnsLoading) ||
                saleReturnStatus.kind === 'full'
              }
              className="px-4 py-2 rounded-xl text-sm font-black text-white transition-opacity disabled:opacity-40 flex items-center gap-2"
              style={{
                background:
                  saleReturnStatus.kind === 'full'
                    ? 'var(--bg-muted)'
                    : '#dc2626',
                color:
                  saleReturnStatus.kind === 'full'
                    ? 'var(--text-muted)'
                    : '#fff',
              }}
            >
              <RotateCcw size={15} />
              {shouldCheckReturnStatus && saleReturnsLoading
                ? 'فحص المرتجعات...'
                : saleReturnStatus.kind === 'full'
                  ? 'تم الإرجاع بالكامل'
                  : saleReturnStatus.kind === 'partial'
                    ? 'إكمال المرتجع'
                    : 'مرتجع'}
            </button>

            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: 'var(--bg-muted)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-88px)] p-5 space-y-5">
          {saleDetailsLoading || !selectedSale ? (
            <div
              className="py-10 text-center text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              جارٍ تحميل تفاصيل الفاتورة...
            </div>
          ) : (
            <>
              {saleReturnStatus.kind !== 'none' && !saleReturnsLoading ? (
                <div
                  className="rounded-2xl p-4 flex items-start gap-3"
                  style={{
                    background:
                      saleReturnStatus.kind === 'full'
                        ? 'rgba(239, 68, 68, 0.10)'
                        : 'rgba(245, 158, 11, 0.12)',
                    border:
                      saleReturnStatus.kind === 'full'
                        ? '1px solid rgba(239, 68, 68, 0.35)'
                        : '1px solid rgba(245, 158, 11, 0.35)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background:
                        saleReturnStatus.kind === 'full'
                          ? 'rgba(239, 68, 68, 0.16)'
                          : 'rgba(245, 158, 11, 0.16)',
                      color:
                        saleReturnStatus.kind === 'full'
                          ? '#dc2626'
                          : '#d97706',
                    }}
                  >
                    <RotateCcw size={18} />
                  </div>

                  <div className="min-w-0">
                    <div
                      className="text-sm font-black mb-1"
                      style={{
                        color:
                          saleReturnStatus.kind === 'full'
                            ? '#b91c1c'
                            : '#b45309',
                      }}
                    >
                      {saleReturnStatus.kind === 'full'
                        ? 'هذه الفاتورة تم إرجاعها بالكامل'
                        : 'هذه الفاتورة عليها مرتجع جزئي سابق'}
                    </div>

                    <div
                      className="text-xs leading-6"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {saleReturnStatus.kind === 'full'
                        ? 'لا يمكن إنشاء مرتجع جديد لهذه الفاتورة لأن كامل الكميات تم إرجاعها سابقًا.'
                        : 'يمكنك إنشاء مرتجع جديد فقط للكميات المتبقية غير المرتجعة.'}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <InfoCard
                  icon={<FileText size={16} />}
                  label="رقم الفاتورة"
                  value={selectedSale.invoice_number}
                />
                <InfoCard
                  icon={<User size={16} />}
                  label="العميل"
                  value={
                    canOpenCustomerLedger ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLedgerCustomer({
                            id: Number(selectedSale.customer_id),
                            name: selectedSale.customer_name || '',
                          })
                        }
                        className="truncate hover:underline transition text-right font-black"
                        style={{ color: 'var(--primary)' }}
                        title="فتح كشف حساب العميل"
                      >
                        {selectedSale.customer_name}
                      </button>
                    ) : (
                      selectedSale.customer_name || 'زبون نقدي'
                    )
                  }
                />
                <InfoCard
                  icon={<Wallet size={16} />}
                  label="طريقة الدفع"
                  value={paymentMethodLabel(selectedSale.payment_method)}
                />
                <InfoCard
                  icon={<CalendarDays size={16} />}
                  label="التاريخ"
                  value={fmtDateTime(selectedSale.created_at)}
                />

                {selectedSale.warehouse_id ? (
                  <InfoCard
                    icon={<Package size={16} />}
                    label="المستودع"
                    value={
                      selectedSale.warehouse_name
                        ? `${selectedSale.warehouse_name}${selectedSale.warehouse_code ? ` (${selectedSale.warehouse_code})` : ''}`
                        : selectedSale.warehouse_code || `#${selectedSale.warehouse_id}`
                    }
                  />
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <InfoCard
                  icon={<CreditCard size={16} />}
                  label="إجمالي الفاتورة"
                  value={fmt(Number(selectedSale.total_amount || 0))}
                />
                <InfoCard
                  icon={<CreditCard size={16} />}
                  label="المدفوع"
                  value={fmt(Number(selectedSale.paid_amount || 0))}
                />
                <InfoCard
                  icon={<Eye size={16} />}
                  label="نوع البيع"
                  value={saleTypeLabel(selectedSale.sale_type)}
                />
              </div>

              {selectedSale.notes ? (
                <div
                  className="rounded-2xl p-4"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    className="text-xs font-black mb-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ملاحظات
                  </div>
                  <div
                    className="text-sm leading-7"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {selectedSale.notes}
                  </div>
                </div>
              ) : null}

              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3 border-b"
                  style={{
                    background: 'var(--bg-muted)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <Package size={16} style={{ color: 'var(--text-muted)' }} />
                  <span
                    className="text-sm font-black"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    أصناف الفاتورة
                  </span>
                </div>

                {saleItems.length === 0 ? (
                  <div
                    className="p-8 text-center text-sm"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                  >
                    لا توجد أصناف
                  </div>
                ) : (
                  <>

                    <div
                      className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-black border-b"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <div className="col-span-5">الصنف</div>
                      <div className="col-span-2 text-center">الكمية</div>
                      <div className="col-span-2 text-center">سعر الوحدة</div>
                      <div className="col-span-1 text-center">الخصم</div>
                      <div className="col-span-2 text-center">الإجمالي</div>
                    </div>

                    <div style={{ background: 'var(--bg-card)' }}>
                      {saleItems.map((item, idx) => {
                        const quantity = Number(item.quantity || 0);
                        const unitPrice = Number(item.unit_price || 0);
                        const discount = Number(item.item_discount || 0);
                        const total =
                          item.total_price !== undefined
                            ? Number(item.total_price || 0)
                            : quantity * unitPrice - discount;

                        return (
                          <div
                            key={`${item.product_id ?? idx}-${idx}`}
                            className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b"
                            style={{
                              borderColor: 'var(--border)',
                              background:
                                idx % 2 === 0
                                  ? 'var(--bg-card)'
                                  : 'var(--bg-subtle)',
                            }}
                          >
                            <div
                              className="col-span-5 text-sm font-bold truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {item.product_name || 'صنف'}
                              {item.product_unit ? (
                                <span
                                  className="text-xs font-medium mr-2"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  ({item.product_unit})
                                </span>
                              ) : null}
                            </div>

                            <div
                              className="col-span-2 text-center text-sm font-black"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {fmtNumber(quantity)}
                            </div>

                            <div
                              className="col-span-2 text-center text-sm font-black"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {fmt(unitPrice)}
                            </div>

                            <div
                              className="col-span-1 text-center text-sm font-black"
                              style={{ color: discount > 0 ? '#ef4444' : 'var(--text-muted)' }}
                            >
                              {discount > 0 ? fmt(discount) : '—'}
                            </div>

                            <div
                              className="col-span-2 text-center text-sm font-black"
                              style={{ color: 'var(--text-heading)' }}
                            >
                              {fmt(total)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {ledgerCustomer && (
          <CustomerLedgerModal
            customerId={ledgerCustomer.id}
            customerName={ledgerCustomer.name}
            onClose={() => setLedgerCustomer(null)}
          />
        )}
      </div>
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
  value: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color: 'var(--text-muted)' }}>{icon}</div>
        <div className="text-xs font-black" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
      </div>
      <div className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}