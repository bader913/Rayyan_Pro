import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, Search, RotateCcw, Package, ChevronRight, ChevronLeft,
  X, Check, AlertTriangle, Eye, FileText,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { returnsApi, type SaleReturn, type SaleForReturn } from '../api/returns.ts';
import { apiClient } from '../api/client.ts';
import { useAuthStore } from '../store/authStore.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import axios from 'axios';
import CustomerLedgerModal from '../components/CustomerLedgerModal.tsx';
import { useSearchParams } from 'react-router-dom';
import SaleInvoiceDetailsModal from '../components/SaleInvoiceDetailsModal.tsx';
import ReturnInvoiceDetailsModal from '../components/ReturnInvoiceDetailsModal.tsx';
const fmtQty = (v: number | string | null | undefined, dec = 0) =>
  v != null ? parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

const RETURN_METHOD_LABELS: Record<string, string> = {
  cash_refund:   'رد نقدي',
  debt_discount: 'خصم من الدين',
  stock_only:    'استرداد مخزون فقط',
};

const RETURN_METHOD_COLORS: Record<string, { bg: string; color: string }> = {
  cash_refund:   { bg: '#dcfce7', color: '#166534' },
  debt_discount: { bg: '#dbeafe', color: '#1e40af' },
  stock_only:    { bg: '#f3f4f6', color: '#4b5563' },
};

// ─── Return Detail Modal ──────────────────────────────────────────────────────



// ─── Create Return Modal ──────────────────────────────────────────────────────

interface ReturnItemRow {
  sale_item_id:  number;
  product_id:    number;
  product_name:  string;
  unit:          string;
  sold_qty:      number;
  returned_qty:  number;
  max_qty:       number; // المتبقي المتاح للإرجاع
  unit_price:    number;
  quantity:      number;
  selected:      boolean;
}

interface WarehouseOption {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
}

