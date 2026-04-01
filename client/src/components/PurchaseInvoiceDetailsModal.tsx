import { useQuery } from '@tanstack/react-query';
import { Printer, RotateCcw, X } from 'lucide-react';
import { purchasesApi } from '../api/purchases.ts';
import { settingsApi } from '../api/settings.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { printPurchaseReceipt } from '../utils/print.ts';
import { openPrintWindowHtml } from '../utils/printWindow.ts';
import { printInvoiceDocumentA4 } from '../utils/invoiceDocumentPrint.ts';
const fmtRaw = (v: number | string | null | undefined, dec = 2) =>
  v != null
    ? parseFloat(String(v)).toLocaleString('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    : '—';

    type PurchaseDetails = {
  id: number;
  invoice_number: string;
  total_amount: string | number;
  paid_amount: string | number;
  due_amount: string | number;
  purchase_currency?: string | null;
  exchange_rate?: string | number | null;
  notes?: string | null;
  created_at: string;
  supplier_id?: number | null;
  supplier_name?: string | null;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  items?: Array<{
    id: number;
    product_id?: number;
    product_name?: string | null;
    unit?: string | null;
    quantity: string | number;
    unit_price: string | number;
    total_price: string | number;
  }>;
};
type Props = {
  purchaseId: number | null;
  open: boolean;
  onClose: () => void;
  onCreateReturn?: (purchaseId: number) => void;
};

export default function PurchaseInvoiceDetailsModal({
  purchaseId,
  open,
  onClose,
  onCreateReturn,
}: Props) {
  const { fmt, rate, symbol } = useCurrency();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });
  const { data, isLoading } = useQuery<PurchaseDetails>({
    queryKey: ['purchase-detail', purchaseId],
    queryFn: async () => {
      const res = await purchasesApi.getById(purchaseId as number);
      return res.data.purchase as PurchaseDetails;
    },
    enabled: open && purchaseId !== null,
  });

  if (!open || purchaseId === null) return null;

   const handlePrint = () => {
    if (!data) return;

    const rows = (data.items ?? []).map((item: any, idx: number) => [
      String(idx + 1),
      String(item.product_name ?? 'صنف'),
      `${fmtRaw(item.quantity, 0)} ${item.unit ?? ''}`.trim(),
      fmt(item.unit_price),
      fmt(item.total_price),
    ]);

    const cards = [
      { label: 'المورد', value: data.supplier_name ?? 'بدون مورد' },
      { label: 'الإجمالي', value: fmt(data.total_amount) },
      { label: 'المدفوع', value: fmt(data.paid_amount) },
      { label: 'المتبقي', value: fmt(data.due_amount) },
      ...(data.warehouse_id
        ? [
            {
              label: 'المستودع',
              value: data.warehouse_name
                ? `${data.warehouse_name}${data.warehouse_code ? ` (${data.warehouse_code})` : ''}`
                : data.warehouse_code || `#${data.warehouse_id}`,
            },
          ]
        : []),
    ];

    printInvoiceDocumentA4({
      title: 'فاتورة شراء',
      accentColor: '#059669',
      invoiceNumber: data.invoice_number,
      dateText: new Date(data.created_at).toLocaleDateString('en-GB'),
      sideMetaLines: [
        `المورد: ${data.supplier_name ?? 'بدون مورد'}`,
      ],
      cards,
      columns: [
        { label: '#', width: '50px', align: 'center' },
        { label: 'الصنف', align: 'right' },
        { label: 'الكمية', width: '140px', align: 'center' },
        { label: 'سعر الشراء', width: '140px', align: 'center' },
        { label: 'الإجمالي', width: '140px', align: 'center' },
      ],
      rows,
      totals: [
        { label: 'الإجمالي', value: fmt(data.total_amount) },
        { label: 'المدفوع', value: fmt(data.paid_amount) },
        { label: 'المتبقي', value: fmt(data.due_amount), highlight: true },
      ],
      notes: data.notes || undefined,
    });
  };
  const handlePrintThermal = () => {
    if (!data) return;

    printPurchaseReceipt(
      {
        invoice_number: data.invoice_number,
        created_at: data.created_at,
        supplier_name: data.supplier_name,
        total_amount: data.total_amount,
        paid_amount: data.paid_amount,
        due_amount: data.due_amount,
        notes: data.notes,
        warehouse_name: data.warehouse_name,
        warehouse_code: data.warehouse_code,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <h3 className="font-black" style={{ color: 'var(--text-color)' }}>
            تفاصيل فاتورة الشراء
          </h3>

          <div className="flex items-center gap-2">
            {onCreateReturn && (
              <button
                onClick={() => {
                  if (purchaseId !== null) onCreateReturn(purchaseId);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-heading)',
                  border: '1px solid var(--border)',
                }}
              >
                <RotateCcw size={14} />
                مرتجع شراء
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            >
              <Printer size={14} />
              A4 كبيرة
            </button>

            <button
              onClick={handlePrintThermal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              style={{
                background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 26%, var(--border))',
              }}
            >
              <Printer size={14} />
              حراري صغيرة
            </button>

            <button
              onClick={onClose}
              style={{ color: 'var(--text-muted)' }}
              className="hover:opacity-80"
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
              {[
                { label: 'رقم الفاتورة', value: data.invoice_number },
                { label: 'المورد', value: data.supplier_name ?? 'بدون مورد' },
                ...(data.warehouse_id
                  ? [{
                      label: 'المستودع',
                      value: data.warehouse_name
                        ? `${data.warehouse_name}${data.warehouse_code ? ` (${data.warehouse_code})` : ''}`
                        : data.warehouse_code || `#${data.warehouse_id}`,
                    }]
                  : []),
                { label: 'الإجمالي', value: fmt(data.total_amount) },
                { label: 'المدفوع', value: fmt(data.paid_amount) },
                { label: 'المتبقي', value: fmt(data.due_amount) },
                { label: 'تاريخ الفاتورة', value: new Date(data.created_at).toLocaleDateString('en-GB') },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl p-3 border"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    {label}
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="rounded-xl overflow-hidden border"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)' }}>
                    {['المنتج', 'الكمية', 'سعر الشراء', 'الإجمالي'].map((h) => (
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
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <td
                        className="px-3 py-2 font-bold"
                        style={{ color: 'var(--text-color)' }}
                      >
                        {item.product_name}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {fmtRaw(item.quantity, 0)} {item.unit}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {fmt(item.unit_price)}
                      </td>
                      <td className="px-3 py-2 font-bold text-emerald-500">
                        {fmt(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.notes && (
              <div
                className="rounded-xl p-3 text-sm border"
                style={{
                  color: 'var(--text-color)',
                  background: 'var(--bg-subtle)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <span className="font-bold ml-2" style={{ color: 'var(--text-muted)' }}>
                  ملاحظات:
                </span>
                {data.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}