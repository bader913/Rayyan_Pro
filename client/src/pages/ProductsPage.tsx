import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce.ts';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client.ts';
import { settingsApi } from '../api/settings.ts';
import {
  Plus, Search, Edit2, Power, Scale, Tag, Package,
  Layers, ChevronRight, ChevronLeft, AlertTriangle,
  X, Check, SlidersHorizontal, ArrowUpDown, Warehouse,
  Download, Upload, FileSpreadsheet,
} from 'lucide-react';
import {
  useProducts, useCreateProduct, useUpdateProduct,
  useToggleProductActive, useAdjustStock,
  useCategories, useCreateCategory, useDeleteCategory,
  useSuppliers,
  type Product, type CreateProductData, type Category, type Supplier,
} from '../api/products.ts';
import { useAuthStore } from '../store/authStore.ts';

// ─── Theme helpers ────────────────────────────────────────────────────────────

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

const fieldStyle: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  color: 'var(--text-body)',
};

const fieldClass =
  'w-full rounded-2xl px-3.5 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10';

const labelClass = 'block text-xs font-black mb-1.5';

// ─── Constants ───────────────────────────────────────────────────────────────

const UNITS = ['قطعة', 'كغ', 'غ', 'لتر', 'مل', 'علبة', 'كرتون', 'حزمة', 'متر', 'دزينة'];

const fmtPrice = (v: string | null | undefined) =>
  v ? parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—';

const fmtQty = (v: string | null | undefined, unit?: string) =>
  v ? `${parseFloat(v).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${unit ?? ''}`.trim() : '0';

// ─── Stock Badge ─────────────────────────────────────────────────────────────

function StockBadge({ qty, min, unit }: { qty: string; min: string; unit: string }) {
  const q = parseFloat(qty);
  const m = parseFloat(min);
  const isOut = q <= 0;
  const isLow = !isOut && q <= m;

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
      style={{
        background: isOut ? '#fee2e2' : isLow ? '#fef3c7' : '#dcfce7',
        color: isOut ? '#b91c1c' : isLow ? '#92400e' : '#166534',
      }}
    >
      {isOut && <AlertTriangle size={11} />}
      {fmtQty(qty, unit)}
    </span>
  );
}

// ─── Product Form ─────────────────────────────────────────────────────────────

interface ProductFormState {
  barcode: string;
  name: string;
  category_id: string;
  unit: string;
  is_weighted: boolean;
  purchase_price: string;
  retail_price: string;
  wholesale_price: string;
  wholesale_min_qty: string;
  initial_stock: string;
  initial_warehouse_id: string;
  min_stock_level: string;
  expiry_date: string;
  supplier_id: string;
  notes: string;
}
interface WarehouseStockRow {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  quantity: string;
}
interface WarehouseOption {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
}

const EMPTY_FORM: ProductFormState = {
  barcode: '', name: '', category_id: '', unit: 'قطعة', is_weighted: false,
  purchase_price: '', retail_price: '', wholesale_price: '', wholesale_min_qty: '1',
  initial_stock: '0', initial_warehouse_id: '', min_stock_level: '5',
  expiry_date: '', supplier_id: '', notes: '',
};

function toFormState(p: Product): ProductFormState {
  return {
    barcode: p.barcode ?? '',
    name: p.name,
    category_id: p.category_id ?? '',
    unit: p.unit,
    is_weighted: p.is_weighted,
    purchase_price: p.purchase_price,
    retail_price: p.retail_price,
    wholesale_price: p.wholesale_price ?? '',
    wholesale_min_qty: p.wholesale_min_qty,
    initial_stock: '0',
    initial_warehouse_id: '',
    min_stock_level: p.min_stock_level,
    expiry_date: p.expiry_date ? p.expiry_date.split('T')[0] : '',
    supplier_id: p.supplier_id ?? '',
    notes: p.notes ?? '',
  };
}

interface ProductModalProps {
  editProduct: Product | null;
  categories: Category[];
  suppliers: Supplier[];
  warehouses: WarehouseOption[];
  isMultiWarehouseEnabled: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProductData) => void;
  onAddCategory: (name: string) => Promise<Category>;
  loading: boolean;
  error: string;
}

