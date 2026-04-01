import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { warehousesApi, type Warehouse, type WarehouseProduct } from '../api/warehouses.ts';
import { settingsApi } from '../api/settings.ts';
import {
  Building2,
  Check,
  Package,
  Plus,
  RefreshCw,
  Search,
  Warehouse as WarehouseIcon,
  X,
  Pencil,
  Boxes,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';
import { stockCountsApi, type StockCountSession } from '../api/stockCounts.ts';

type FormState = {
  name: string;
  code: string;
  is_active: boolean;
};

type StockFilter = 'all' | 'with_stock' | 'zero_stock' | 'low_stock';
type SortBy = 'name_asc' | 'qty_desc' | 'qty_asc' | 'barcode_asc';

const emptyForm: FormState = {
  name: '',
  code: '',
  is_active: true,
};

function fmtQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value || 0);
}

function WarehouseFormModal({
  title,
  submitLabel,
  initialValues,
  loading,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initialValues: FormState;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initialValues);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError('اسم المستودع مطلوب');
      return;
    }

    setError('');
    onSubmit({
      name: form.name.trim(),
      code: form.code.trim(),
      is_active: form.is_active,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      dir="rtl"
    >
      <div
        className="w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
              {title}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              تعديل بسيط وآمن على بيانات المستودع
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition"
            style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              اسم المستودع
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              className="w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
              placeholder="مثال: المستودع الرئيسي"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              الرمز المختصر
            </label>
            <input
              value={form.code}
              onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
              className="w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
              placeholder="مثال: MAIN أو WH2"
              dir="ltr"
            />
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              اختياري، لكن يفضّل أن يكون مختصرًا وواضحًا
            </div>
          </div>

          <label
            className="flex items-center justify-between rounded-2xl px-4 py-3 border cursor-pointer"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                المستودع نشط
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                يمكن استخدامه لاحقًا في التحويلات وعرض الأرصدة
              </div>
            </div>

            <div
              onClick={() => setForm((v) => ({ ...v, is_active: !v.is_active }))}
              className="w-11 h-6 rounded-full transition-colors flex items-center flex-shrink-0"
              style={{
                background: form.is_active ? 'var(--primary)' : 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                className="w-5 h-5 bg-white rounded-full shadow-md transition-transform mx-0.5"
                style={{ transform: form.is_active ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </div>
          </label>

          {error && (
            <div
              className="rounded-2xl px-3 py-2 text-xs font-bold"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl text-sm font-black"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              {loading ? 'جارٍ الحفظ...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WarehouseProductsModal({
  warehouse,
  onClose,
}: {
  warehouse: Warehouse;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('name_asc');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['warehouse-products', warehouse.id],
    queryFn: () => warehousesApi.getProducts(warehouse.id).then((r) => r.data.products),
    staleTime: 0,
  });

  const products = data ?? [];

  const stats = useMemo(() => {
    return {
      total: products.length,
      withStock: products.filter((p) => Number(p.warehouse_quantity) > 0).length,
      zeroStock: products.filter((p) => Number(p.warehouse_quantity) <= 0).length,
      lowStock: products.filter(
        (p) =>
          Number(p.warehouse_quantity) > 0 &&
          Number(p.min_stock_level || 0) > 0 &&
          Number(p.warehouse_quantity) <= Number(p.min_stock_level || 0)
      ).length,
      totalQty: products.reduce((sum, p) => sum + Number(p.warehouse_quantity || 0), 0),
    };
  }, [products]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    const result = products.filter((product) => {
      const warehouseQty = Number(product.warehouse_quantity || 0);
      const minStock = Number(product.min_stock_level || 0);

      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        String(product.barcode || '').toLowerCase().includes(term);

      const matchesStock =
        stockFilter === 'all'
          ? true
          : stockFilter === 'with_stock'
            ? warehouseQty > 0
            : stockFilter === 'zero_stock'
              ? warehouseQty <= 0
              : warehouseQty > 0 && minStock > 0 && warehouseQty <= minStock;

      return matchesSearch && matchesStock;
    });

    result.sort((a, b) => {
      if (sortBy === 'qty_desc') {
        return Number(b.warehouse_quantity || 0) - Number(a.warehouse_quantity || 0);
      }

      if (sortBy === 'qty_asc') {
        return Number(a.warehouse_quantity || 0) - Number(b.warehouse_quantity || 0);
      }

      if (sortBy === 'barcode_asc') {
        return String(a.barcode || '').localeCompare(String(b.barcode || ''), 'en');
      }

      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

    return result;
  }, [products, q, stockFilter, sortBy]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      dir="rtl"
    >
      <div
        className="w-full max-w-6xl h-[90vh] max-h-[860px] rounded-3xl border shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-start justify-between gap-4 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
              >
                <WarehouseIcon size={18} />
              </div>

              <div className="min-w-0">
                <div className="text-lg font-black truncate" style={{ color: 'var(--text-heading)' }}>
                  منتجات مستودع {warehouse.name}
                </div>
                <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                  <span>يمكنك معرفة كل منتج موجود داخل هذا المستودع</span>
                  <span
                    className="inline-flex px-2 py-0.5 rounded-xl border text-[11px] font-black"
                    style={{
                      background: 'var(--bg-subtle)',
                      color: 'var(--text-secondary)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {warehouse.code || 'بدون رمز'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 md:p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                إجمالي الأصناف
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {stats.total}
              </div>
            </div>

            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                أصناف فيها رصيد
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {stats.withStock}
              </div>
            </div>

            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                منخفضة المخزون
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {stats.lowStock}
              </div>
            </div>

            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                مجموع الكمية داخل المستودع
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {fmtQty(stats.totalQty)}
              </div>
            </div>
          </div>

          <div
            className="rounded-3xl border p-4 mt-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <SlidersHorizontal size={16} style={{ color: 'var(--text-secondary)' }} />
              <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                فلاتر ذكية
              </div>
              {isFetching && (
                <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  جاري التحديث...
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute top-1/2 -translate-y-1/2 right-3"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث باسم المنتج أو الباركود..."
                  className="w-full rounded-2xl pr-10 pl-3 py-3 text-sm outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-heading)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>

              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as StockFilter)}
                className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-heading)',
                  border: '1px solid var(--border)',
                }}
              >
                <option value="all">كل المنتجات</option>
                <option value="with_stock">التي فيها رصيد</option>
                <option value="zero_stock">رصيدها صفر</option>
                <option value="low_stock">منخفضة المخزون</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-heading)',
                  border: '1px solid var(--border)',
                }}
              >
                <option value="name_asc">الترتيب: الاسم</option>
                <option value="qty_desc">الترتيب: الأعلى كمية</option>
                <option value="qty_asc">الترتيب: الأقل كمية</option>
                <option value="barcode_asc">الترتيب: الباركود</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-10 text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
              جاري تحميل منتجات المستودع...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
                لا توجد منتجات مطابقة
              </div>
              <div className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                غيّر البحث أو الفلاتر لعرض نتائج أخرى
              </div>
            </div>
          ) : (
            <>
              <div
                className="grid grid-cols-12 gap-3 px-4 py-3 border-b text-xs font-black sticky top-0 z-10"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-subtle)',
                }}
              >
                <div className="col-span-12 md:col-span-4">المنتج</div>
                <div className="col-span-6 md:col-span-2">الباركود</div>
                <div className="col-span-6 md:col-span-2">الوحدة</div>
                <div className="col-span-6 md:col-span-2">الكمية هنا</div>
                <div className="col-span-6 md:col-span-2">المخزون العام</div>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filtered.map((product: WarehouseProduct) => {
                  const warehouseQty = Number(product.warehouse_quantity || 0);
                  const minStock = Number(product.min_stock_level || 0);
                  const isLowStock =
                    warehouseQty > 0 && minStock > 0 && warehouseQty <= minStock;

                  return (
                    <div
                      key={product.id}
                      className="grid grid-cols-12 gap-3 px-4 py-4 items-center"
                    >
                      <div className="col-span-12 md:col-span-4 min-w-0">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
                          >
                            <Package size={18} />
                          </div>

                          <div className="min-w-0">
                            <div className="text-sm font-black truncate" style={{ color: 'var(--text-heading)' }}>
                              {product.name}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                #{product.id}
                              </span>

                              {isLowStock && (
                                <span
                                  className="inline-flex px-2 py-0.5 rounded-xl border text-[11px] font-black"
                                  style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--primary)',
                                    borderColor: 'var(--border)',
                                  }}
                                >
                                  منخفض داخل المستودع
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <span
                          className="inline-flex px-2.5 py-1 rounded-xl text-xs font-black"
                          style={{
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {product.barcode || '—'}
                        </span>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                          {product.unit || '—'}
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                          {fmtQty(warehouseQty)}
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                          {fmtQty(Number(product.total_stock_quantity || 0))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
            النتائج المعروضة: {filtered.length}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl text-sm font-black"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-heading)',
              border: '1px solid var(--border)',
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

function WarehouseStockCountModal({
  warehouse,
  onClose,
}: {
  warehouse: Warehouse;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [session, setSession] = useState<StockCountSession | null>(null);
  const [draftCounts, setDraftCounts] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingProductId, setSavingProductId] = useState<number | null>(null);
  const [removingProductId, setRemovingProductId] = useState<number | null>(null);
  const [showDraftsList, setShowDraftsList] = useState(false);
  const [loadingDraftId, setLoadingDraftId] = useState<number | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['warehouse-products', warehouse.id],
    queryFn: () => warehousesApi.getProducts(warehouse.id).then((r) => r.data.products),
    staleTime: 0,
  });

  const { data: draftSessionsData, isFetching: draftsFetching } = useQuery({
    queryKey: ['stock-count-draft-sessions', warehouse.id],
    queryFn: async () => {
      const res = await stockCountsApi.getAll('draft');
      return (res.data.sessions ?? []).filter((s) => s.warehouse_id === warehouse.id);
    },
    staleTime: 0,
  });

  const products = data ?? [];
  const draftSessions = draftSessionsData ?? [];

  const handleLoadDraftSession = async (draftId: number) => {
    setLoadingDraftId(draftId);

    try {
      const res = await stockCountsApi.getById(draftId);
      setSession(res.data.session);
      setShowDraftsList(false);
      setNotice({ type: 'success', message: 'تم تحميل مسودة الجرد بنجاح' });
      setTimeout(() => setNotice(null), 2500);
    } catch (error: any) {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر تحميل مسودة الجرد',
      });
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setLoadingDraftId(null);
    }
  };

  const sessionItemsMap = useMemo(() => {
    return new Map((session?.items ?? []).map((item) => [item.product_id, item]));
  }, [session]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return products.filter((product) => {
      return (
        !term ||
        product.name.toLowerCase().includes(term) ||
        String(product.barcode || '').toLowerCase().includes(term)
      );
    });
  }, [products, q]);

  const sessionStats = useMemo(() => {
    const items = session?.items ?? [];

    return {
      itemsCount: items.length,
      positiveDiff: items
        .filter((item) => Number(item.difference_quantity) > 0)
        .reduce((sum, item) => sum + Number(item.difference_quantity || 0), 0),
      negativeDiff: items
        .filter((item) => Number(item.difference_quantity) < 0)
        .reduce((sum, item) => sum + Math.abs(Number(item.difference_quantity || 0)), 0),
    };
  }, [session]);

  const createSessionMutation = useMutation({
    mutationFn: () =>
      stockCountsApi.create({
        warehouse_id: warehouse.id,
        notes: `جلسة جرد من صفحة المستودعات - ${warehouse.name}`,
      }),
    onSuccess: (res) => {
      setSession(res.data.session);
      qc.invalidateQueries({ queryKey: ['stock-count-draft-sessions', warehouse.id] });
      setNotice({ type: 'success', message: 'تم فتح جلسة الجرد بنجاح' });
      setTimeout(() => setNotice(null), 2500);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر فتح جلسة الجرد',
      });
      setTimeout(() => setNotice(null), 4000);
    },
  });

  const upsertItemMutation = useMutation({
    mutationFn: (payload: { sessionId: number; product_id: number; counted_quantity: number }) =>
      stockCountsApi.upsertItem(payload.sessionId, {
        product_id: payload.product_id,
        counted_quantity: payload.counted_quantity,
      }),
    onSuccess: (res) => {
      setSession(res.data.session);
      qc.invalidateQueries({ queryKey: ['warehouse-products', warehouse.id] });
      setNotice({ type: 'success', message: 'تم حفظ البند داخل جلسة الجرد' });
      setTimeout(() => setNotice(null), 2000);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر حفظ بند الجرد',
      });
      setTimeout(() => setNotice(null), 4000);
    },
    onSettled: () => {
      setSavingProductId(null);
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (payload: { sessionId: number; productId: number }) =>
      stockCountsApi.removeItem(payload.sessionId, payload.productId),
    onSuccess: (res, variables) => {
      setSession(res.data.session);
      setDraftCounts((prev) => {
        const next = { ...prev };
        delete next[variables.productId];
        return next;
      });
      setNotice({ type: 'success', message: 'تم حذف البند من جلسة الجرد' });
      setTimeout(() => setNotice(null), 2000);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر حذف بند الجرد',
      });
      setTimeout(() => setNotice(null), 4000);
    },
    onSettled: () => {
      setRemovingProductId(null);
    },
  });

  const postSessionMutation = useMutation({
    mutationFn: (sessionId: number) => stockCountsApi.post(sessionId),
    onSuccess: (res) => {
      setSession(res.data.session);
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      qc.invalidateQueries({ queryKey: ['warehouse-products', warehouse.id] });
      qc.invalidateQueries({ queryKey: ['stock-count-draft-sessions', warehouse.id] });
      setNotice({ type: 'success', message: 'تم اعتماد الجرد بنجاح' });
      setTimeout(() => setNotice(null), 3000);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر اعتماد الجرد',
      });
      setTimeout(() => setNotice(null), 5000);
    },
  });

  const isPosted = session?.status === 'posted';

  const handleSaveItem = (product: WarehouseProduct, counted?: number) => {
    if (!session?.id) {
      setNotice({ type: 'error', message: 'ابدأ جلسة الجرد أولًا' });
      setTimeout(() => setNotice(null), 2500);
      return;
    }

    const rawValue =
      counted !== undefined
        ? String(counted)
        : String(draftCounts[product.id] ?? '').trim();

    if (rawValue === '') {
      setNotice({ type: 'error', message: 'أدخل الكمية المعدودة أولًا' });
      setTimeout(() => setNotice(null), 2500);
      return;
    }

    const parsed = Number(rawValue);

    if (Number.isNaN(parsed) || parsed < 0) {
      setNotice({ type: 'error', message: 'الكمية المعدودة يجب أن تكون صفرًا أو أكبر' });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    setSavingProductId(product.id);
    upsertItemMutation.mutate({
      sessionId: session.id,
      product_id: product.id,
      counted_quantity: parsed,
    });
  };

  const handleSetMatched = (product: WarehouseProduct) => {
    const systemQty = Number(
      sessionItemsMap.get(product.id)?.system_quantity ?? product.warehouse_quantity ?? 0
    );

    setDraftCounts((prev) => ({
      ...prev,
      [product.id]: String(systemQty),
    }));

    handleSaveItem(product, systemQty);
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      dir="rtl"
    >
      <div
        className="w-full max-w-7xl h-[92vh] max-h-[900px] rounded-3xl border shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-start justify-between gap-4 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
              >
                <Boxes size={18} />
              </div>

              <div className="min-w-0">
                <div className="text-lg font-black truncate" style={{ color: 'var(--text-heading)' }}>
                  الجرد الذكي — {warehouse.name}
                </div>
                <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                  <span>جلسة جرد رسمية لهذا المستودع فقط</span>
                  <span
                    className="inline-flex px-2 py-0.5 rounded-xl border text-[11px] font-black"
                    style={{
                      background: 'var(--bg-subtle)',
                      color: 'var(--text-secondary)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {warehouse.code || 'بدون رمز'}
                  </span>

                  {session && (
                    <span
                      className="inline-flex px-2 py-0.5 rounded-xl border text-[11px] font-black"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: session.status === 'posted' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      {session.session_number} — {session.status === 'posted' ? 'معتمدة' : 'مسودة'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 md:p-5 border-b space-y-4" style={{ borderColor: 'var(--border)' }}>
          {notice && (
            <div
              className="rounded-2xl px-4 py-3 text-sm font-bold"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            >
              {notice.message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                منتجات المستودع
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {products.length}
              </div>
            </div>

            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                البنود المحفوظة في الجلسة
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {sessionStats.itemsCount}
              </div>
            </div>

            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                فرق موجب
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {fmtQty(sessionStats.positiveDiff)}
              </div>
            </div>

            <div
              className="rounded-3xl border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                فرق سالب
              </div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--text-heading)' }}>
                {fmtQty(sessionStats.negativeDiff)}
              </div>
            </div>
          </div>

          <div
            className="rounded-3xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search
                  size={16}
                  className="absolute top-1/2 -translate-y-1/2 right-3"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث باسم المنتج أو الباركود..."
                  className="w-full rounded-2xl pr-10 pl-3 py-3 text-sm outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-heading)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ['warehouse-products', warehouse.id] });
                    qc.invalidateQueries({ queryKey: ['stock-count-draft-sessions', warehouse.id] });
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black"
                  style={{
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-heading)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <RefreshCw size={15} className={isFetching || draftsFetching ? 'animate-spin' : ''} />
                  تحديث
                </button>

                {draftSessions.length > 0 && (
                  <button
                    onClick={() => setShowDraftsList((v) => !v)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black"
                    style={{
                      background: 'var(--bg-subtle)',
                      color: 'var(--text-heading)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Boxes size={15} />
                    المسودات ({draftSessions.length})
                  </button>
                )}

                {!session && (
                  <button
                    onClick={() => createSessionMutation.mutate()}
                    disabled={createSessionMutation.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                    style={{ background: 'var(--primary)' }}
                  >
                    <Plus size={15} />
                    {createSessionMutation.isPending ? 'جارٍ فتح الجلسة...' : 'بدء جلسة جرد'}
                  </button>
                )}

                {session && (
                  <button
                    onClick={() => postSessionMutation.mutate(session.id)}
                    disabled={
                      isPosted ||
                      postSessionMutation.isPending ||
                      upsertItemMutation.isPending ||
                      removeItemMutation.isPending ||
                      sessionStats.itemsCount === 0
                    }
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                    style={{ background: 'var(--primary)' }}
                  >
                    <Check size={15} />
                    {postSessionMutation.isPending ? 'جارٍ اعتماد الجرد...' : 'اعتماد الجرد'}
                  </button>
                )}
              </div>
            </div>

            <div className="text-[11px] mt-3 leading-6" style={{ color: 'var(--text-muted)' }}>
              ملاحظة: عند اعتماد الجلسة سيتم تسجيل فروقات الجرد فقط عبر حركات مخزون رسمية،
              وإذا تغيّر رصيد أي منتج بعد بدء الجلسة فسيتم رفض الاعتماد لحماية الاتساق.
            </div>

            {showDraftsList && draftSessions.length > 0 && (
              <div
                className="rounded-3xl border p-3 mt-3"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="text-sm font-black mb-3" style={{ color: 'var(--text-heading)' }}>
                  مسودات الجرد لهذا المستودع
                </div>

                <div className="space-y-2">
                  {draftSessions.map((draft) => (
                    <div
                      key={draft.id}
                      className="rounded-2xl border px-3 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                      style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                          {draft.session_number}
                        </div>
                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          البنود: {draft.items_count} — الفرق الإجمالي: {fmtQty(draft.total_difference_quantity)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleLoadDraftSession(draft.id)}
                        disabled={loadingDraftId === draft.id}
                        className="px-4 py-2.5 rounded-2xl text-sm font-black disabled:opacity-60"
                        style={{
                          background: 'var(--bg-card)',
                          color: 'var(--text-heading)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {loadingDraftId === draft.id ? 'جارٍ التحميل...' : 'فتح المسودة'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-10 text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
              جاري تحميل منتجات المستودع...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
                لا توجد منتجات مطابقة
              </div>
              <div className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                غيّر البحث لعرض نتائج أخرى
              </div>
            </div>
          ) : (
            <>
              <div
                className="grid grid-cols-12 gap-3 px-4 py-3 border-b text-xs font-black sticky top-0 z-10"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-subtle)',
                }}
              >
                <div className="col-span-12 lg:col-span-3">المنتج</div>
                <div className="col-span-6 lg:col-span-2">المسجل</div>
                <div className="col-span-6 lg:col-span-2">المعدود</div>
                <div className="col-span-6 lg:col-span-2">الفرق</div>
                <div className="col-span-12 lg:col-span-3 text-left">إجراء</div>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filtered.map((product) => {
                  const sessionItem = sessionItemsMap.get(product.id);
                  const systemQty = Number(
                    sessionItem?.system_quantity ?? product.warehouse_quantity ?? 0
                  );
                  const countedValue =
                    draftCounts[product.id] !== undefined
                      ? draftCounts[product.id]
                      : sessionItem
                        ? String(sessionItem.counted_quantity)
                        : '';
                  const difference = sessionItem ? Number(sessionItem.difference_quantity || 0) : null;

                  return (
                    <div
                      key={product.id}
                      className="grid grid-cols-12 gap-3 px-4 py-4 items-center"
                    >
                      <div className="col-span-12 lg:col-span-3 min-w-0">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
                          >
                            <Package size={18} />
                          </div>

                          <div className="min-w-0">
                            <div className="text-sm font-black truncate" style={{ color: 'var(--text-heading)' }}>
                              {product.name}
                            </div>
                            <div className="text-[11px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                              <span>#{product.id}</span>
                              <span>{product.barcode || 'بدون باركود'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-6 lg:col-span-2">
                        <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                          {fmtQty(systemQty)}
                        </div>
                      </div>

                      <div className="col-span-6 lg:col-span-2">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          disabled={!session || isPosted}
                          value={countedValue}
                          onChange={(e) =>
                            setDraftCounts((prev) => ({
                              ...prev,
                              [product.id]: e.target.value,
                            }))
                          }
                          placeholder={fmtQty(systemQty)}
                          className="w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
                          style={{
                            background: !session || isPosted ? 'var(--bg-subtle)' : 'var(--bg-card)',
                            color: 'var(--text-heading)',
                            border: '1px solid var(--border)',
                          }}
                        />
                      </div>

                      <div className="col-span-6 lg:col-span-2">
                        <div
                          className="text-sm font-black"
                          style={{
                            color:
                              difference == null
                                ? 'var(--text-muted)'
                                : difference === 0
                                  ? 'var(--text-secondary)'
                                  : 'var(--text-heading)',
                          }}
                        >
                          {difference == null ? '—' : fmtQty(difference)}
                        </div>
                      </div>

                      <div className="col-span-12 lg:col-span-3">
                        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                          <button
                            onClick={() => handleSetMatched(product)}
                            disabled={!session || isPosted || savingProductId === product.id}
                            className="px-3 py-2 rounded-2xl text-xs font-black disabled:opacity-60"
                            style={{
                              background: 'var(--bg-subtle)',
                              color: 'var(--text-heading)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            مطابق
                          </button>

                          <button
                            onClick={() => handleSaveItem(product)}
                            disabled={!session || isPosted || savingProductId === product.id}
                            className="px-3 py-2 rounded-2xl text-xs font-black disabled:opacity-60"
                            style={{
                              background: 'var(--bg-subtle)',
                              color: 'var(--text-heading)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {savingProductId === product.id ? 'جارٍ الحفظ...' : 'حفظ'}
                          </button>

                          {sessionItem && (
                            <button
                              onClick={() => {
                                if (!session?.id) return;
                                setRemovingProductId(product.id);
                                removeItemMutation.mutate({
                                  sessionId: session.id,
                                  productId: product.id,
                                });
                              }}
                              disabled={isPosted || removingProductId === product.id}
                              className="px-3 py-2 rounded-2xl text-xs font-black disabled:opacity-60"
                              style={{
                                background: 'var(--bg-subtle)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {removingProductId === product.id ? 'جارٍ الحذف...' : 'حذف'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
            النتائج المعروضة: {filtered.length}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl text-sm font-black"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-heading)',
              border: '1px solid var(--border)',
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WarehousesPage() {
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [productsWarehouse, setProductsWarehouse] = useState<Warehouse | null>(null);
  const [stockCountWarehouse, setStockCountWarehouse] = useState<Warehouse | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });

  const isMultiWarehouseEnabled = settings?.enable_multi_warehouse === 'true';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.getAll(false).then((r) => r.data.warehouses),
    staleTime: 0,
    enabled: isMultiWarehouseEnabled,
  });

  const warehouses = data ?? [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return warehouses.filter((w) => {
      const matchesStatus = showInactive ? true : w.is_active;
      const matchesSearch =
        !term ||
        w.name.toLowerCase().includes(term) ||
        String(w.code || '').toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [warehouses, q, showInactive]);

  const stats = useMemo(() => {
    return {
      total: warehouses.length,
      active: warehouses.filter((w) => w.is_active).length,
      inactive: warehouses.filter((w) => !w.is_active).length,
      totalProducts: warehouses.reduce((sum, w) => sum + Number(w.products_count || 0), 0),
      totalQty: warehouses.reduce((sum, w) => sum + Number(w.total_quantity || 0), 0),
    };
  }, [warehouses]);

  const createMutation = useMutation({
    mutationFn: (payload: FormState) =>
      warehousesApi.create({
        name: payload.name,
        code: payload.code || null,
        is_active: payload.is_active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setCreateOpen(false);
      setNotice({ type: 'success', message: 'تم إنشاء المستودع بنجاح' });
      setTimeout(() => setNotice(null), 3000);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر إنشاء المستودع',
      });
      setTimeout(() => setNotice(null), 4000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: FormState }) =>
      warehousesApi.update(id, {
        name: values.name,
        code: values.code || null,
        is_active: values.is_active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setEditingWarehouse(null);
      setNotice({ type: 'success', message: 'تم تعديل المستودع بنجاح' });
      setTimeout(() => setNotice(null), 3000);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر تعديل المستودع',
      });
      setTimeout(() => setNotice(null), 4000);
    },
  });

  if (settingsLoading) {
    return (
      <div className="space-y-5" dir="rtl">
        <div
          className="rounded-3xl border p-6 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
            جاري تحميل إعدادات الصفحة...
          </div>
        </div>
      </div>
    );
  }

  if (!isMultiWarehouseEnabled) {
    return (
      <div className="space-y-5" dir="rtl">
        <div
          className="rounded-3xl border p-5 md:p-6"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <WarehouseIcon size={22} />
            </div>

            <div>
              <div className="text-xl font-black" style={{ color: 'var(--text-heading)' }}>
                إدارة المستودعات
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                هذه الصفحة تعمل فقط عند تفعيل نظام المستودعات المتعددة
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl border p-8 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div
            className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
          >
            <AlertTriangle size={28} />
          </div>

          <div className="text-lg font-black" style={{ color: 'var(--text-heading)' }}>
            ميزة إدارة المستودعات المتعددة معطلة حاليًا
          </div>

          <div className="text-sm mt-2 max-w-xl mx-auto leading-7" style={{ color: 'var(--text-muted)' }}>
            فعّل خيار المستودعات المتعددة من صفحة الإعدادات حتى تتمكن من إدارة المستودعات وتوزيع الأرصدة بينها.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div
        className="rounded-3xl border p-5 md:p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
              >
                <WarehouseIcon size={22} />
              </div>

              <div>
                <div className="text-xl font-black" style={{ color: 'var(--text-heading)' }}>
                  إدارة المستودعات
                </div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  إدارة المستودعات وعرض أرصدتها ومنتجاتها ضمن نظام المستودعات المتعددة
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black text-white"
            style={{ background: 'var(--primary)' }}
          >
            <Plus size={16} />
            إضافة مستودع
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="rounded-2xl px-4 py-3 text-sm font-bold"
          style={{
            background: 'var(--bg-subtle)',
            color: 'var(--text-heading)',
            border: '1px solid var(--border)',
          }}
        >
          {notice.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div
          className="rounded-3xl border p-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <Building2 size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                إجمالي المستودعات
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>
                {stats.total}
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl border p-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <Check size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                المستودعات النشطة
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>
                {stats.active}
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl border p-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
            >
              <Boxes size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                المستودعات المعطلة
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>
                {stats.inactive}
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl border p-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <Package size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                مجموع المنتجات المربوطة
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>
                {stats.totalProducts}
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl border p-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <WarehouseIcon size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                مجموع الأرصدة الموزعة
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>
                {fmtQty(stats.totalQty)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-3xl border p-4 md:p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search
              size={16}
              className="absolute top-1/2 -translate-y-1/2 right-3"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم المستودع أو رمزه..."
              className="w-full rounded-2xl pr-10 pl-3 py-3 text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label
              className="flex items-center gap-2 rounded-2xl px-3 py-2.5 border cursor-pointer"
              style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
            >
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                إظهار المعطّل
              </span>
            </label>

            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['warehouses'] })}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            >
              <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
              تحديث
            </button>
          </div>
        </div>
      </div>

      <div
        className="rounded-3xl border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="grid grid-cols-12 gap-3 px-4 py-3 border-b text-xs font-black"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}
        >
          <div className="col-span-4 md:col-span-3">المستودع</div>
          <div className="col-span-2 md:col-span-2">الرمز</div>
          <div className="hidden md:block md:col-span-2">الحالة</div>
          <div className="col-span-3 md:col-span-1">عدد المنتجات</div>
          <div className="col-span-3 md:col-span-2">إجمالي الرصيد</div>
          <div className="hidden md:block md:col-span-2 text-left">إجراء</div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل المستودعات...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
              لا توجد مستودعات مطابقة
            </div>
            <div className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
              يمكنك إضافة أول مستودع جديد أو تعديل البحث
            </div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map((warehouse) => (
              <div
                key={warehouse.id}
                className="grid grid-cols-12 gap-3 px-4 py-4 items-center"
              >
                <div className="col-span-4 md:col-span-3 min-w-0">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
                    >
                      <WarehouseIcon size={18} />
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-black truncate" style={{ color: 'var(--text-heading)' }}>
                        {warehouse.name}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        #{warehouse.id}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 md:col-span-2">
                  <span
                    className="inline-flex px-2.5 py-1 rounded-xl text-xs font-black"
                    style={{
                      background: 'var(--bg-subtle)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {warehouse.code || '—'}
                  </span>
                </div>

                <div className="hidden md:block md:col-span-2">
                  <span
                    className="inline-flex px-2.5 py-1 rounded-xl text-xs font-black"
                    style={{
                      background: 'var(--bg-subtle)',
                      color: warehouse.is_active ? 'var(--primary)' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {warehouse.is_active ? 'نشط' : 'معطّل'}
                  </span>
                </div>

                <div className="col-span-3 md:col-span-1">
                  <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                    {warehouse.products_count}
                  </div>
                </div>

                <div className="col-span-3 md:col-span-2">
                  <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                    {fmtQty(warehouse.total_quantity)}
                  </div>
                </div>

                <div className="hidden md:flex md:col-span-2 justify-end">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStockCountWarehouse(warehouse)}
                      className="px-3 h-10 rounded-2xl flex items-center gap-2"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                      title="الجرد الذكي"
                    >
                      <Check size={15} />
                      <span className="text-xs font-black">الجرد</span>
                    </button>

                    <button
                      onClick={() => setProductsWarehouse(warehouse)}
                      className="px-3 h-10 rounded-2xl flex items-center gap-2"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                      title="عرض المنتجات"
                    >
                      <Boxes size={15} />
                      <span className="text-xs font-black">المنتجات</span>
                    </button>

                    <button
                      onClick={() => setEditingWarehouse(warehouse)}
                      className="w-10 h-10 rounded-2xl flex items-center justify-center"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }}
                      title="تعديل"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>

                <div className="col-span-12 md:hidden">
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <button
                      onClick={() => setStockCountWarehouse(warehouse)}
                      className="w-full py-2.5 rounded-2xl text-sm font-black"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      الجرد
                    </button>

                    <button
                      onClick={() => setProductsWarehouse(warehouse)}
                      className="w-full py-2.5 rounded-2xl text-sm font-black"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      المنتجات
                    </button>

                    <button
                      onClick={() => setEditingWarehouse(warehouse)}
                      className="w-full py-2.5 rounded-2xl text-sm font-black"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      تعديل
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <WarehouseFormModal
          title="إضافة مستودع جديد"
          submitLabel="إنشاء المستودع"
          initialValues={emptyForm}
          loading={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      )}

      {editingWarehouse && (
        <WarehouseFormModal
          title="تعديل بيانات المستودع"
          submitLabel="حفظ التعديلات"
          initialValues={{
            name: editingWarehouse.name,
            code: editingWarehouse.code || '',
            is_active: editingWarehouse.is_active,
          }}
          loading={updateMutation.isPending}
          onClose={() => setEditingWarehouse(null)}
          onSubmit={(values) =>
            updateMutation.mutate({
              id: editingWarehouse.id,
              values,
            })
          }
        />
      )}

      {productsWarehouse && (
        <WarehouseProductsModal
          warehouse={productsWarehouse}
          onClose={() => setProductsWarehouse(null)}
        />
      )}

      {stockCountWarehouse && (
        <WarehouseStockCountModal
          warehouse={stockCountWarehouse}
          onClose={() => setStockCountWarehouse(null)}
        />
      )}
    </div>
  );
}