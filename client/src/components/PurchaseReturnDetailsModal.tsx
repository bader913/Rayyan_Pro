import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, RotateCcw, X } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import PurchaseInvoiceDetailsModal from './PurchaseInvoiceDetailsModal.tsx';

const METHOD_LABELS: Record<string, string> = {
  cash_refund: 'استرداد نقدي',
  debt_discount: 'خصم من ذمة المورد',
  stock_only: 'إرجاع مخزون فقط',
};

const fmtQty = (v: number | string | null | undefined, dec = 0) =>
  v != null
    ? parseFloat(String(v)).toLocaleString('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    : '—';

type PurchaseReturnItem = {
  id?: number;
  product_id?: number | null;
  product_name?: string | null;
  unit?: string | null;
  quantity: string | number;
  unit_price: string | number;
  total_price: string | number;
};

type PurchaseReturnDetails = {
  id: number;
  return_number: string;
  purchase_id?: number | null;
  purchase_invoice?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  total_amount: string | number;
  return_method: string;
  reason?: string | null;
  notes?: string | null;
  created_at: string;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  items?: PurchaseReturnItem[];
};

type Props = {
  returnId: number | null;
  open: boolean;
  onClose: () => void;
};

export default function PurchaseReturnDetailsModal({
  returnId,
  open,
  onClose,
}: Props) {
  const { fmt } = useCurrency();
  const [linkedPurchaseId, setLinkedPurchaseId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<PurchaseReturnDetails>({
    queryKey: ['purchase-return-detail', returnId],
    queryFn: async () => {
      const res = await apiClient.get(`/purchase-returns/${returnId}`);
      return res.data.return as PurchaseReturnDetails;
    },
    enabled: open && returnId !== null,
  });

  if (!open || returnId === null) return null;

  const handlePrintA4 = () => {
    if (!data) return;

    const rows = (data.items ?? [])
      .map(
        (item, idx) => `
          <tr>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">${idx + 1}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-weight:700;text-align:right;">
              ${item.product_name ?? 'صنف'}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">
              ${fmtQty(item.quantity, 0)} ${item.unit ?? ''}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">
              ${fmt(item.unit_price)}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:900;color:#dc2626;">
              ${fmt(item.total_price)}
            </td>
          </tr>
        `
      )
      .join('');

    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`
      <html dir="rtl">
        <head>
          <title>مرتجع شراء ${data.return_number}</title>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Tahoma, sans-serif;
              direction: rtl;
              color: #111827;
              padding: 24px;
              margin: 0;
              background: #fff;
            }
            .page { max-width: 900px; margin: 0 auto; }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 24px;
              font-weight: 900;
              color: #dc2626;
              margin-bottom: 6px;
            }
            .meta {
              font-size: 12px;
              color: #6b7280;
              line-height: 1.9;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin: 18px 0 22px;
            }
            .card {
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              padding: 12px;
              background: #f9fafb;
            }
            .label {
              font-size: 11px;
              color: #6b7280;
              margin-bottom: 6px;
              font-weight: 700;
            }
            .value {
              font-size: 13px;
              font-weight: 800;
              color: #111827;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 14px;
            }
            thead th {
              background: #dc2626;
              color: #fff;
              padding: 10px 8px;
              font-size: 12px;
              text-align: center;
            }
            thead th:nth-child(2) { text-align: right; }
            .totals {
              margin-top: 18px;
              width: 320px;
              margin-right: auto;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              overflow: hidden;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 14px;
              border-bottom: 1px solid #e5e7eb;
              font-size: 13px;
            }
            .totals-row:last-child {
              border-bottom: none;
              background: #fef2f2;
              font-weight: 900;
              color: #b91c1c;
            }
            .notes {
              margin-top: 18px;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              padding: 12px;
              background: #f9fafb;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <div class="title">سند مرتجع شراء</div>
                <div class="meta">
                  رقم المرتجع: <strong>${data.return_number}</strong><br/>
                  فاتورة الشراء: ${data.purchase_invoice ?? '—'}<br/>
                  التاريخ: ${new Date(data.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
              <div class="meta">
                المورد: <strong>${data.supplier_name ?? 'بدون مورد'}</strong><br/>
                الطريقة: <strong>${METHOD_LABELS[data.return_method] ?? data.return_method}</strong>
              </div>
            </div>

            <div class="grid">
              <div class="card">
                <div class="label">فاتورة الشراء</div>
                <div class="value">${data.purchase_invoice ?? '—'}</div>
              </div>
              <div class="card">
                <div class="label">المورد</div>
                <div class="value">${data.supplier_name ?? 'بدون مورد'}</div>
              </div>
              <div class="card">
                <div class="label">إجمالي المرتجع</div>
                <div class="value">${fmt(data.total_amount)}</div>
              </div>
              <div class="card">
                <div class="label">المستودع</div>
                <div class="value">
                  ${
                    data.warehouse_name
                      ? `${data.warehouse_name}${data.warehouse_code ? ` (${data.warehouse_code})` : ''}`
                      : '—'
                  }
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width:50px;">#</th>
                  <th>الصنف</th>
                  <th style="width:140px;">الكمية</th>
                  <th style="width:140px;">سعر الشراء</th>
                  <th style="width:140px;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <div class="totals">
              <div class="totals-row">
                <span>إجمالي المرتجع</span>
                <span>${fmt(data.total_amount)}</span>
              </div>
            </div>

            ${
              data.reason
                ? `
              <div class="notes">
                <div class="label">سبب الإرجاع</div>
                <div class="value">${data.reason}</div>
              </div>
            `
                : ''
            }

            ${
              data.notes
                ? `
              <div class="notes">
                <div class="label">ملاحظات</div>
                <div class="value">${data.notes}</div>
              </div>
            `
                : ''
            }
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          <\/script>
        </body>
      </html>
    `);

    win.document.close();
  };

  const handlePrintThermal = () => {
    if (!data) return;

    const rows = (data.items ?? [])
      .map(
        (item) => `
          <tr>
            <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;font-size:13px;">
              ${item.product_name ?? 'صنف'}
            </td>
            <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">
              ${fmtQty(item.quantity, 0)} ${item.unit ?? ''}
            </td>
            <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:left;font-size:13px;font-weight:700;">
              ${fmt(item.total_price)}
            </td>
          </tr>
        `
      )
      .join('');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>مرتجع شراء ${data.return_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; font-size:13px; color:#1e293b; }
  .page { max-width:340px; margin:0 auto; padding:16px; }
  h1 { font-size:18px; font-weight:900; color:#dc2626; text-align:center; }
  .sub { text-align:center; font-size:11px; color:#64748b; margin-bottom:12px; }
  .divider { border:none; border-top:2px dashed #e2e8f0; margin:10px 0; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:11px; color:#64748b; font-weight:700; padding:4px; border-bottom:2px solid #e2e8f0; }
  .totals td { padding:4px 4px; font-size:13px; }
  .totals .big { font-size:16px; font-weight:900; color:#dc2626; }
  .footer { text-align:center; font-size:11px; color:#94a3b8; margin-top:14px; }
  @media print {
    @page { margin:6mm; }
    body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>سند مرتجع شراء</h1>
  <div class="sub">${data.return_number}</div>
  <hr class="divider"/>

  <table style="margin-bottom:4px;">
    <tr>
      <td style="font-size:11px;color:#64748b;">فاتورة الشراء</td>
      <td style="font-weight:700;text-align:left;">${data.purchase_invoice ?? '—'}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#64748b;">المورد</td>
      <td style="text-align:left;font-size:12px;">${data.supplier_name ?? 'بدون مورد'}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#64748b;">التاريخ</td>
      <td style="text-align:left;font-size:12px;">${new Date(data.created_at).toLocaleDateString('en-GB')}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#64748b;">الطريقة</td>
      <td style="text-align:left;font-size:12px;">${METHOD_LABELS[data.return_method] ?? data.return_method}</td>
    </tr>
  </table>

  <hr class="divider"/>

  <table>
    <thead>
      <tr>
        <th style="text-align:right;">الصنف</th>
        <th style="text-align:center;">الكمية</th>
        <th style="text-align:left;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <hr class="divider"/>

  <table class="totals">
    <tr>
      <td class="big">الإجمالي</td>
      <td class="big" style="text-align:left;">${fmt(data.total_amount)}</td>
    </tr>
  </table>

  ${
    data.reason
      ? `<hr class="divider"/><div style="font-size:12px;"><strong>السبب:</strong> ${data.reason}</div>`
      : ''
  }

  ${
    data.notes
      ? `<div style="font-size:12px;margin-top:6px;"><strong>ملاحظات:</strong> ${data.notes}</div>`
      : ''
  }

  <div class="footer">Rayyan Pro</div>
</div>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=420,height=720');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <>
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
              تفاصيل مرتجع الشراء
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintA4}
                disabled={!data}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-heading)',
                  border: '1px solid var(--border)',
                }}
              >
                <Printer size={14} />
                طباعة A4
              </button>

              <button
                onClick={handlePrintThermal}
                disabled={!data}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                  color: 'var(--primary)',
                  border: '1px solid color-mix(in srgb, var(--primary) 26%, var(--border))',
                }}
              >
                <Printer size={14} />
                طباعة حرارية
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
                <div
                  className="rounded-xl p-3 border"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    رقم المرتجع
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                    {data.return_number}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3 border"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    فاتورة الشراء
                  </div>
                  {data.purchase_id ? (
                    <button
                      onClick={() => setLinkedPurchaseId(data.purchase_id!)}
                      className="text-sm font-bold hover:underline transition"
                      style={{ color: '#2563eb' }}
                      title="فتح فاتورة الشراء"
                    >
                      {data.purchase_invoice ?? '—'}
                    </button>
                  ) : (
                    <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                      {data.purchase_invoice ?? '—'}
                    </div>
                  )}
                </div>

                <div
                  className="rounded-xl p-3 border"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    المورد
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                    {data.supplier_name ?? 'بدون مورد'}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3 border"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    الإجمالي
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                    {fmt(data.total_amount)}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3 border"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    طريقة الإرجاع
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                    {METHOD_LABELS[data.return_method] ?? data.return_method}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3 border"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    التاريخ
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                    {new Date(data.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>

                {data.warehouse_id ? (
                  <div
                    className="rounded-xl p-3 border"
                    style={{
                      background: 'var(--bg-subtle)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                      المستودع
                    </div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                      {data.warehouse_name
                        ? `${data.warehouse_name}${data.warehouse_code ? ` (${data.warehouse_code})` : ''}`
                        : data.warehouse_code || `#${data.warehouse_id}`}
                    </div>
                  </div>
                ) : null}
              </div>

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
                  {data.items?.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-color)' }}>
                        {item.product_name}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {fmtQty(item.quantity, 0)} {item.unit}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {fmt(item.unit_price)}
                      </td>
                      <td className="px-3 py-2 font-bold text-rose-700">
                        {fmt(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {data.reason && (
                <div
                  className="rounded-xl p-3 text-sm border"
                  style={{
                    color: 'var(--text-color)',
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <span className="font-bold ml-2" style={{ color: 'var(--text-muted)' }}>
                    سبب الإرجاع:
                  </span>
                  {data.reason}
                </div>
              )}

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

      <PurchaseInvoiceDetailsModal
        purchaseId={linkedPurchaseId}
        open={linkedPurchaseId !== null}
        onClose={() => setLinkedPurchaseId(null)}
      />
      
    </>
  );
}