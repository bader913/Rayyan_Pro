import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertTriangle, Check, Printer, RotateCcw, X } from 'lucide-react';
import { purchaseReturnsApi } from '../api/purchaseReturns.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { settingsApi } from '../api/settings.ts';
import { printPurchaseReturnReceipt } from '../utils/print.ts';


const METHOD_LABELS: Record<'cash_refund' | 'debt_discount' | 'stock_only', string> = {
  cash_refund: 'استرداد نقدي',
  debt_discount: 'خصم من ذمة المورد',
  stock_only: 'إرجاع مخزون فقط',
};

interface ReturnItemRow {
  purchase_item_id: number;
  product_id: number;
  product_name: string;
  unit: string;
  purchased_qty: number;
  returned_qty: number;
  max_qty: number;
  unit_price: number;
  quantity: number;
  selected: boolean;
}

type Props = {
  purchaseId: number | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
};

export default function CreatePurchaseReturnModal({
  purchaseId,
  open,
  onClose,
  onDone,
}: Props) {
  const { symbol, rate, fmt } = useCurrency();
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });


  const [returnMethod, setReturnMethod] = useState<'cash_refund' | 'debt_discount' | 'stock_only'>('cash_refund');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [returnItems, setReturnItems] = useState<ReturnItemRow[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-for-return', purchaseId],
    queryFn: async () => {
      const res = await purchaseReturnsApi.getPurchaseForReturn(purchaseId as number);
      return res.data.purchase;
    },
    enabled: open && purchaseId !== null,
  });

  useEffect(() => {
    if (!open) return;

    setError('');
    setReason('');
    setNotes('');
    setReturnMethod('cash_refund');
    setReturnItems([]);

  }, [open, purchaseId]);

  useEffect(() => {
    if (!data) return;

    setReturnItems(
      (data.items ?? []).map((item) => {
        const purchasedQty = Math.max(parseFloat(String(item.quantity ?? 0)) || 0, 0);
        const returnedQty = Math.max(parseFloat(String(item.returned_quantity ?? 0)) || 0, 0);
        const remainingQty = Math.max(parseFloat(String(item.remaining_quantity ?? 0)) || 0, 0);

        return {
          purchase_item_id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          unit: item.unit,
          purchased_qty: purchasedQty,
          returned_qty: returnedQty,
          max_qty: remainingQty,
          unit_price: parseFloat(String(item.unit_price ?? 0)) || 0,
          quantity: remainingQty,
          selected: false,
        };
      })
    );

    if (!data.supplier_id && returnMethod === 'debt_discount') {
      setReturnMethod('cash_refund');
    }
  }, [data]);

  const selectedItems = useMemo(
    () => returnItems.filter((item) => item.selected && item.quantity > 0 && item.max_qty > 0),
    [returnItems]
  );

  const total = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
    [selectedItems]
  );

  const allFullyReturned = useMemo(
    () => returnItems.length > 0 && returnItems.every((item) => item.max_qty <= 0.000001),
    [returnItems]
  );

  const warehouseLinkMissing =
    !!data?.is_multi_warehouse_enabled && !data?.warehouse_id;

  const handlePrintPurchaseReturnThermal = (createdReturn: any) => {
    printPurchaseReturnReceipt(
      {
        ...createdReturn,
        purchase_invoice: data?.invoice_number ?? '—',
        supplier_name: data?.supplier_name ?? 'بدون مورد',
        warehouse_name: data?.warehouse_name ?? null,
        warehouse_code: data?.warehouse_code ?? null,
        return_method: createdReturn?.return_method ?? returnMethod,
        reason: createdReturn?.reason ?? reason ?? '',
        notes: createdReturn?.notes ?? notes ?? '',
        items: selectedItems.map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
        })),
      },
      settings?.shop_name ?? 'ريان برو',
      { symbol, rate }
    );
  };

  const mutation = useMutation({
    mutationFn: async (printMode: 'save' | 'thermal') => {
      const response = await purchaseReturnsApi.create({
        purchase_id: data!.id,
        items: selectedItems.map((item) => ({
          purchase_item_id: item.purchase_item_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        return_method: returnMethod,
        reason: reason || undefined,
        notes: notes || undefined,
      });

      return { response, printMode };
    },

    onSuccess: async ({ response, printMode }) => {
      const createdReturn = (response?.data as any)?.['return'];

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['purchases'] }),
        qc.invalidateQueries({ queryKey: ['purchase-detail', purchaseId] }),
        qc.invalidateQueries({ queryKey: ['purchase-for-return', purchaseId] }),
        qc.invalidateQueries({ queryKey: ['purchase-returns'] }),
      ]);

      if (createdReturn && printMode === 'thermal') {
        handlePrintPurchaseReturnThermal(createdReturn);
      }

      onDone();
    },

    onError: (e: unknown) => {
      if (axios.isAxiosError(e)) {
        setError(e.response?.data?.message ?? 'حدث خطأ أثناء حفظ مرتجع الشراء');
      } else {
        setError('حدث خطأ أثناء حفظ مرتجع الشراء');
      }
    },
  });
  const confirmDisabled =
    !data ||
    selectedItems.length === 0 ||
    allFullyReturned ||
    warehouseLinkMissing ||
    mutation.isPending;
  if (!open || purchaseId === null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          maxHeight: '92vh',
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <RotateCcw size={18} style={{ color: 'var(--text-muted)' }} />
            <h3 className="font-black" style={{ color: 'var(--text-heading)' }}>
              مرتجع شراء جديد
            </h3>
          </div>

          <button
            onClick={onClose}
            className="hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {isLoading || !data ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            جارٍ التحميل...
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div
                className={
                  data.is_multi_warehouse_enabled
                    ? 'grid grid-cols-1 md:grid-cols-3 gap-3'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    فاتورة الشراء
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>
                    {data.invoice_number}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    المورد
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>
                    {data.supplier_name ?? 'بدون مورد'}
                  </div>
                </div>

                {data.is_multi_warehouse_enabled && (
                  <div
                    className="rounded-xl p-3"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  >
                    <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                      المستودع المرتبط بالفاتورة
                    </div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>
                      {data.warehouse_name
                        ? `${data.warehouse_name}${data.warehouse_code ? ` (${data.warehouse_code})` : ''}`
                        : 'غير مربوط'}
                    </div>
                  </div>
                )}
              </div>

              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
              >
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  اختر الأصناف التي تريد إرجاعها إلى المورد، ولن يسمح النظام بإرجاع أكثر من الكمية المتبقية.
                </div>
              </div>

              {data.is_multi_warehouse_enabled && !warehouseLinkMissing && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  سيتم خصم الكمية من نفس المستودع المرتبط بفاتورة الشراء فقط.
                </div>
              )}

              {warehouseLinkMissing && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-heading)',
                  }}
                >
                  هذه الفاتورة غير مرتبطة بمستودع محدد، لذلك تم إيقاف مرتجع الشراء عليها أثناء تفعيل المستودعات المتعددة حتى لا يتم الخصم من مستودع خاطئ.
                </div>
              )}

              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <th className="px-3 py-2 text-right text-xs font-black w-10" style={{ color: 'var(--text-muted)' }}>✓</th>
                      <th className="px-3 py-2 text-right text-xs font-black" style={{ color: 'var(--text-muted)' }}>المنتج</th>
                      <th className="px-3 py-2 text-right text-xs font-black" style={{ color: 'var(--text-muted)' }}>المتوفر للإرجاع</th>
                      <th className="px-3 py-2 text-right text-xs font-black" style={{ color: 'var(--text-muted)' }}>كمية الإرجاع</th>
                      <th className="px-3 py-2 text-right text-xs font-black" style={{ color: 'var(--text-muted)' }}>سعر الشراء</th>
                      <th className="px-3 py-2 text-right text-xs font-black" style={{ color: 'var(--text-muted)' }}>الإجمالي</th>
                    </tr>
                  </thead>

                  <tbody>
                    {returnItems.map((item, idx) => {
                      const fullyReturned = item.max_qty <= 0.000001;

                      return (
                        <tr
                          key={item.purchase_item_id}
                          className="border-b"
                          style={{
                            borderColor: 'var(--border)',
                            opacity: fullyReturned ? 0.65 : 1,
                            background: fullyReturned ? 'var(--bg-subtle)' : 'transparent',
                          }}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={fullyReturned || warehouseLinkMissing}
                              onChange={(e) =>
                                setReturnItems((prev) =>
                                  prev.map((row, j) =>
                                    j === idx
                                      ? { ...row, selected: fullyReturned ? false : e.target.checked }
                                      : row
                                  )
                                )
                              }
                              className="w-4 h-4 rounded"
                            />
                          </td>

                          <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-heading)' }}>
                            <div className="flex flex-col gap-1">
                              <span>{item.product_name}</span>
                              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                المشتراة: {item.purchased_qty.toLocaleString('en-US')} {item.unit}
                                {' — '}
                                المرتجعة سابقًا: {item.returned_qty.toLocaleString('en-US')} {item.unit}
                              </span>
                              {fullyReturned && (
                                <span
                                  className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-black"
                                  style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border)',
                                  }}
                                >
                                  تم إرجاعه بالكامل
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-secondary)' }}>
                            {item.max_qty.toLocaleString('en-US')} {item.unit}
                          </td>

                          <td className="px-3 py-2 w-28">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                setReturnItems((prev) =>
                                  prev.map((row, j) => {
                                    if (j !== idx) return row;

                                    const nextQty = Math.max(
                                      0,
                                      Math.min(parseFloat(e.target.value) || 0, row.max_qty)
                                    );

                                    return {
                                      ...row,
                                      quantity: nextQty,
                                      selected: !fullyReturned && nextQty > 0,
                                    };
                                  })
                                )
                              }
                              className="w-full rounded-lg px-2 py-1 text-sm outline-none text-center"
                              style={{
                                background: 'var(--bg-subtle)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-heading)',
                              }}
                              min={0.001}
                              max={item.max_qty}
                              step={0.001}
                              disabled={!item.selected || fullyReturned || warehouseLinkMissing}
                            />
                          </td>

                          <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                            {fmt(item.unit_price)}
                          </td>

                          <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-heading)' }}>
                            {item.selected && item.quantity > 0 ? fmt(item.quantity * item.unit_price) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {selectedItems.length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'var(--bg-subtle)' }}>
                        <td colSpan={5} className="px-3 py-2.5 font-black text-sm" style={{ color: 'var(--text-heading)' }}>
                          إجمالي المرتجع
                        </td>
                        <td className="px-3 py-2.5 font-black" style={{ color: 'var(--text-heading)' }}>
                          {fmt(total)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {allFullyReturned && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  جميع أصناف هذه الفاتورة تم إرجاعها بالكامل سابقًا.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  طريقة الإرجاع
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {(['cash_refund', 'debt_discount', 'stock_only'] as const).map((method) => {
                    const disabled =
                      warehouseLinkMissing ||
                      (method === 'debt_discount' && !data.supplier_id);

                    const active = returnMethod === method;

                    return (
                      <button
                        key={method}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) setReturnMethod(method);
                        }}
                        className="py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                        style={{
                          background: active ? 'var(--bg-subtle)' : 'var(--bg-card)',
                          color: active ? 'var(--text-heading)' : 'var(--text-secondary)',
                          border: `1px solid ${active ? 'var(--primary, var(--border))' : 'var(--border)'}`,
                        }}
                      >
                        {METHOD_LABELS[method]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    سبب الإرجاع
                  </label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-heading)',
                    }}
                    placeholder="مثال: بضاعة تالفة أو غير مطابقة"
                    disabled={warehouseLinkMissing}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    ملاحظات
                  </label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-heading)',
                    }}
                    placeholder="اختياري"
                    disabled={warehouseLinkMissing}
                  />
                </div>
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 rounded-xl p-3 text-sm"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-heading)',
                  }}
                >
                  <AlertTriangle size={14} />
                  {error}
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
            >
              <div className="text-sm">
                {selectedItems.length > 0 && !warehouseLinkMissing && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>إجمالي المرتجع: </span>
                    <span className="font-black" style={{ color: 'var(--text-heading)' }}>
                      {fmt(total)}
                    </span>
                  </>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors hover:opacity-80"
                  style={{ color: 'var(--text-muted)' }}
                >
                  إلغاء
                </button>

                <button
                  onClick={() => mutation.mutate('save')}
                  disabled={confirmDisabled}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{
                    background: 'var(--bg-card)',
                    color: 'var(--text-heading)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <Check size={15} />
                  {mutation.isPending ? 'جارٍ الحفظ...' : 'حفظ مرتجع الشراء'}
                </button>
                  

              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