function CreateReturnModal({
  onClose,
  onDone,
  initialSaleId,
}: {
  onClose: () => void;
  onDone: () => void;
  initialSaleId?: number | null;
}) {
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sale, setSale] = useState<SaleForReturn | null>(null);
  const [loadError, setLoadError] = useState('');
  const [returnItems, setReturnItems] = useState<ReturnItemRow[]>([]);
  const [returnMethod, setReturnMethod] = useState<'cash_refund' | 'debt_discount' | 'stock_only'>('cash_refund');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: searchData } = useQuery({
    queryKey: ['invoice-search', searchQ],
    queryFn: async () => {
      const res = await apiClient.get('/sales/search', { params: { q: searchQ || undefined, limit: 10 } });
      return res.data.sales as Array<{
        id: number;
        invoice_number: string;
        customer_name: string | null;
        total_amount: string;
        created_at: string;
      }>;
    },
    enabled: searchOpen,
    staleTime: 15_000,
  });

  const loadSaleById = async (id: number) => {
    setSearchOpen(false);
    setLoadError('');
    try {
      const res = await returnsApi.getSaleForReturn(id);
      const s = res.data.sale;
      setSearchQ(s.invoice_number);
      setSale(s);
      setReturnItems(
        s.items.map((item) => {
          const soldQty = Math.max(parseFloat(String(item.quantity ?? 0)) || 0, 0);
          const returnedQty = Math.max(parseFloat(String(item.returned_quantity ?? 0)) || 0, 0);
          const remainingQty = Math.max(parseFloat(String(item.remaining_quantity ?? (soldQty - returnedQty))) || 0, 0);

          return {
            sale_item_id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            unit: item.unit,
            sold_qty: soldQty,
            returned_qty: returnedQty,
            max_qty: remainingQty,
            unit_price: parseFloat(String(item.unit_price)),
            quantity: remainingQty,
            selected: false,
          };
        })
      );
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) setLoadError(e.response?.data?.message ?? 'الفاتورة غير موجودة');
    }
  };

  useEffect(() => {
    if (initialSaleId && !sale) {
      loadSaleById(initialSaleId);
    }
  }, [initialSaleId]);

  const selectedItems = returnItems.filter((i) => i.selected && i.quantity > 0 && i.max_qty > 0);
  const total = selectedItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const warehouseLinkMissing = !!sale?.is_multi_warehouse_enabled && !sale?.warehouse_id;

  const mutation = useMutation({
    mutationFn: () =>
      returnsApi.create({
        sale_id: sale!.id,
        items: selectedItems.map(({ sale_item_id, product_id, quantity, unit_price }) => ({
          sale_item_id, product_id, quantity, unit_price,
        })),
        return_method: returnMethod,
        reason: reason || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      onDone();
    },
    onError: (e: unknown) => {
      if (axios.isAxiosError(e)) setError(e.response?.data?.message ?? 'حدث خطأ');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: 'var(--bg-card)', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-black app-text">مرتجع جديد</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div ref={searchRef} className="relative">
            <label className="block text-xs font-bold text-slate-600 mb-1.5">بحث بفاتورة البيع</label>
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 focus-within:border-emerald-500 transition-colors" style={{ borderColor: 'var(--border)' }}>
              <Search size={14} className="text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="ابحث برقم الفاتورة أو اسم العميل..."
                dir="rtl"
                autoComplete="off"
              />
              {searchQ && (
                <button onClick={() => { setSearchQ(''); setSale(null); setReturnItems([]); }} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {searchOpen && (
              <div
                className="mt-2 rounded-2xl border shadow-xl overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
              >
                {(searchData ?? []).length === 0 ? (
                  <div className="px-4 py-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                    لا توجد نتائج
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {(searchData ?? []).map((s) => {
                      const isSelected = sale?.id === s.id;

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={() => loadSaleById(s.id)}
                          className="group w-full px-4 py-3 text-right border-b last:border-b-0 transition-all duration-150"
                          style={{
                            borderColor: 'var(--border)',
                            background: isSelected ? 'rgba(16,185,129,0.10)' : 'transparent',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150"
                                style={{
                                  background: isSelected
                                    ? 'rgba(16,185,129,0.18)'
                                    : 'rgba(16,185,129,0.12)',
                                  boxShadow: isSelected ? '0 0 0 1px rgba(16,185,129,0.22) inset' : 'none',
                                }}
                              >
                                <FileText size={14} className="text-emerald-500" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div
                                  className="font-black text-sm truncate transition-colors"
                                  style={{
                                    color: isSelected ? '#10b981' : 'var(--text-color)',
                                  }}
                                >
                                  {s.invoice_number}
                                </div>

                                <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                                  {s.customer_name || 'بدون عميل'}
                                </div>

                                <div className="text-[11px] mt-1 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                                  <span>{new Date(s.created_at).toLocaleDateString('en-GB')}</span>
                                  {isSelected && (
                                    <span
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                      style={{
                                        background: 'rgba(16,185,129,0.14)',
                                        color: '#10b981',
                                      }}
                                    >
                                      مختارة
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-left flex-shrink-0">
                              <div className="text-sm font-black text-emerald-500">
                                {fmt(parseFloat(String(s.total_amount)))}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {loadError && <div className="mt-1.5 text-xs text-rose-600">{loadError}</div>}
          </div>

          {sale && (
            <>
              <div
                className={sale.is_multi_warehouse_enabled ? 'grid grid-cols-1 md:grid-cols-3 gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}
              >
                <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-color)', borderColor: 'var(--bg-color)' }}>
                  <div className="text-[11px] mb-1 app-text-muted">فاتورة البيع</div>
                  <div className="font-app app-text-muted font-black">{sale.invoice_number}</div>
                </div>

                <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-color)', borderColor: 'var(--bg-color)' }}>
                  <div className="text-[11px] mb-1 app-text-muted">العميل</div>
                  <div className="font-bold">{sale.customer_name ?? 'بدون'}</div>
                </div>

                {sale.is_multi_warehouse_enabled && (
                  <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-color)', borderColor: 'var(--bg-color)' }}>
                    <div className="text-[11px] mb-1 app-text-muted">المستودع المرتبط بالفاتورة</div>
                    <div className="font-bold">
                      {sale.warehouse_name
                        ? `${sale.warehouse_name}${sale.warehouse_code ? ` (${sale.warehouse_code})` : ''}`
                        : 'غير مربوط'}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-color)', borderColor: 'var(--bg-color)' }}>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div><span className="app-text-muted">الإجمالي: </span><span className="font-black app-text-muted">{fmt(sale.total_amount)}</span></div>
                  <div><span className="app-text-muted">المدفوع: </span><span className="font-black app-text-muted">{fmt(sale.paid_amount)}</span></div>
                </div>
              </div>

              {sale.is_multi_warehouse_enabled && !warehouseLinkMissing && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.18)',
                    color: '#047857',
                  }}
                >
                  سيتم إعادة الكمية إلى نفس المستودع المرتبط بفاتورة البيع فقط.
                </div>
              )}

              {warehouseLinkMissing && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    color: '#b91c1c',
                  }}
                >
                  هذه الفاتورة غير مرتبطة بمستودع محدد، لذلك تم إيقاف مرتجع البيع عليها أثناء تفعيل المستودعات المتعددة حتى لا يتم الإرجاع إلى مستودع خاطئ.
                </div>
              )}

              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <th className="px-3 py-2 text-right text-xs font-black app-text-muted w-10">✓</th>
                      {['المنتج', 'المتوفر للإرجاع', 'كمية الإرجاع', 'سعر الوحدة', 'الإجمالي'].map((h) => (
                        <th key={h} className="text-right px-3 py-2 text-xs font-black app-text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((item, idx) => {
                      const fullyReturned = item.max_qty <= 0.000001;

                      return (
                        <tr
                          key={item.sale_item_id}
                          className="border-b"
                          style={{
                            borderColor: 'var(--border)',
                            opacity: fullyReturned ? 0.65 : 1,
                            background: fullyReturned ? 'var(--bg-color)' : 'transparent',
                          }}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={fullyReturned || warehouseLinkMissing}
                              onChange={(e) =>
                                setReturnItems((prev) =>
                                  prev.map((i, j) =>
                                    j === idx
                                      ? {
                                          ...i,
                                          selected: fullyReturned ? false : e.target.checked,
                                        }
                                      : i
                                  )
                                )
                              }
                              className="w-4 h-4 rounded"
                            />
                          </td>

                          <td className="px-3 py-2 font-bold text-slate-700">
                            <div className="flex flex-col gap-1">
                              <span>{item.product_name}</span>

                              <span className="text-[11px] font-medium text-slate-500">
                                المباع: {fmtQty(item.sold_qty)} {item.unit} — المرتجع سابقًا: {fmtQty(item.returned_qty)} {item.unit}
                              </span>

                              {fullyReturned && (
                                <span
                                  className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-black"
                                  style={{
                                    background: 'rgba(239,68,68,0.12)',
                                    color: '#dc2626',
                                  }}
                                >
                                  ✕ تم إرجاعه بالكامل
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-2 text-slate-500 font-bold">
                            {fmtQty(item.max_qty)} {item.unit}
                          </td>

                          <td className="px-3 py-2 w-24">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                setReturnItems((prev) =>
                                  prev.map((i, j) => {
                                    if (j !== idx) return i;

                                    const nextQty = Math.max(
                                      0,
                                      Math.min(parseFloat(e.target.value) || 0, i.max_qty)
                                    );

                                    return {
                                      ...i,
                                      quantity: nextQty,
                                      selected: !fullyReturned && nextQty > 0,
                                    };
                                  })
                                )
                              }
                              className="w-full rounded-lg border px-2 py-1 text-sm outline-none text-center"
                              style={{ borderColor: 'var(--border)' }}
                              min={0.001}
                              max={item.max_qty}
                              step={0.001}
                              disabled={!item.selected || fullyReturned || warehouseLinkMissing}
                            />
                          </td>

                          <td className="px-3 py-2 text-slate-600">{fmt(item.unit_price)}</td>

                          <td className="px-3 py-2 font-bold text-rose-700">
                            {item.selected && item.quantity > 0 ? fmt(item.quantity * item.unit_price) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {selectedItems.length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'rgba(239,68,68,0.08)' }}>
                        <td colSpan={5} className="px-3 py-2.5 font-black text-slate-700 text-sm">إجمالي المرتجع</td>
                        <td className="px-3 py-2.5 font-black text-rose-700">{fmt(total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">طريقة الإرجاع</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash_refund', 'debt_discount', 'stock_only'] as const).map((m) => {
                    const c = RETURN_METHOD_COLORS[m];
                    const active = returnMethod === m;
                    const disabled = warehouseLinkMissing || (m === 'debt_discount' && !sale.customer_id);

                    return (
                      <button
                        key={m}
                        onClick={() => !disabled && setReturnMethod(m)}
                        disabled={disabled}
                        className="py-2.5 rounded-xl text-sm font-bold transition-all border-2 disabled:opacity-50"
                        style={{
                          background: active ? c.bg : 'var(--bg-card)',
                          color: active ? c.color : 'var(--text-secondary)',
                          borderColor: active ? c.color : 'var(--border)',
                        }}
                      >
                        {RETURN_METHOD_LABELS[m]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">سبب الإرجاع</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                    style={{ borderColor: 'var(--border)' }}
                    placeholder="مثال: منتج تالف"
                    disabled={warehouseLinkMissing}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">ملاحظات</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                    style={{ borderColor: 'var(--border)' }}
                    placeholder="اختياري"
                    disabled={warehouseLinkMissing}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl p-3 text-sm text-rose-700" style={{ background: 'rgba(239,68,68,0.08)' }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
          <div className="text-sm">
            {selectedItems.length > 0 && !warehouseLinkMissing && (
              <>
                <span className="text-slate-500">إجمالي المرتجع: </span>
                <span className="font-black text-rose-700">{fmt(total)}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">
              إلغاء
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!sale || selectedItems.length === 0 || mutation.isPending || warehouseLinkMissing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: '#dc2626' }}
            >
              <Check size={15} />
              {mutation.isPending ? 'جارٍ الحفظ...' : 'تأكيد المرتجع'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReturnsPage() {
  const { fmt } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage]             = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId]         = useState<number | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<{ id: number; name: string } | null>(null);
  const [warehouseFilterId, setWarehouseFilterId] = useState<number | ''>('');

  const initialSaleIdRaw = searchParams.get('saleId');
  const initialSaleId = initialSaleIdRaw ? parseInt(initialSaleIdRaw, 10) : null;
  useEffect(() => {
    if (initialSaleId && !showCreate) {
      setShowCreate(true);
    }
  }, [initialSaleId]);

  useEffect(() => {
    setPage(1);
  }, [warehouseFilterId]);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['sales-returns-warehouses'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; warehouses: WarehouseOption[] }>('/warehouses', {
        params: { active: 'true' },
      });
      return res.data.warehouses ?? [];
    },
    staleTime: 30000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['returns', page, warehouseFilterId],
    queryFn: async () => {
      const res = await apiClient.get('/returns', {
        params: {
          page,
          limit: 20,
          warehouse_id: warehouseFilterId || undefined,
        },
      });
      return res.data as {
        returns?: any[];
        total?: number;
        page?: number;
        limit?: number;
      };
    },
  });

  const returns    = data?.returns ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6 min-h-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800">المرتجعات</h1>
          <p className="text-sm text-slate-400 mt-0.5">{total} مرتجع</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-full sm:w-[220px]">
            <select
              value={warehouseFilterId}
              onChange={(e) => setWarehouseFilterId(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
            >
              <option value="">كل المستودعات</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: '#dc2626' }}
          >
            <Plus size={16} />
            مرتجع جديد
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr style={{ background: 'var(--bg-subtle)' }}>
              {['رقم المرتجع', 'فاتورة البيع', 'العميل', 'الإجمالي', 'طريقة الإرجاع', 'التاريخ', ''].map((h) => (
                <th key={h} className="text-right px-4 py-3 text-xs font-black text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">جارٍ التحميل...</td></tr>
            )}
            {!isLoading && returns.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-16">
                  <RotateCcw size={32} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-slate-400 text-sm">لا توجد مرتجعات</p>
                </td>
              </tr>
            )}
            {returns.map((r) => {
              const colors = RETURN_METHOD_COLORS[r.return_method];
              return (
                <tr key={r.id} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewId(r.id)}
                      className="font-black text-xs hover:underline transition"
                      style={{ color: '#2563eb' }}
                      title="عرض تفاصيل المرتجع"
                    >
                      {r.return_number}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold">
  {(r as any).sale_id ? (
    <button
      onClick={() => setSelectedSaleId((r as any).sale_id)}
      className="hover:underline transition"
      style={{ color: '#2563eb' }}
      title="فتح فاتورة البيع"
    >
      {r.sale_invoice}
    </button>
  ) : (
    <span className="text-slate-500">{r.sale_invoice}</span>
  )}
</td>
                  <td className="px-4 py-3 font-bold truncate max-w-[120px]">
                    {r.customer_id && r.customer_name ? (
                      <button
                        onClick={() => setLedgerCustomer({ id: r.customer_id!, name: r.customer_name! })}
                        className="text-slate-700 hover:text-blue-600 hover:underline transition text-right"
                      >
                        {r.customer_name}
                      </button>
                    ) : (
                      <span className="text-slate-500">{r.customer_name ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold text-rose-700">{fmt(r.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{ background: colors.bg, color: colors.color }}
                    >
                      {RETURN_METHOD_LABELS[r.return_method]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(r.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewId(r.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                      title="عرض التفاصيل"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs text-slate-400">{total} نتيجة — صفحة {page} من {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateReturnModal
          initialSaleId={initialSaleId}
          onClose={() => {
            setShowCreate(false);
            if (searchParams.get('saleId')) {
              const params = new URLSearchParams(searchParams);
              params.delete('saleId');
              setSearchParams(params, { replace: true });
            }
          }}
          onDone={() => {
            setShowCreate(false);
            if (searchParams.get('saleId')) {
              const params = new URLSearchParams(searchParams);
              params.delete('saleId');
              setSearchParams(params, { replace: true });
            }
          }}
        />
      )}
      <ReturnInvoiceDetailsModal
  returnId={viewId}
  open={viewId !== null}
  onClose={() => setViewId(null)}
/>
      {ledgerCustomer && (
        <CustomerLedgerModal
          customerId={ledgerCustomer.id}
          customerName={ledgerCustomer.name}
          onClose={() => setLedgerCustomer(null)}
        />
      )}
            <SaleInvoiceDetailsModal
        saleId={selectedSaleId}
        open={selectedSaleId !== null}
        onClose={() => setSelectedSaleId(null)}
      />
    </div>
    
  );
}