function ProductModal({
  editProduct,
  categories,
  suppliers,
  warehouses,
  isMultiWarehouseEnabled,
  onClose,
  onSubmit,
  onAddCategory,
  loading,
  error,
}: ProductModalProps) {
  const [form, setForm] = useState<ProductFormState>(
    editProduct ? toFormState(editProduct) : EMPTY_FORM
  );
  const [newCatInput, setNewCatInput] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [catAdding, setCatAdding] = useState(false);

  const set = (field: keyof ProductFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const toggle = (field: keyof ProductFormState) => () =>
    setForm((f) => ({ ...f, [field]: !f[field] }));

  const handleQuickAddCategory = async () => {
    if (!newCatInput.trim() || catAdding) return;
    setCatAdding(true);
    try {
      const cat = await onAddCategory(newCatInput.trim());
      setForm((f) => ({ ...f, category_id: String(cat.id) }));
      setNewCatInput('');
      setShowCatInput(false);
    } catch {
      // ignored
    }
    setCatAdding(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parseNum = (s: string, fallback = 0) => {
      const n = parseFloat(s.replace(/,/g, ''));
      return isNaN(n) ? fallback : n;
    };
    onSubmit({
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
      category_id: form.category_id ? parseInt(form.category_id, 10) : null,
      unit: form.unit,
      is_weighted: form.is_weighted,
      purchase_price: parseNum(form.purchase_price),
      retail_price: parseNum(form.retail_price),
      wholesale_price: form.wholesale_price ? parseNum(form.wholesale_price) : null,
      wholesale_min_qty: parseNum(form.wholesale_min_qty, 1),
      initial_stock: parseNum(form.initial_stock),
      initial_warehouse_id:
        !editProduct && isMultiWarehouseEnabled && form.initial_warehouse_id
          ? parseInt(form.initial_warehouse_id, 10)
          : null,
      min_stock_level: parseNum(form.min_stock_level, 5),
      expiry_date: form.expiry_date || null,
      supplier_id: form.supplier_id ? parseInt(form.supplier_id, 10) : null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ background: 'rgba(15, 23, 42, 0.35)' }}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col"
        style={surfaceCard}
        dir="rtl"
      >
        <div
          className="flex items-center justify-between px-5 py-4 md:px-6 md:py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: '#059669', border: '1px solid var(--border)' }}
            >
              <Package size={18} />
            </div>

            <div>
              <h2 className="text-base md:text-lg font-black" style={text.heading}>
                {editProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
              </h2>
              <p className="text-xs font-semibold mt-1" style={text.muted}>
                نفس الهوية البصرية المعتمدة في ريان برو
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition"
            style={{ ...subtleCard, color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6 space-y-5">
          {error && (
            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold"
              style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
            >
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <div className="rounded-3xl p-4 md:p-5" style={subtleCard}>
            <div className="flex items-center gap-2 mb-4">
              <Tag size={14} style={{ color: '#10b981' }} />
              <span className="text-xs font-black uppercase tracking-wider" style={text.secondary}>
                المعلومات الأساسية
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className={labelClass} style={text.secondary}>اسم المنتج *</label>
                <input
                  required
                  value={form.name}
                  onChange={set('name')}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="أدخل اسم المنتج"
                />
              </div>

              <div>
                <label className={labelClass} style={text.secondary}>الباركود</label>
                <input
                  value={form.barcode}
                  onChange={set('barcode')}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="اختياري"
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelClass} style={text.secondary}>الفئة</label>
                {showCatInput ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newCatInput}
                      onChange={(e) => setNewCatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickAddCategory();
                        }
                        if (e.key === 'Escape') {
                          setShowCatInput(false);
                          setNewCatInput('');
                        }
                      }}
                      placeholder="اسم الفئة الجديدة..."
                      className={`${fieldClass} flex-1`}
                      style={fieldStyle}
                      disabled={catAdding}
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddCategory}
                      disabled={catAdding || !newCatInput.trim()}
                      className="px-3 rounded-2xl text-white text-xs font-black disabled:opacity-50"
                      style={{ background: '#059669' }}
                    >
                      {catAdding ? '...' : <Check size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCatInput(false);
                        setNewCatInput('');
                      }}
                      className="px-3 rounded-2xl text-xs font-black"
                      style={{ ...subtleCard, color: 'var(--text-muted)' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={form.category_id}
                      onChange={set('category_id')}
                      className={`${fieldClass} flex-1`}
                      style={fieldStyle}
                    >
                      <option value="">— بلا فئة —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCatInput(true)}
                      title="إضافة فئة جديدة"
                      className="px-3 rounded-2xl transition"
                      style={{ ...subtleCard, color: 'var(--text-muted)' }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className={labelClass} style={text.secondary}>وحدة القياس</label>
                <select
                  value={form.unit}
                  onChange={set('unit')}
                  className={fieldClass}
                  style={fieldStyle}
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div className="flex items-center md:col-span-1">
                <label className="flex items-center gap-3 cursor-pointer select-none mt-5">
                  <div
                    onClick={toggle('is_weighted')}
                    className="w-11 h-6 rounded-full relative transition-colors cursor-pointer flex-shrink-0"
                    style={{ background: form.is_weighted ? '#059669' : '#cbd5e1' }}
                  >
                    <div
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all"
                      style={{ right: form.is_weighted ? '24px' : '4px' }}
                    />
                  </div>

                  <div>
                    <div className="text-xs font-black flex items-center gap-1" style={text.body}>
                      <Scale size={12} />
                      منتج موزون
                    </div>
                    <div className="text-[10px] font-semibold" style={text.muted}>
                      الكمية بالكيلو أو الغرام
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-4 md:p-5" style={subtleCard}>
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpDown size={14} style={{ color: '#10b981' }} />
              <span className="text-xs font-black uppercase tracking-wider" style={text.secondary}>
                الأسعار
              </span>
            </div>

            <div
              className="mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold"
              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
            >
              <span className="text-base">💡</span>
              جميع الأسعار تُسجَّل بالدولار الأمريكي <span className="font-black">(USD $)</span>
              — ويتم تحويلها تلقائيًا داخل النظام حسب الإعدادات.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass} style={text.secondary}>
                  سعر الشراء * <span className="font-black text-emerald-600">($)</span>
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchase_price}
                  onChange={set('purchase_price')}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="0.00 $"
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelClass} style={text.secondary}>
                  سعر البيع مفرق * <span className="font-black text-emerald-600">($)</span>
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.retail_price}
                  onChange={set('retail_price')}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="0.00 $"
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelClass} style={text.secondary}>
                  سعر البيع جملة <span className="font-black text-emerald-600">($)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.wholesale_price}
                  onChange={set('wholesale_price')}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="اختياري $"
                  dir="ltr"
                />
              </div>

              {form.wholesale_price && (
                <div>
                  <label className={labelClass} style={text.secondary}>الحد الأدنى للجملة (كمية)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.wholesale_min_qty}
                    onChange={set('wholesale_min_qty')}
                    className={fieldClass}
                    style={fieldStyle}
                    placeholder="1"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl p-4 md:p-5" style={subtleCard}>
            <div className="flex items-center gap-2 mb-4">
              <Warehouse size={14} style={{ color: '#10b981' }} />
              <span className="text-xs font-black uppercase tracking-wider" style={text.secondary}>
                المخزون والمورد
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {!editProduct && (
                <div>
                  <label className={labelClass} style={text.secondary}>الكمية الافتتاحية</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.initial_stock}
                    onChange={set('initial_stock')}
                    className={fieldClass}
                    style={fieldStyle}
                    placeholder="0"
                    dir="ltr"
                  />
                </div>
              )}
              {!editProduct && isMultiWarehouseEnabled && (
                <div>
                  <label className={labelClass} style={text.secondary}>المستودع الافتتاحي</label>
                  <select
                    value={form.initial_warehouse_id}
                    onChange={set('initial_warehouse_id')}
                    className={fieldClass}
                    style={fieldStyle}
                  >
                    <option value="">المستودع الرئيسي تلقائيًا</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}{w.code ? ` (${w.code})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] font-semibold mt-1.5" style={text.muted}>
                    يظهر هذا الحقل فقط عند تفعيل المستودعات المتعددة
                  </p>
                </div>
              )}

              <div>
                <label className={labelClass} style={text.secondary}>حد التنبيه (أقل كمية)</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.min_stock_level}
                  onChange={set('min_stock_level')}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="5"
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelClass} style={text.secondary}>تاريخ الانتهاء</label>
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={set('expiry_date')}
                  className={fieldClass}
                  style={fieldStyle}
                  dir="ltr"
                />
              </div>

              <div className={editProduct ? 'md:col-span-2' : ''}>
                <label className={labelClass} style={text.secondary}>المورد</label>
                <select
                  value={form.supplier_id}
                  onChange={set('supplier_id')}
                  className={fieldClass}
                  style={fieldStyle}
                >
                  <option value="">— بلا مورد —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className={labelClass} style={text.secondary}>ملاحظات</label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={3}
                className={`${fieldClass} resize-none`}
                style={fieldStyle}
                placeholder="ملاحظات إضافية (اختياري)"
              />
            </div>
          </div>
        </form>

        <div
          className="px-5 py-4 md:px-6 border-t flex items-center justify-end gap-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl text-sm font-black transition"
            style={{ ...subtleCard, color: 'var(--text-secondary)' }}
          >
            إلغاء
          </button>

          <button
            onClick={(e) => {
              e.preventDefault();
              const f = document.querySelector('form');
              f?.requestSubmit();
            }}
            disabled={loading}
            className="px-6 py-2.5 rounded-2xl text-sm font-black text-white transition disabled:opacity-50"
            style={{ background: '#059669' }}
          >
            {loading ? 'جاري الحفظ...' : editProduct ? 'حفظ التعديلات' : 'إضافة المنتج'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Adjust Modal ───────────────────────────────────────────────────────

function StockModal({
  product,
  warehouses,
  isMultiWarehouseEnabled,
  onClose,
  onSubmit,
  loading,
}: {
  product: Product;
  warehouses: WarehouseOption[];
  isMultiWarehouseEnabled: boolean;
  onClose: () => void;
  onSubmit: (qty: number, warehouseId: number | null, note: string) => void;
  loading: boolean;
}) {
  const getDefaultWarehouseId = () => {
    const main = warehouses.find((w) => w.code === 'MAIN');
    return String(main?.id ?? warehouses[0]?.id ?? '');
  };

  const [qty, setQty] = useState(product.stock_quantity);
  const [note, setNote] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    isMultiWarehouseEnabled ? getDefaultWarehouseId() : ''
  );
  const [warehouseRows, setWarehouseRows] = useState<WarehouseStockRow[]>([]);
  const [warehouseRowsLoading, setWarehouseRowsLoading] = useState(false);
  const [warehouseRowsError, setWarehouseRowsError] = useState('');
  const [currentWarehouseQty, setCurrentWarehouseQty] = useState(product.stock_quantity);

  useEffect(() => {
    if (!isMultiWarehouseEnabled) {
      setQty(product.stock_quantity);
      setCurrentWarehouseQty(product.stock_quantity);
      setSelectedWarehouseId('');
      return;
    }

    const nextDefaultId = getDefaultWarehouseId();
    setSelectedWarehouseId(nextDefaultId);
  }, [product.id, product.stock_quantity, isMultiWarehouseEnabled, warehouses]);

  useEffect(() => {
    if (!isMultiWarehouseEnabled) return;

    let cancelled = false;
    setWarehouseRowsLoading(true);
    setWarehouseRowsError('');

    apiClient
      .get<{ success: boolean; warehouses: WarehouseStockRow[] }>(`/products/${product.id}/warehouse-stock`)
      .then((res) => {
        if (cancelled) return;
        setWarehouseRows(res.data.warehouses ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setWarehouseRows([]);
        setWarehouseRowsError(msg ?? 'تعذر تحميل أرصدة المستودعات');
      })
      .finally(() => {
        if (!cancelled) setWarehouseRowsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [product.id, isMultiWarehouseEnabled]);

  useEffect(() => {
    if (!isMultiWarehouseEnabled) return;

    const row = warehouseRows.find((r) => Number(r.id) === Number(selectedWarehouseId));
    const nextQty = row?.quantity ?? '0';
    setCurrentWarehouseQty(nextQty);
    setQty(nextQty);
  }, [selectedWarehouseId, warehouseRows, isMultiWarehouseEnabled]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ background: 'rgba(15, 23, 42, 0.35)' }}
    >
      <div className="w-full max-w-md rounded-3xl p-5 md:p-6" style={surfaceCard} dir="rtl">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)', color: '#059669', border: '1px solid var(--border)' }}
          >
            <SlidersHorizontal size={16} />
          </div>
          <div>
            <h3 className="font-black text-base" style={text.heading}>تعديل المخزون</h3>
            <p className="text-xs font-semibold mt-1" style={text.muted}>{product.name}</p>
          </div>
        </div>

        {isMultiWarehouseEnabled && (
          <div className="mb-3">
            <label className={labelClass} style={text.secondary}>المستودع</label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className={fieldClass}
              style={fieldStyle}
              disabled={warehouseRowsLoading || warehouses.length === 0}
            >
              <option value="">اختر المستودع</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>

            <p className="text-[11px] font-semibold mt-1.5" style={text.muted}>
              عند تفعيل المستودعات المتعددة يصبح التعديل على رصيد المستودع المحدد وليس على الإجمالي العام مباشرة
            </p>
          </div>
        )}

        {isMultiWarehouseEnabled && warehouseRowsError && (
          <div
            className="mb-3 rounded-2xl px-4 py-3 text-sm font-bold"
            style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
          >
            {warehouseRowsError}
          </div>
        )}

        <div className="mb-3">
          <label className={labelClass} style={text.secondary}>
            {isMultiWarehouseEnabled ? 'الكمية الجديدة في المستودع' : 'الكمية الجديدة'}
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
            dir="ltr"
            disabled={warehouseRowsLoading}
          />
          <p className="text-[11px] font-semibold mt-1.5" style={text.muted}>
            {isMultiWarehouseEnabled
              ? `الكمية الحالية في المستودع: ${fmtQty(currentWarehouseQty, product.unit)}`
              : `الكمية الحالية: ${fmtQty(product.stock_quantity, product.unit)}`}
          </p>
        </div>

        <div className="mb-5">
          <label className={labelClass} style={text.secondary}>سبب التعديل</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
            placeholder="جرد، تصحيح، ..."
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl text-sm font-black transition"
            style={{ ...subtleCard, color: 'var(--text-secondary)' }}
          >
            إلغاء
          </button>

          <button
            onClick={() =>
              onSubmit(
                parseFloat(qty) || 0,
                isMultiWarehouseEnabled
                  ? (selectedWarehouseId ? parseInt(selectedWarehouseId, 10) : null)
                  : null,
                note
              )
            }
            disabled={loading || warehouseRowsLoading || (isMultiWarehouseEnabled && !selectedWarehouseId)}
            className="flex-1 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-50 transition"
            style={{ background: '#059669' }}
          >
            {loading ? 'جاري...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
function WarehouseStockModal({
  product,
  rows,
  loading,
  error,
  onClose,
}: {
  product: Product;
  rows: WarehouseStockRow[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ background: 'rgba(15, 23, 42, 0.35)' }}
    >
      <div className="w-full max-w-2xl rounded-3xl overflow-hidden" style={surfaceCard} dir="rtl">
        <div
          className="flex items-center justify-between px-5 py-4 md:px-6 md:py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: '#059669', border: '1px solid var(--border)' }}
            >
              <Warehouse size={16} />
            </div>
            <div>
              <h3 className="font-black text-base" style={text.heading}>توزيع المخزون حسب المستودع</h3>
              <p className="text-xs font-semibold mt-1" style={text.muted}>{product.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition"
            style={{ ...subtleCard, color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 md:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl p-4" style={subtleCard}>
              <div className="text-xs font-black mb-1" style={text.muted}>المنتج</div>
              <div className="text-sm font-black" style={text.body}>{product.name}</div>
            </div>

            <div className="rounded-2xl p-4" style={subtleCard}>
              <div className="text-xs font-black mb-1" style={text.muted}>الوحدة</div>
              <div className="text-sm font-black" style={text.body}>{product.unit}</div>
            </div>

            <div className="rounded-2xl p-4" style={subtleCard}>
              <div className="text-xs font-black mb-1" style={text.muted}>الإجمالي العام</div>
              <div className="text-sm font-black" style={text.body}>
                {fmtQty(product.stock_quantity, product.unit)}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl px-4 py-8 text-center text-sm font-semibold" style={{ ...subtleCard, ...text.muted }}>
              جاري تحميل توزيع المستودعات...
            </div>
          ) : error ? (
            <div
              className="rounded-2xl px-4 py-3 text-sm font-bold"
              style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
            >
              {error}
            </div>
          ) : (
            <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <th className="text-right px-4 py-3 text-xs font-black" style={text.secondary}>المستودع</th>
                      <th className="text-right px-4 py-3 text-xs font-black" style={text.secondary}>الرمز</th>
                      <th className="text-right px-4 py-3 text-xs font-black" style={text.secondary}>الحالة</th>
                      <th className="text-right px-4 py-3 text-xs font-black" style={text.secondary}>الرصيد</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black" style={text.body}>{row.name}</span>
                            {row.code === 'MAIN' && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black"
                                style={{ background: '#dcfce7', color: '#166534' }}
                              >
                                رئيسي
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs font-mono" style={text.muted}>
                          {row.code ?? '—'}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black"
                            style={
                              row.is_active
                                ? { background: '#ecfdf5', color: '#166534' }
                                : { background: '#f1f5f9', color: '#94a3b8' }
                            }
                          >
                            {row.is_active ? 'نشط' : 'معطّل'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-sm font-black" style={text.body}>
                            {fmtQty(row.quantity, product.unit)}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm font-semibold" style={text.muted}>
                          لا توجد بيانات توزيع للمستودعات
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Categories Panel ─────────────────────────────────────────────────────────

function CategoriesPanel({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const [newName, setNewName] = useState('');
  const createCat = useCreateCategory();
  const deleteCat = useDeleteCategory();
  const [err, setErr] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setErr('');
    try {
      await createCat.mutateAsync({ name: newName.trim() });
      setNewName('');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(msg ?? 'حدث خطأ');
    }
  };

  const handleDelete = async (id: string, count: number) => {
    if (count > 0) {
      setErr('لا يمكن حذف فئة تحتوي منتجات');
      return;
    }
    setErr('');
    try {
      await deleteCat.mutateAsync(id);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(msg ?? 'حدث خطأ');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ background: 'rgba(15, 23, 42, 0.35)' }}
    >
      <div className="w-full max-w-md rounded-3xl p-5 md:p-6" style={surfaceCard} dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: '#059669', border: '1px solid var(--border)' }}
            >
              <Layers size={16} />
            </div>
            <div>
              <h3 className="font-black text-base" style={text.heading}>الفئات</h3>
              <p className="text-xs font-semibold mt-1" style={text.muted}>إدارة فئات المنتجات</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition"
            style={{ ...subtleCard, color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {err && (
          <div
            className="mb-4 rounded-2xl px-4 py-3 text-sm font-bold"
            style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
          >
            {err}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={`${fieldClass} flex-1`}
            style={fieldStyle}
            placeholder="اسم الفئة الجديدة"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={createCat.isPending}
            className="px-3 py-2.5 rounded-2xl text-white text-sm font-black disabled:opacity-50"
            style={{ background: '#059669' }}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {categories.length === 0 && (
            <div className="rounded-2xl px-4 py-8 text-center text-sm font-semibold" style={{ ...subtleCard, ...text.muted }}>
              لا توجد فئات بعد
            </div>
          )}

          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3"
              style={subtleCard}
            >
              <div className="min-w-0">
                <span className="text-sm font-black" style={text.body}>{c.name}</span>
                <span className="text-[11px] font-semibold mr-2" style={text.muted}>
                  ({c.products_count} منتج)
                </span>
              </div>

              <button
                onClick={() => handleDelete(c.id, c.products_count)}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition"
                style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}
                title="حذف الفئة"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'warehouse';
  const canToggleActive = user?.role === 'admin' || user?.role === 'manager';
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });

  const isMultiWarehouseEnabled = settings?.enable_multi_warehouse === 'true';
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [categoryId, setCategoryId] = useState(() => searchParams.get('category_id') ?? '');
  const [warehouseFilterId, setWarehouseFilterId] = useState(() => searchParams.get('warehouse_id') ?? '');
  const [activeTab, setActiveTab] = useState<'true' | 'false' | 'all'>(() => {
    const raw = searchParams.get('is_active');
    return raw === 'false' || raw === 'all' || raw === 'true' ? raw : 'true';
  });
  const [lowStock, setLowStock] = useState(() => searchParams.get('low_stock') === '1');
  const [page, setPage] = useState(1);

  const resetPage = useCallback(() => setPage(1), []);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    const nextSearch = searchParams.get('q') ?? '';
    const nextCategoryId = searchParams.get('category_id') ?? '';
    const nextWarehouseFilterId = searchParams.get('warehouse_id') ?? '';
    const rawActive = searchParams.get('is_active');
    const nextActiveTab: 'true' | 'false' | 'all' =
      rawActive === 'false' || rawActive === 'all' || rawActive === 'true' ? rawActive : 'true';
    const nextLowStock = searchParams.get('low_stock') === '1';

    let changed = false;

    if (search !== nextSearch) {
      setSearch(nextSearch);
      changed = true;
    }
    if (categoryId !== nextCategoryId) {
      setCategoryId(nextCategoryId);
      changed = true;
    }
    if (warehouseFilterId !== nextWarehouseFilterId) {
      setWarehouseFilterId(nextWarehouseFilterId);
      changed = true;
    }
    if (activeTab !== nextActiveTab) {
      setActiveTab(nextActiveTab);
      changed = true;
    }
    if (lowStock !== nextLowStock) {
      setLowStock(nextLowStock);
      changed = true;
    }

    if (changed) {
      setPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams();

    if (search.trim()) nextParams.set('q', search.trim());
    if (categoryId) nextParams.set('category_id', categoryId);
    if (warehouseFilterId) nextParams.set('warehouse_id', warehouseFilterId);
    if (activeTab !== 'true') nextParams.set('is_active', activeTab);
    if (lowStock) nextParams.set('low_stock', '1');

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [search, categoryId, warehouseFilterId, activeTab, lowStock, searchParams, setSearchParams]);

  useEffect(() => {
    if (!settings) return;
    if (!isMultiWarehouseEnabled && warehouseFilterId) {
      setWarehouseFilterId('');
      setPage(1);
    }
  }, [settings, isMultiWarehouseEnabled, warehouseFilterId]);

  const { data, isLoading } = useProducts({
    q: debouncedSearch || undefined,
    category_id: categoryId || undefined,
    warehouse_id: isMultiWarehouseEnabled ? (warehouseFilterId || undefined) : undefined,
    is_active: activeTab,
    low_stock: lowStock || undefined,
    page,
    limit: 20,
  });

  const { data: categories = [] } = useCategories();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useQuery({
    queryKey: ['active-warehouses-for-product-create'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; warehouses: WarehouseOption[] }>('/warehouses', {
        params: { active: 'true' },
      });
      return res.data.warehouses ?? [];
    },
    enabled: isMultiWarehouseEnabled,
    staleTime: 30000,
  });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const toggleActive = useToggleProductActive();
  const adjustStock = useAdjustStock();
  const createCategory = useCreateCategory();

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);

  const handleExportTemplate = async () => {
    try {
      const token = useAuthStore.getState().accessToken ?? '';
      const res = await fetch('/api/products/export-template', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('فشل تحميل القالب');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('فشل تحميل القالب');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportResult(null);
    try {
      const token = useAuthStore.getState().accessToken ?? '';
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      setImportResult({ created: json.created ?? 0, errors: json.errors ?? [] });
      if (json.created > 0) {
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['categories'] });

        setTimeout(() => {
          setImportResult(null);
        }, 8000);
      }
    } catch {
      alert('حدث خطأ أثناء الاستيراد');
    }
    setImporting(false);
  };

  const handleAddCategoryFromModal = async (name: string): Promise<Category> => {
    return createCategory.mutateAsync({ name });
  };

  const [showProductModal, setShowProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [modalError, setModalError] = useState('');
  const [warehouseStockProduct, setWarehouseStockProduct] = useState<Product | null>(null);
  const [warehouseStockRows, setWarehouseStockRows] = useState<WarehouseStockRow[]>([]);
  const [warehouseStockLoading, setWarehouseStockLoading] = useState(false);
  const [warehouseStockError, setWarehouseStockError] = useState('');

  const openCreate = () => {
    setEditProduct(null);
    setModalError('');
    setShowProductModal(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setModalError('');
    setShowProductModal(true);
  };

  const closeModal = () => {
    setShowProductModal(false);
    setEditProduct(null);
    setModalError('');
  };

  const handleProductSubmit = async (data: CreateProductData) => {
    setModalError('');
    try {
      if (editProduct) {
        const { initial_stock: _, ...rest } = data;
        await updateProduct.mutateAsync({ id: editProduct.id, ...rest });
      } else {
        await createProduct.mutateAsync(data);
      }
      closeModal();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setModalError(msg ?? 'حدث خطأ، يرجى المحاولة مرة أخرى');
    }
  };

  const handleAdjustStock = async (qty: number, warehouseId: number | null, note: string) => {
    if (!stockProduct) return;

    await adjustStock.mutateAsync({
      id: stockProduct.id,
      new_quantity: qty,
      warehouse_id: warehouseId,
      note,
    });

    setStockProduct(null);
  };

  const openWarehouseStock = async (product: Product) => {
    setWarehouseStockProduct(product);
    setWarehouseStockRows([]);
    setWarehouseStockError('');
    setWarehouseStockLoading(true);

    try {
      const res = await apiClient.get<{
        success: boolean;
        warehouses: WarehouseStockRow[];
      }>(`/products/${product.id}/warehouse-stock`);

      setWarehouseStockRows(res.data.warehouses ?? []);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setWarehouseStockError(msg ?? 'تعذر تحميل توزيع المستودعات');
    } finally {
      setWarehouseStockLoading(false);
    }
  };

  const products = data?.products ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-5" dir="rtl">
      <div
        className="rounded-3xl px-5 py-4 md:px-6 md:py-5"
        style={{
          ...surfaceCard,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle)) 0%, var(--bg-card) 100%)',
        }}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl md:text-[28px] font-black tracking-tight" style={text.heading}>
              إدارة المنتجات
            </h1>
            <p className="text-sm font-semibold mt-1" style={text.secondary}>
              {pagination ? `${pagination.total.toLocaleString('en-US')} منتج إجمالاً` : '...'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCategories(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-black transition"
              style={{ ...subtleCard, color: 'var(--text-secondary)' }}
            >
              <Layers size={14} />
              الفئات
            </button>

            <button
              onClick={handleExportTemplate}
              title="تحميل قالب Excel فارغ"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-black transition"
              style={{ ...subtleCard, color: '#047857' }}
            >
              <Download size={14} />
              <FileSpreadsheet size={14} />
              قالب Excel
            </button>

            {canEdit && (
              <label
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''
                  }`}
                style={{ ...subtleCard, color: '#1d4ed8' }}
              >
                <Upload size={14} />
                {importing ? 'جارٍ الاستيراد...' : 'استيراد Excel'}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImport}
                  className="hidden"
                  disabled={importing}
                />
              </label>
            )}

            {canEdit && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black text-white transition hover:opacity-90"
                style={{ background: '#059669' }}
              >
                <Plus size={15} />
                منتج جديد
              </button>
            )}
          </div>
        </div>
      </div>

      {importResult && (
        <div
          className="rounded-3xl p-4"
          style={{
            background: importResult.errors.length === 0 ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${importResult.errors.length === 0 ? '#a7f3d0' : '#fde68a'}`,
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-1">
            <span
              className="text-sm font-black"
              style={{ color: importResult.errors.length === 0 ? '#065f46' : '#92400e' }}
            >
              {importResult.errors.length === 0
                ? `✓ تم استيراد ${importResult.created} منتج بنجاح`
                : `تم استيراد ${importResult.created} منتج — ${importResult.errors.length} سطر به خطأ`}
            </span>

            <button
              onClick={() => setImportResult(null)}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          </div>

          {importResult.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs max-h-24 overflow-y-auto">
              {importResult.errors.map((e, i) => (
                <li key={i} className="flex gap-1 font-semibold" style={{ color: '#92400e' }}>
                  <span style={{ color: '#ef4444' }}>✗</span>
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={15} className="absolute top-3 right-3" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="بحث بالاسم أو الباركود..."
              className="w-full rounded-2xl pr-10 pl-3.5 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              style={fieldStyle}
            />
          </div>

          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              resetPage();
            }}
            className="rounded-2xl px-3.5 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
            style={fieldStyle}
          >
            <option value="">جميع الفئات</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {isMultiWarehouseEnabled && (
            <select
              value={warehouseFilterId}
              onChange={(e) => {
                setWarehouseFilterId(e.target.value);
                resetPage();
              }}
              className="rounded-2xl px-3.5 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 min-w-[220px]"
              style={fieldStyle}
            >
              <option value="">كل المستودعات</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>
          )}

          <div className="flex rounded-2xl p-1 gap-1" style={subtleCard}>
            {(['true', 'all', 'false'] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setActiveTab(v);
                  resetPage();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-black transition-all"
                style={
                  activeTab === v
                    ? {
                      background: 'var(--bg-card)',
                      color: '#059669',
                      border: '1px solid var(--border)',
                      boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
                    }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {v === 'true' ? 'نشط' : v === 'false' ? 'أرشيف' : 'الكل'}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setLowStock((v) => !v);
              resetPage();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-black border transition-all"
            style={
              lowStock
                ? { background: '#fef3c7', borderColor: '#fbbf24', color: '#92400e' }
                : { ...subtleCard, color: 'var(--text-secondary)' }
            }
          >
            <AlertTriangle size={13} />
            مخزون منخفض
          </button>

          {(search || categoryId || lowStock) && (
            <button
              onClick={() => {
                setSearch('');
                setCategoryId('');
                setLowStock(false);
                resetPage();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-black transition"
              style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}
            >
              <X size={12} />
              إلغاء الفلاتر
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
        {isLoading ? (
          <div className="flex items-center justify-center h-56 text-sm font-semibold" style={text.muted}>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              جاري التحميل...
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 px-4 text-center">
            <div
              className="w-14 h-14 rounded-2xl mb-3 flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
            >
              <Package size={28} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm font-black" style={text.body}>لا توجد منتجات</p>

            {canEdit && activeTab === 'true' && !search && !categoryId && (
              <button
                onClick={openCreate}
                className="mt-3 text-xs font-black"
                style={{ color: '#059669' }}
              >
                + أضف أول منتج
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr style={{ background: 'var(--bg-subtle)' }}>
                  {[
                    'الباركود',
                    'المنتج',
                    'الفئة',
                    'الوحدة',
                    'سعر المفرق',
                    'سعر الجملة',
                    isMultiWarehouseEnabled && warehouseFilterId ? 'مخزون المستودع' : 'المخزون',
                    'الحالة',
                    '',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-right px-4 py-3.5 text-xs font-black whitespace-nowrap"
                      style={text.secondary}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className="transition-colors group"
                    style={{ borderTop: '1px solid var(--border)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-subtle) 88%, transparent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={text.muted}>
                      {p.barcode ?? '—'}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.is_weighted && (
                          <span title="منتج موزون">
                            <Scale size={13} style={{ color: 'var(--text-body)' }} className="flex-shrink-0" />
                          </span>
                        )}
                        <span className="text-sm font-black leading-tight" style={text.body}>{p.name}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {p.category_name ? (
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black"
                          style={{ background: 'var(--bg-subtle)', color: 'var(--text-body)', border: '1px solid var(--border)' }}
                        >
                          {p.category_name}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold" style={text.muted}>—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs font-semibold" style={text.secondary}>
                      {p.unit}
                    </td>

                    <td className="px-4 py-3 text-sm font-black whitespace-nowrap" style={text.body}>
                      $ {fmtPrice(p.retail_price)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.wholesale_price ? (
                        <div>
                          <span className="text-sm font-black text-blue-700">$ {fmtPrice(p.wholesale_price)}</span>
                          <span className="text-[10px] font-semibold block mt-0.5" style={text.muted}>
                            من {fmtQty(p.wholesale_min_qty, p.unit)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold" style={text.muted}>—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StockBadge qty={p.stock_quantity} min={p.min_stock_level} unit={p.unit} />

                        {isMultiWarehouseEnabled && (
                          <button
                            onClick={() => openWarehouseStock(p)}
                            className="opacity-0 group-hover:opacity-100 transition-all p-1 rounded-lg"
                            style={{ color: '#059669', background: 'rgba(16, 185, 129, 0.08)' }}
                            title="عرض توزيع المستودعات"
                          >
                            <Warehouse size={12} />
                          </button>
                        )}

                        {canEdit && (
                          <button
                            onClick={() => setStockProduct(p)}
                            className="opacity-0 group-hover:opacity-100 transition-all p-1 rounded-lg"
                            style={{ color: 'var(--text-muted)' }}
                            title="تعديل المخزون"
                          >
                            <SlidersHorizontal size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                        style={{
                          background: p.is_active ? '#ecfdf5' : '#f1f5f9',
                          color: p.is_active ? '#166534' : '#94a3b8',
                        }}
                      >
                        {p.is_active ? <><Check size={10} />نشط</> : 'أرشيف'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(p)}
                            className="p-2 rounded-xl transition-colors"
                            style={{ color: '#059669', background: 'rgba(16, 185, 129, 0.08)' }}
                            title="تعديل"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}

                        {canToggleActive && (
                          <button
                            onClick={() => toggleActive.mutate(p.id)}
                            className="p-2 rounded-xl transition-colors"
                            style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}
                            title={p.is_active ? 'أرشفة' : 'تفعيل'}
                          >
                            <Power size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="rounded-3xl p-4 flex items-center justify-between gap-3 flex-wrap" style={surfaceCard}>
          <p className="text-xs font-semibold" style={text.muted}>
            صفحة {pagination.page} من {pagination.pages} ({pagination.total} منتج)
          </p>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="w-9 h-9 rounded-2xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition"
              style={{ ...subtleCard, color: 'var(--text-secondary)' }}
            >
              <ChevronRight size={15} />
            </button>

            {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
              const p =
                pagination.pages <= 5
                  ? i + 1
                  : page <= 3
                    ? i + 1
                    : page >= pagination.pages - 2
                      ? pagination.pages - 4 + i
                      : page - 2 + i;

              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="w-9 h-9 rounded-2xl text-xs font-black transition-all"
                  style={
                    p === page
                      ? { background: '#059669', color: '#fff' }
                      : { ...subtleCard, color: 'var(--text-secondary)' }
                  }
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={pagination.page >= pagination.pages}
              className="w-9 h-9 rounded-2xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition"
              style={{ ...subtleCard, color: 'var(--text-secondary)' }}
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        </div>
      )}

      {showProductModal && (
        <ProductModal
          editProduct={editProduct}
          categories={categories}
          suppliers={suppliers}
          warehouses={warehouses}
          isMultiWarehouseEnabled={isMultiWarehouseEnabled}
          onClose={closeModal}
          onSubmit={handleProductSubmit}
          onAddCategory={handleAddCategoryFromModal}
          loading={createProduct.isPending || updateProduct.isPending}
          error={modalError}
        />
      )}

      {stockProduct && (
        <StockModal
          product={stockProduct}
          warehouses={warehouses}
          isMultiWarehouseEnabled={isMultiWarehouseEnabled}
          onClose={() => setStockProduct(null)}
          onSubmit={handleAdjustStock}
          loading={adjustStock.isPending}
        />
      )}
      {warehouseStockProduct && (
        <WarehouseStockModal
          product={warehouseStockProduct}
          rows={warehouseStockRows}
          loading={warehouseStockLoading}
          error={warehouseStockError}
          onClose={() => {
            setWarehouseStockProduct(null);
            setWarehouseStockRows([]);
            setWarehouseStockError('');
          }}
        />
      )}

      {showCategories && (
        <CategoriesPanel
          categories={categories}
          onClose={() => setShowCategories(false)}
        />
      )}
    </div>
  );
}