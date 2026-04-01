import React, { useState } from 'react';
import {
  Plus, Search, Truck, Package, ChevronRight, ChevronLeft,
  X, Check, AlertTriangle, CreditCard, Eye, RotateCcw,
} from 'lucide-react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesApi, type Purchase, type PurchaseItemInput } from '../api/purchases.ts';
import { purchaseReturnsApi } from '../api/purchaseReturns.ts';
import { useAuthStore } from '../store/authStore.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { apiClient } from '../api/client.ts';
import SupplierLedgerModal from '../components/SupplierLedgerModal.tsx';
import PurchaseInvoiceDetailsModal from '../components/PurchaseInvoiceDetailsModal.tsx';
import CreatePurchaseReturnModal from '../components/CreatePurchaseReturnModal.tsx';
import { settingsApi } from '../api/settings.ts';
import PurchaseReturnDetailsModal from '../components/PurchaseReturnDetailsModal.tsx';
// ─── Style constants ──────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtRaw = (v: number | string | null | undefined, dec = 2) =>
  v != null ? parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

const PURCHASE_RETURN_METHOD_LABELS: Record<string, string> = {
  cash_refund: 'استرداد نقدي',
  debt_discount: 'خصم من ذمة المورد',
  stock_only: 'إرجاع مخزون فقط',
};

// ─── Product Search ───────────────────────────────────────────────────────────
interface ProductRow {
  id: number; name: string; barcode: string; unit: string;
  purchase_price: string; stock_quantity: string; supplier_name?: string;
}

