import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import { returnsApi } from '../api/returns.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import CustomerLedgerModal from './CustomerLedgerModal.tsx';
import SaleInvoiceDetailsModal from './SaleInvoiceDetailsModal.tsx';
import { printInvoiceDocumentA4 } from '../utils/invoiceDocumentPrint.ts';
import { settingsApi } from '../api/settings.ts';
import { printSaleReturnReceipt } from '../utils/print.ts';
const fmtQty = (v: number | string | null | undefined, dec = 0) =>
  v != null
    ? parseFloat(String(v)).toLocaleString('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    : '—';

const RETURN_METHOD_LABELS: Record<string, string> = {
  cash_refund: 'رد نقدي',
  debt_discount: 'خصم من الدين',
  stock_only: 'استرداد مخزون فقط',
};

const RETURN_METHOD_COLORS: Record<string, { bg: string; color: string }> = {
  cash_refund: { bg: '#dcfce7', color: '#166534' },
  debt_discount: { bg: '#dbeafe', color: '#1e40af' },
  stock_only: { bg: '#f3f4f6', color: '#4b5563' },
};

type Props = {
  returnId: number | null;
  open: boolean;
  onClose: () => void;
};

export default function ReturnInvoiceDetailsModal({
  returnId,
  open,
  onClose,
}: Props) {
  const { fmt, rate, symbol } = useCurrency();
  const [linkedSaleId, setLinkedSaleId] = useState<number | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<{ id: number; name: string } | null>(null);

    const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['return-detail', returnId],
    queryFn: async () => {
      const res = await returnsApi.getById(returnId as number);
      return res.data.return;
    },
    enabled: open && returnId !== null,
  });

  if (!open || returnId === null) return null;

  const colors = data
    ? RETURN_METHOD_COLORS[data.return_method]
    : { bg: '#f3f4f6', color: '#4b5563' };
      const handlePrintReturn = () => {
    if (!data) return;

    const rows = (data.items ?? []).map((item: any, idx: number) => [
      String(idx + 1),
      String(item.product_name ?? 'صنف'),
      `${fmtQty(item.quantity, 0)} ${item.unit ?? ''}`.trim(),
      fmt(item.unit_price),
      fmt(item.total_price),
    ]);

    const cards = [
      { label: 'رقم المرتجع', value: data.return_number },
      { label: 'فاتورة البيع', value: data.sale_invoice ?? '—' },
      { label: 'العميل', value: data.customer_name ?? 'بدون عميل' },
      { label: 'الإجمالي', value: fmt(data.total_amount) },
      { label: 'السبب', value: data.reason ?? '—' },
      { label: 'التاريخ', value: new Date(data.created_at).toLocaleDateString('en-GB') },
      ...( (data as any).warehouse_id
        ? [{
            label: 'المستودع',
            value: (data as any).warehouse_name
              ? `${(data as any).warehouse_name}${(data as any).warehouse_code ? ` (${(data as any).warehouse_code})` : ''}`
              : ((data as any).warehouse_code || `#${(data as any).warehouse_id}`),
          }]
        : []),
    ];

    printInvoiceDocumentA4({
      title: 'سند مرتجع بيع',
      accentColor: '#dc2626',
      invoiceNumber: data.return_number,
      dateText: new Date(data.created_at).toLocaleDateString('en-GB'),
      sideMetaLines: [
        `طريقة الإرجاع: ${RETURN_METHOD_LABELS[data.return_method] ?? data.return_method}`,
        `فاتورة البيع: ${data.sale_invoice ?? '—'}`,
      ],
      cards,
      columns: [
        { label: '#', width: '50px', align: 'center' },
        { label: 'الصنف', align: 'right' },
        { label: 'الكمية', width: '140px', align: 'center' },
        { label: 'سعر الوحدة', width: '140px', align: 'center' },
        { label: 'الإجمالي', width: '140px', align: 'center' },
      ],
      rows,
      totals: [
        { label: 'إجمالي المرتجع', value: fmt(data.total_amount), highlight: true },
      ],
      notes: (data as any).notes || undefined,
    });
  };
  const handlePrintReturnThermal = () => {
    if (!data) return;

    printSaleReturnReceipt(
      {
        return_number: data.return_number,
        sale_invoice: data.sale_invoice,
        created_at: data.created_at,
        customer_name: data.customer_name,
        total_amount: data.total_amount,
        return_method: data.return_method,
        reason: data.reason,
        notes: (data as any).notes || undefined,
        warehouse_name: (data as any).warehouse_name || undefined,
        warehouse_code: (data as any).warehouse_code || undefined,
        items: (data.items ?? []).map((item: any) => ({
          product_name: item.product_name ?? 'صنف',
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
        })),
      },
      settings?.shop_name ?? 'ريان برو',
      { symbol, rate }
    );
  };
  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.5)' }}
      >
        <div
          className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)' }}
        >
          <div
            className="flex items-center justify-between px-6 py-4 border-b"
            style={{ borderColor: 'var(--border-color, var(--border))' }}
          >
            <h3
              className="font-black"
              style={{ color: 'var(--text-color, var(--text-heading))' }}
            >
              تفاصيل المرتجع
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintReturn}
                disabled={isLoading || !data}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-color, var(--text-heading))',
                  border: '1px solid var(--border)',
                }}
              >
                <Printer size={14} />
                A4 كبيرة
              </button>

              <button
                onClick={handlePrintReturnThermal}
                disabled={isLoading || !data}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{
                  background: 'rgba(220,38,38,0.08)',
                  color: '#dc2626',
                  border: '1px solid rgba(220,38,38,0.22)',
                }}
              >
                <Printer size={14} />
                حراري صغيرة
              </button>

              <button
                onClick={onClose}
                className="hover:opacity-80"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {isLoading || !data ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              جارٍ التحميل...
            </div>
          ) : (
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                                {(data as any).warehouse_id ? (
                  <div
                    className="rounded-xl p-3"
                    style={{ background: 'var(--bg-subtle)' }}
                  >
                    <div
                      className="text-[10px] mb-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      المستودع
                    </div>
                    <div
                      className="text-sm font-bold"
                      style={{ color: 'var(--text-color, var(--text-heading))' }}
                    >
                      {(data as any).warehouse_name
                        ? `${(data as any).warehouse_name}${(data as any).warehouse_code ? ` (${(data as any).warehouse_code})` : ''}`
                        : ((data as any).warehouse_code || `#${(data as any).warehouse_id}`)}
                    </div>
                  </div>
                ) : null}
                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    رقم المرتجع
                  </div>
                  <div
                    className="text-sm font-bold"
                    style={{ color: 'var(--text-color, var(--text-heading))' }}
                  >
                    {data.return_number}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    فاتورة البيع
                  </div>
                  {(data as any).sale_id ? (
                    <button
                      onClick={() => setLinkedSaleId((data as any).sale_id)}
                      className="text-sm font-bold hover:underline transition"
                      style={{ color: '#2563eb' }}
                      title="فتح فاتورة البيع"
                    >
                      {data.sale_invoice}
                    </button>
                  ) : (
                    <div
                      className="text-sm font-bold"
                      style={{ color: 'var(--text-color, var(--text-heading))' }}
                    >
                      {data.sale_invoice}
                    </div>
                  )}
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    العميل
                  </div>
                  {(data as any).customer_id && data.customer_name ? (
                    <button
                      onClick={() =>
                        setLedgerCustomer({
                          id: (data as any).customer_id,
                          name: data.customer_name!,
                        })
                      }
                      className="text-sm font-bold hover:underline transition"
                      style={{ color: '#2563eb' }}
                      title="فتح كشف حساب العميل"
                    >
                      {data.customer_name}
                    </button>
                  ) : (
                    <div
                      className="text-sm font-bold"
                      style={{ color: 'var(--text-color, var(--text-heading))' }}
                    >
                      {data.customer_name ?? 'بدون عميل'}
                    </div>
                  )}
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    الإجمالي
                  </div>
                  <div
                    className="text-sm font-bold"
                    style={{ color: 'var(--text-color, var(--text-heading))' }}
                  >
                    {fmt(data.total_amount)}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    السبب
                  </div>
                  <div
                    className="text-sm font-bold"
                    style={{ color: 'var(--text-color, var(--text-heading))' }}
                  >
                    {data.reason ?? '—'}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    التاريخ
                  </div>
                  <div
                    className="text-sm font-bold"
                    style={{ color: 'var(--text-color, var(--text-heading))' }}
                  >
                    {new Date(data.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>

              <div
                className="rounded-xl p-3 flex items-center gap-2"
                style={{ background: colors.bg }}
              >
                <span className="text-xs font-bold" style={{ color: colors.color }}>
                  طريقة الإرجاع: {RETURN_METHOD_LABELS[data.return_method]}
                </span>
              </div>

              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)' }}>
                    {['المنتج', 'الكمية', 'سعر الوحدة', 'الإجمالي'].map((h) => (
                      <th
                        key={h}
                        className="text-right px-3 py-2 text-xs font-black"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items?.map((item: any) => (
                    <tr
                      key={item.id}
                      className="border-b"
                      style={{ borderColor: 'var(--border-color, var(--border))' }}
                    >
                      <td
                        className="px-3 py-2 font-bold"
                        style={{ color: 'var(--text-color, var(--text-heading))' }}
                      >
                        {item.product_name}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {fmtQty(item.quantity, 0)} {item.unit}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {fmt(item.unit_price)}
                      </td>
                      <td className="px-3 py-2 font-bold text-rose-700">
                        {fmt(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <SaleInvoiceDetailsModal
        saleId={linkedSaleId}
        open={linkedSaleId !== null}
        onClose={() => setLinkedSaleId(null)}
      />

      {ledgerCustomer && (
        <CustomerLedgerModal
          customerId={ledgerCustomer.id}
          customerName={ledgerCustomer.name}
          onClose={() => setLedgerCustomer(null)}
        />
      )}
    </>
  );
}