function ProductSearch({ onSelect }: { onSelect: (p: ProductRow) => void }) {
   const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [focused, setFocused] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const autoAddLockRef = React.useRef(false);
  const lastHandledBarcodeRef = React.useRef('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const open = focused;

  const { data, isFetching } = useQuery({
    queryKey: ['products-search', debouncedQ],
    queryFn: async () => {
      const res = await apiClient.get<{ products: ProductRow[] }>('/products', { params: { q: debouncedQ || undefined, limit: 12 } });
      return res.data.products ?? [];
    },
    enabled: open,
    staleTime: 15_000,
  });
    React.useEffect(() => {
    const code = String(debouncedQ ?? '').trim();
    if (!open || !code) return;
    if (autoAddLockRef.current) return;

    const looksLikeBarcode = /^[0-9A-Za-z._\-]+$/.test(code) && !code.includes(' ');
    if (!looksLikeBarcode) return;

    const exact = (data ?? []).find(
      (p) => String(p.barcode ?? '').trim().toLowerCase() === code.toLowerCase()
    );

    if (!exact) return;
    if (lastHandledBarcodeRef.current === code) return;

    autoAddLockRef.current = true;
    lastHandledBarcodeRef.current = code;

    onSelect(exact);
    setQ('');
    setFocused(false);

    window.setTimeout(() => {
      autoAddLockRef.current = false;
      if (lastHandledBarcodeRef.current === code) {
        lastHandledBarcodeRef.current = '';
      }
    }, 250);
  }, [debouncedQ, data, open, onSelect]);

  

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
      >
        <Search size={15} style={{ color: 'var(--text-muted)' }} />
        <input
  value={q}
  onChange={(e) => {
    autoAddLockRef.current = false;
    lastHandledBarcodeRef.current = '';
    setQ(e.target.value);
  }}
  onFocus={() => setFocused(true)}
  onKeyDown={(e) => {
    if (e.key !== 'Enter') return;

    const code = String(q ?? '').trim();
    if (!code) return;

    const exact = (data ?? []).find(
      (p) => String(p.barcode ?? '').trim().toLowerCase() === code.toLowerCase()
    );

    if (exact) {
      e.preventDefault();
      onSelect(exact);
      setQ('');
      setFocused(false);
    }
  }}
  placeholder="ابحث عن منتج بالاسم أو الباركود..."
  className="flex-1 outline-none text-sm bg-transparent placeholder:text-[var(--text-muted)]"
  style={{ color: 'var(--text-body)' }}
  dir="rtl"
/>
        {isFetching && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>...</span>}
      </div>
      {open && (data?.length ?? 0) > 0 && (
        <div
          className="absolute z-20 w-full mt-1 rounded-xl overflow-hidden max-h-72 overflow-y-auto"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}
        >
          {data!.map((p) => (
            <button
              key={p.id}
              onMouseDown={() => { onSelect(p); setQ(''); setFocused(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-right border-b last:border-0 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              <Package size={14} style={{ color: 'var(--text-muted)' }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate" style={{ color: 'var(--text-heading)' }}>{p.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.barcode || 'بدون باركود'} · مخزون: {fmtRaw(p.stock_quantity, 0)} {p.unit}</div>
              </div>
              <div className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--text-heading)' }}>
                $ {fmtRaw(p.purchase_price)}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && data?.length === 0 && !isFetching && (
        <div
          className="absolute z-20 w-full mt-1 rounded-xl p-4 text-center text-sm"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          لا نتائج
        </div>
      )}
    </div>
  );
}

// ─── Supplier Select ──────────────────────────────────────────────────────────
interface SupplierRow { id: number; name: string; balance: string; }
interface WarehouseOption {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
}
function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers-mini'],
    queryFn: async () => {
      const res = await apiClient.get<{ suppliers: SupplierRow[] }>('/suppliers');
      return res.data.suppliers ?? [];
    },
  });
}

// ─── Invoice Item ─────────────────────────────────────────────────────────────
interface InvoiceItem extends PurchaseItemInput { name: string; unit: string; }

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({
  purchase, onClose, onDone,
}: {
  purchase: Purchase;
  onClose: () => void;
  onDone: () => void;
}) {
  const { fmt, rate, symbol } = useCurrency();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const due = parseFloat(String(purchase.due_amount));

  const mutation = useMutation({
    mutationFn: () => purchasesApi.addPayment(purchase.id, (parseFloat(amount) || 0) / rate),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); onDone(); },
    onError: (e: unknown) => {
      if (axios.isAxiosError(e)) setError(e.response?.data?.message ?? 'حدث خطأ');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ ...surfaceCard }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black" style={text.heading}>تسجيل دفعة</h3>
          <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="mb-4 p-3 rounded-xl" style={subtleCard}>
          <div className="text-xs mb-1" style={text.muted}>فاتورة: <span className="font-bold" style={text.heading}>{purchase.invoice_number}</span></div>
          <div className="text-xs" style={text.muted}>المتبقي: <span className="font-black" style={text.heading}>{fmt(due)}</span></div>
        </div>

        <label className="block text-xs font-bold mb-1.5" style={text.secondary}>المبلغ المدفوع ({symbol})</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
          placeholder={`الحد الأقصى ${fmt(due)}`}
          max={due * rate}
          min={0.01}
          step={0.01}
        />

        {error && <div className="mt-2 text-xs" style={{ color: 'var(--text-heading)' }}>{error}</div>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--primary, #059669)' }}
          >
            <Check size={15} />
            {mutation.isPending ? 'جارٍ...' : 'تأكيد'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold transition-colors hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Purchase Modal ────────────────────────────────────────────────────
function CreatePurchaseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { fmt, rate, symbol } = useCurrency();
  const qc = useQueryClient();
  const { data: suppliers = [] } = useSuppliers();
    const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });

  const isMultiWarehouseEnabled = settings?.enable_multi_warehouse === 'true';

  const { data: warehouses = [] } = useQuery({
    queryKey: ['active-warehouses-for-purchase'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; warehouses: WarehouseOption[] }>('/warehouses', {
        params: { active: 'true' },
      });
      return res.data.warehouses ?? [];
    },
    enabled: isMultiWarehouseEnabled,
    staleTime: 30000,
  });

  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const addProduct = (p: ProductRow) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        product_id: p.id, name: p.name, unit: p.unit,
        quantity: 1, unit_price: parseFloat(p.purchase_price) || 0,
      }];
    });
  };

  const paidUSD = (parseFloat(paidAmount) || 0) / rate;

  const mutation = useMutation({
    mutationFn: () =>
      purchasesApi.create({
        supplier_id: supplierId || null,
        warehouse_id: isMultiWarehouseEnabled ? (warehouseId || null) : null,
        items: items.map(({ product_id, quantity, unit_price }) => ({ product_id, quantity, unit_price })),
        paid_amount: paidUSD,
        purchase_currency: 'USD',
        exchange_rate: 1,
        notes: notes || undefined,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); onDone(); },
    onError: (e: unknown) => {
      if (axios.isAxiosError(e)) setError(e.response?.data?.message ?? 'حدث خطأ');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ ...surfaceCard, maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-black" style={text.heading}>فاتورة شراء جديدة</h3>
          <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={text.secondary}>المورد (اختياري)</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value ? parseInt(e.target.value, 10) : '')}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
              >
                <option value="">— بدون مورد —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {isMultiWarehouseEnabled && (
              <div>
                <label className="block text-xs font-bold mb-1.5" style={text.secondary}>المستودع المستلم</label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
                >
                  <option value="">المستودع الرئيسي تلقائيًا</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.code ? ` (${w.code})` : ''}
                    </option>
                  ))}
                </select>

                <div className="mt-1 text-[11px] font-bold" style={text.muted}>
                  يظهر هذا الحقل فقط عند تفعيل المستودعات المتعددة
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5" style={text.secondary}>إضافة منتج</label>
            <ProductSearch onSelect={addProduct} />
          </div>

          {items.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)' }}>
                    {['المنتج', 'الكمية', 'سعر الوحدة', 'الإجمالي', ''].map((h) => (
                      <th key={h} className="text-right px-3 py-2 text-xs font-black" style={text.secondary}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.product_id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 font-bold" style={text.heading}>{item.name}</td>
                      <td className="px-3 py-2 w-24">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => setItems((prev) => prev.map((i, j) => j === idx ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i))}
                          className="w-full rounded-lg px-2 py-1 text-sm outline-none text-center"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
                          min={0.001}
                          step={0.001}
                        />
                      </td>
                      <td className="px-3 py-2 w-28">
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => setItems((prev) => prev.map((i, j) => j === idx ? { ...i, unit_price: parseFloat(e.target.value) || 0 } : i))}
                          className="w-full rounded-lg px-2 py-1 text-sm outline-none text-center"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="px-3 py-2 font-bold" style={text.heading}>{fmt(item.quantity * item.unit_price)}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setItems((prev) => prev.filter((_, j) => j !== idx))}
                          className="hover:opacity-70 transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-subtle)' }}>
                    <td colSpan={3} className="px-3 py-2.5 font-black text-sm" style={text.heading}>الإجمالي</td>
                    <td colSpan={2} className="px-3 py-2.5 font-black" style={text.heading}>{fmt(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={text.secondary}>المبلغ المدفوع الآن ({symbol})</label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
                min={0}
                step={0.01}
              />
              {total > 0 && paidUSD < total && (
                <div className="mt-1 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>متبقي: {fmt(total - paidUSD)}</div>
              )}
              {total > 0 && paidUSD > total && (
                <div className="mt-1 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>زيادة للمورد: {fmt(paidUSD - total)}</div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5" style={text.secondary}>ملاحظات</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500 placeholder:text-sm"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
                placeholder="اختياري"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-heading)' }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
          <div className="text-sm">
            <span style={text.muted}>الإجمالي: </span>
            <span className="font-black" style={text.heading}>{fmt(total)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
              إلغاء
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={items.length === 0 || mutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--primary, #059669)' }}
            >
              <Check size={15} />
              {mutation.isPending ? 'جارٍ الحفظ...' : 'حفظ الفاتورة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canCreate = user && ['admin', 'manager', 'warehouse'].includes(user.role);
  const canPay = user && ['admin', 'manager'].includes(user.role);

  const [activeTab, setActiveTab] = useState<'purchases' | 'returns'>('purchases');
  const [search, setSearch] = useState('');
  const [warehouseFilterId, setWarehouseFilterId] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [payPurchase, setPayPurchase] = useState<Purchase | null>(null);
  const [returnPurchaseId, setReturnPurchaseId] = useState<number | null>(null);
  const [viewPurchaseReturnId, setViewPurchaseReturnId] = useState<number | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<{ id: number; name: string } | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [activeTab, warehouseFilterId]);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['purchase-pages-warehouses'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; warehouses: WarehouseOption[] }>('/warehouses', {
        params: { active: 'true' },
      });
      return res.data.warehouses ?? [];
    },
    staleTime: 30000,
  });

  const purchasesQuery = useQuery({
    queryKey: ['purchases', page, debouncedSearch, warehouseFilterId],
    queryFn: async () => {
      const res = await apiClient.get('/purchases', {
        params: {
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          warehouse_id: warehouseFilterId || undefined,
        },
      });
      return res.data as {
        purchases?: Purchase[];
        total?: number;
        page?: number;
        limit?: number;
      };
    },
    enabled: activeTab === 'purchases',
  });

  const purchaseReturnsQuery = useQuery({
    queryKey: ['purchase-returns', page, warehouseFilterId],
    queryFn: async () => {
      const res = await apiClient.get('/purchase-returns', {
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
    enabled: activeTab === 'returns',
  });

  const purchases = purchasesQuery.data?.purchases ?? [];
  const returns = purchaseReturnsQuery.data?.returns ?? [];
  const total = activeTab === 'purchases'
    ? (purchasesQuery.data?.total ?? 0)
    : (purchaseReturnsQuery.data?.total ?? 0);
  const totalPages = Math.ceil(total / 20);
  const isLoading = activeTab === 'purchases' ? purchasesQuery.isLoading : purchaseReturnsQuery.isLoading;

  return (
    <div className="p-6 min-h-full" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black" style={text.heading}>المشتريات</h1>
          <p className="text-sm mt-0.5" style={text.muted}>
            {activeTab === 'purchases'
              ? `${total} فاتورة شراء`
              : `${total} مرتجع شراء`}
          </p>
        </div>

        {canCreate && activeTab === 'purchases' && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
            style={{ background: 'var(--primary, #059669)' }}
          >
            <Plus size={16} />
            فاتورة شراء جديدة
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div
          className="inline-flex items-center gap-1 rounded-2xl p-1"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setActiveTab('purchases')}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            style={
              activeTab === 'purchases'
                ? { background: 'var(--bg-card)', color: 'var(--text-heading)', border: '1px solid var(--border)' }
                : { color: 'var(--text-secondary)' }
            }
          >
            فواتير الشراء
          </button>

          <button
            onClick={() => setActiveTab('returns')}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            style={
              activeTab === 'returns'
                ? { background: 'var(--bg-card)', color: 'var(--text-heading)', border: '1px solid var(--border)' }
                : { color: 'var(--text-secondary)' }
            }
          >
            مرتجعات الشراء
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap mr-auto">
          <div className="w-full sm:w-[220px]">
            <select
              value={warehouseFilterId}
              onChange={(e) => setWarehouseFilterId(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
            >
              <option value="">كل المستودعات</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'purchases' && (
            <div className="relative w-full max-w-sm">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث برقم الفاتورة أو اسم المورد..."
                className="w-full rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-[var(--text-muted)]"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
                dir="rtl"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {activeTab === 'purchases' ? (
        <div className="rounded-2xl overflow-hidden" style={{ ...surfaceCard }}>
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                {['رقم الفاتورة', 'المورد', 'الإجمالي', 'المدفوع', 'المتبقي', 'التاريخ', ''].map((h) => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-black" style={text.secondary}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-12" style={text.muted}>جارٍ التحميل...</td></tr>
              )}
              {!isLoading && purchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <Truck size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                    <p style={text.muted}>لا توجد فواتير شراء</p>
                  </td>
                </tr>
              )}
              {purchases.map((p) => {
                const due = parseFloat(String(p.due_amount));
                const isPaid = due <= 0;
                return (
                  <tr key={p.id} className="border-b transition-colors" style={{ borderColor: 'var(--border)', background: 'transparent' }}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewId(p.id)}
                        className="font-black text-xs hover:underline transition"
                        style={{ color: '#3b82f6' }}
                        title="عرض تفاصيل الفاتورة"
                      >
                        {p.invoice_number}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Truck size={13} style={{ color: 'var(--text-muted)' }} />
                        {p.supplier_id ? (
                          <button
                            onClick={() => setLedgerSupplier({ id: p.supplier_id!, name: p.supplier_name ?? 'مورد' })}
                            className="font-bold truncate max-w-[130px] hover:underline transition text-right"
                            style={{ color: '#c3bb2a' }}
                          >
                            {p.supplier_name ?? 'بدون مورد'}
                          </button>
                        ) : (
                          <span className="font-bold truncate max-w-[130px]" style={{ color: 'var(--text-heading)' }}>{p.supplier_name ?? 'بدون مورد'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold" style={text.heading}>{fmt(p.total_amount)}</td>
                    <td className="px-4 py-3 font-bold" style={text.heading}>{fmt(p.paid_amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
                        style={{
                          background: 'var(--bg-subtle)',
                          color: 'var(--text-heading)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {isPaid ? '✓ مسدد' : fmt(due)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={text.muted}>
                      {new Date(p.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewId(p.id)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-opacity-20"
                          style={{ color: '#3b82f6' }}
                          title="عرض التفاصيل"
                        >
                          <Eye size={14} />
                        </button>

                        {canCreate && (
                          <button
                            onClick={() => setReturnPurchaseId(p.id)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-opacity-20"
                            style={{ color: 'red' }}
                            title="مرتجع شراء"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}

                        {canPay && !isPaid && (
                          <button
                            onClick={() => setPayPurchase(p)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-opacity-20"
                            style={{ color: 'green' }}
                            title="تسجيل دفعة"
                          >
                            <CreditCard size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs" style={text.muted}>{total} نتيجة — صفحة {page} من {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-opacity-20"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-opacity-20"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ ...surfaceCard }}>
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                {['رقم المرتجع', 'فاتورة الشراء', 'المورد', 'الإجمالي', 'طريقة الإرجاع', 'التاريخ', ''].map((h) => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-black" style={text.secondary}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-12" style={text.muted}>جارٍ التحميل...</td></tr>
              )}

              {!isLoading && returns.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <RotateCcw size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                    <p style={text.muted}>لا توجد مرتجعات شراء</p>
                  </td>
                </tr>
              )}

              {returns.map((r: any) => (
                <tr key={r.id} className="border-b transition-colors" style={{ borderColor: 'var(--border)', background: 'transparent' }}>
                  <td className="px-4 py-3">
  <button
    onClick={() => setViewPurchaseReturnId(r.id)}
    className="font-black text-xs hover:underline transition"
    style={{ color: '#dc2626' }}
    title="عرض تفاصيل مرتجع الشراء"
  >
    {r.return_number}
  </button>
</td>

                  <td className="px-4 py-3">
                    {r.purchase_id ? (
                      <button
                        onClick={() => setViewId(r.purchase_id)}
                        className="font-bold text-xs hover:underline transition"
                        style={{ color: 'red' }}
                        title="فتح فاتورة الشراء"
                      >
                        {r.purchase_invoice}
                      </button>
                    ) : (
                      <span className="text-xs" style={text.muted}>{r.purchase_invoice ?? '—'}</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {r.supplier_id && r.supplier_name ? (
                      <button
                        onClick={() => setLedgerSupplier({ id: r.supplier_id, name: r.supplier_name })}
                        className="font-bold truncate max-w-[130px] hover:underline transition text-right"
                        style={{ color: '#c9ad20' }}
                      >
                        {r.supplier_name}
                      </button>
                    ) : (
                      <span className="font-bold truncate max-w-[130px]" style={{ color: 'var(--text-heading)' }}>
                        {r.supplier_name ?? 'بدون مورد'}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-bold" style={text.heading}>{fmt(r.total_amount)}</td>

                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {PURCHASE_RETURN_METHOD_LABELS[r.return_method] ?? r.return_method}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs" style={text.muted}>
                    {new Date(r.created_at).toLocaleDateString('en-GB')}
                  </td>

                 <td className="px-4 py-3">
  <button
    onClick={() => setViewPurchaseReturnId(r.id)}
    className="p-1.5 rounded-lg transition-colors hover:bg-opacity-20"
    style={{ color: 'var(--text-muted)' }}
    title="فتح مرتجع الشراء"
  >
    <Eye size={14} />
  </button>
</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs" style={text.muted}>{total} نتيجة — صفحة {page} من {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-opacity-20"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-opacity-20"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreatePurchaseModal
          onClose={() => setShowCreate(false)}
          onDone={() => setShowCreate(false)}
        />
      )}

      <PurchaseInvoiceDetailsModal
        purchaseId={viewId}
        open={viewId !== null}
        onClose={() => setViewId(null)}
        onCreateReturn={(purchaseId) => {
          setViewId(null);
          setReturnPurchaseId(purchaseId);
        }}
      />
      <PurchaseReturnDetailsModal
  returnId={viewPurchaseReturnId}
  open={viewPurchaseReturnId !== null}
  onClose={() => setViewPurchaseReturnId(null)}
/>

      {payPurchase && (
        <PaymentModal
          purchase={payPurchase}
          onClose={() => setPayPurchase(null)}
          onDone={() => setPayPurchase(null)}
        />
      )}

      <CreatePurchaseReturnModal
        purchaseId={returnPurchaseId}
        open={returnPurchaseId !== null}
        onClose={() => setReturnPurchaseId(null)}
        onDone={() => {
          void qc.invalidateQueries({ queryKey: ['purchase-returns'] });
          setReturnPurchaseId(null);
          setActiveTab('returns');
        }}
      />

      {ledgerSupplier && (
        <SupplierLedgerModal
          supplierId={ledgerSupplier.id}
          supplierName={ledgerSupplier.name}
          onClose={() => setLedgerSupplier(null)}
        />
      )}
    </div>
  );
}