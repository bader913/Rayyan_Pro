import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../api/settings.ts';
import { warehousesApi, type Warehouse, type WarehouseProduct } from '../api/warehouses.ts';
import { stockTransfersApi, type StockTransfer } from '../api/stockTransfers.ts';
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Building2,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';

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

type WarehouseSort =
  | 'smart_desc'
  | 'qty_desc'
  | 'low_stock_desc'
  | 'activity_desc'
  | 'name_asc';

type ProductFilter = 'all' | 'with_stock' | 'zero_stock' | 'low_stock';

type WarehouseMetrics = {
  warehouse: Warehouse;
  products: WarehouseProduct[];
  withStockCount: number;
  zeroStockCount: number;
  lowStockCount: number;
  totalQty: number;
  totalProducts: number;
  pendingOutgoing: number;
  pendingIncoming: number;
  allOutgoing: number;
  allIncoming: number;
  relatedTransfersCount: number;
  pressureScore: number;
  healthLabel: string;
  topLowStockProducts: WarehouseProduct[];
  topQtyProducts: WarehouseProduct[];
};

function fmtQty(value: number | string) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function statusPillStyle(active = false): React.CSSProperties {
  return {
    background: 'var(--bg-subtle)',
    color: active ? 'var(--primary)' : 'var(--text-secondary)',
    border: '1px solid var(--border)',
  };
}

function buildHealthLabel(metrics: {
  totalQty: number;
  lowStockCount: number;
  zeroStockCount: number;
  pendingIncoming: number;
  pendingOutgoing: number;
}) {
  if (metrics.totalQty <= 0) return 'شبه فارغ';
  if (metrics.lowStockCount > 0) return 'يحتاج متابعة';
  if (metrics.pendingIncoming + metrics.pendingOutgoing > 0) return 'نشط';
  if (metrics.zeroStockCount > 0) return 'مستقر مع أصناف صفرية';
  return 'مستقر';
}

function WarehouseProductsDetailsModal({
  warehouse,
  products,
  onClose,
}: {
  warehouse: Warehouse;
  products: WarehouseProduct[];
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [stockFilter, setStockFilter] = useState<ProductFilter>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'qty_desc' | 'qty_asc' | 'barcode_asc'>('name_asc');

  const stats = useMemo(() => {
    return {
      total: products.length,
      withStock: products.filter((p) => Number(p.warehouse_quantity || 0) > 0).length,
      zeroStock: products.filter((p) => Number(p.warehouse_quantity || 0) <= 0).length,
      lowStock: products.filter((p) => {
        const qty = Number(p.warehouse_quantity || 0);
        const min = Number(p.min_stock_level || 0);
        return qty > 0 && min > 0 && qty <= min;
      }).length,
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
        className="w-full max-w-6xl h-[90vh] max-h-[860px] rounded-3xl overflow-hidden flex flex-col"
        style={surfaceCard}
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
                <div className="text-lg font-black truncate" style={text.heading}>
                  تفاصيل مستودع {warehouse.name}
                </div>
                <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={text.muted}>
                  <span>عرض كامل للمنتجات الموجودة داخل هذا المستودع</span>
                  <span
                    className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-black"
                    style={statusPillStyle()}
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
            style={subtleCard}
          >
            <X size={18} style={text.secondary} />
          </button>
        </div>

        <div className="p-4 md:p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MiniStatCard title="إجمالي الأصناف" value={stats.total} icon={<Boxes size={18} />} />
            <MiniStatCard title="أصناف فيها رصيد" value={stats.withStock} icon={<Package size={18} />} />
            <MiniStatCard title="منخفضة المخزون" value={stats.lowStock} icon={<AlertTriangle size={18} />} />
            <MiniStatCard title="مجموع الكمية" value={fmtQty(stats.totalQty)} icon={<WarehouseIcon size={18} />} />
          </div>

          <div className="rounded-3xl p-4 mt-4" style={surfaceCard}>
            <div className="flex items-center gap-2 mb-3">
              <SlidersHorizontal size={16} style={text.secondary} />
              <div className="text-sm font-black" style={text.heading}>
                فلاتر ذكية
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute top-1/2 -translate-y-1/2 right-3"
                  style={text.muted}
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث باسم المنتج أو الباركود..."
                  className="w-full rounded-2xl pr-10 pl-3 py-3 text-sm outline-none"
                  style={subtleCard}
                />
              </div>

              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as ProductFilter)}
                className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                style={subtleCard}
              >
                <option value="all">كل المنتجات</option>
                <option value="with_stock">التي فيها رصيد</option>
                <option value="zero_stock">رصيدها صفر</option>
                <option value="low_stock">منخفضة المخزون</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name_asc' | 'qty_desc' | 'qty_asc' | 'barcode_asc')}
                className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                style={subtleCard}
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
          {filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-base font-black" style={text.heading}>
                لا توجد منتجات مطابقة
              </div>
              <div className="text-sm mt-2" style={text.muted}>
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
                {filtered.map((product) => {
                  const warehouseQty = Number(product.warehouse_quantity || 0);
                  const minStock = Number(product.min_stock_level || 0);
                  const isLowStock = warehouseQty > 0 && minStock > 0 && warehouseQty <= minStock;

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
                            <div className="text-sm font-black truncate" style={text.heading}>
                              {product.name}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <span className="text-[11px]" style={text.muted}>
                                #{product.id}
                              </span>

                              {isLowStock && (
                                <span
                                  className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-black"
                                  style={statusPillStyle(true)}
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
                          style={statusPillStyle()}
                        >
                          {product.barcode || '—'}
                        </span>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <div className="text-sm font-black" style={text.heading}>
                          {product.unit || '—'}
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <div className="text-sm font-black" style={text.heading}>
                          {fmtQty(warehouseQty)}
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <div className="text-sm font-black" style={text.heading}>
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
          <div className="text-xs font-bold" style={text.muted}>
            النتائج المعروضة: {filtered.length}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl text-sm font-black"
            style={subtleCard}
          >
            <span style={text.heading}>إغلاق</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl p-4" style={surfaceCard}>
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
        >
          {icon}
        </div>

        <div>
          <div className="text-xs font-bold" style={text.muted}>
            {title}
          </div>
          <div className="text-2xl font-black mt-2" style={text.heading}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
      <div
        className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-4"
        style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
      >
        {icon}
      </div>

      <p className="text-[13px] font-semibold mb-1" style={text.secondary}>
        {title}
      </p>

      <p className="text-2xl font-black tracking-tight" style={text.heading}>
        {value}
      </p>

      {sub && (
        <p className="text-xs mt-1.5 font-medium" style={text.muted}>
          {sub}
        </p>
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl p-5" style={surfaceCard}>
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-black" style={text.body}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ textValue }: { textValue: string }) {
  return (
    <div
      className="rounded-2xl px-4 py-8 text-center text-sm font-semibold"
      style={{ ...subtleCard, ...text.muted }}
    >
      {textValue}
    </div>
  );
}

function SmartWarehouseCard({
  metrics,
  onOpenProducts,
}: {
  metrics: WarehouseMetrics;
  onOpenProducts: () => void;
}) {
  return (
    <div className="rounded-3xl p-5 flex flex-col gap-4" style={surfaceCard}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
          >
            <WarehouseIcon size={20} />
          </div>

          <div className="min-w-0">
            <div className="text-base font-black truncate" style={text.heading}>
              {metrics.warehouse.name}
            </div>

            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-black" style={statusPillStyle()}>
                {metrics.warehouse.code || 'بدون رمز'}
              </span>

              <span
                className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-black"
                style={statusPillStyle(metrics.warehouse.is_active)}
              >
                {metrics.warehouse.is_active ? 'نشط' : 'معطّل'}
              </span>

              <span
                className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-black"
                style={statusPillStyle(metrics.lowStockCount > 0 || metrics.pendingIncoming + metrics.pendingOutgoing > 0)}
              >
                {metrics.healthLabel}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onOpenProducts}
          className="px-3 py-2 rounded-2xl text-xs font-black flex-shrink-0"
          style={subtleCard}
        >
          <span style={text.heading}>عرض التفاصيل</span>
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <InfoCell label="عدد الأصناف" value={metrics.totalProducts} />
        <InfoCell label="إجمالي الرصيد" value={fmtQty(metrics.totalQty)} />
        <InfoCell label="منخفضة المخزون" value={metrics.lowStockCount} />
        <InfoCell label="رصيدها صفر" value={metrics.zeroStockCount} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <InfoCell label="تحويلات صادرة" value={metrics.allOutgoing} />
        <InfoCell label="تحويلات واردة" value={metrics.allIncoming} />
        <InfoCell label="معلقة صادرة" value={metrics.pendingOutgoing} />
        <InfoCell label="معلقة واردة" value={metrics.pendingIncoming} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={subtleCard}>
          <div className="text-xs font-black mb-3" style={text.secondary}>
            أصناف تحتاج متابعة
          </div>

          {metrics.topLowStockProducts.length === 0 ? (
            <div className="text-xs font-semibold" style={text.muted}>
              لا توجد أصناف منخفضة المخزون داخل هذا المستودع
            </div>
          ) : (
            <div className="space-y-2">
              {metrics.topLowStockProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-black truncate" style={text.heading}>
                      {product.name}
                    </div>
                    <div className="text-[11px]" style={text.muted}>
                      الحد الأدنى: {fmtQty(product.min_stock_level || 0)}
                    </div>
                  </div>

                  <div className="text-sm font-black flex-shrink-0" style={{ color: 'var(--primary)' }}>
                    {fmtQty(product.warehouse_quantity || 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-4" style={subtleCard}>
          <div className="text-xs font-black mb-3" style={text.secondary}>
            أكبر أصناف هذا المستودع
          </div>

          {metrics.topQtyProducts.length === 0 ? (
            <div className="text-xs font-semibold" style={text.muted}>
              لا توجد كميات موزعة على هذا المستودع بعد
            </div>
          ) : (
            <div className="space-y-2">
              {metrics.topQtyProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-black truncate" style={text.heading}>
                      {product.name}
                    </div>
                    <div className="text-[11px]" style={text.muted}>
                      {product.unit || 'وحدة'}
                    </div>
                  </div>

                  <div className="text-sm font-black flex-shrink-0" style={{ color: 'var(--primary)' }}>
                    {fmtQty(product.warehouse_quantity || 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl p-3" style={subtleCard}>
      <div className="text-[11px] font-bold mb-1" style={text.muted}>
        {label}
      </div>
      <div className="text-base font-black" style={text.heading}>
        {value}
      </div>
    </div>
  );
}

export default function SmartWarehousesPage() {
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [sortBy, setSortBy] = useState<WarehouseSort>('smart_desc');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });

  const isMultiWarehouseEnabled = settings?.enable_multi_warehouse === 'true';

  const warehousesQuery = useQuery({
    queryKey: ['warehouses-smart'],
    queryFn: () => warehousesApi.getAll(false).then((r) => r.data.warehouses),
    staleTime: 0,
    enabled: isMultiWarehouseEnabled,
  });

  const transfersQuery = useQuery({
    queryKey: ['stock-transfers-smart'],
    queryFn: () => stockTransfersApi.getAll().then((r) => r.data.transfers),
    staleTime: 0,
    enabled: isMultiWarehouseEnabled,
  });

  const warehouses = warehousesQuery.data ?? [];
  const warehouseKey = useMemo(
    () => warehouses.map((w) => w.id).sort((a, b) => a - b).join(','),
    [warehouses]
  );

  const warehouseProductsQuery = useQuery<Record<number, WarehouseProduct[]>>({
    queryKey: ['smart-warehouse-products', warehouseKey],
    enabled: isMultiWarehouseEnabled && warehouses.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const entries = await Promise.all(
        warehouses.map(async (warehouse) => {
          const res = await warehousesApi.getProducts(warehouse.id);
          return [warehouse.id, res.data.products] as const;
        })
      );

      return Object.fromEntries(entries) as Record<number, WarehouseProduct[]>;
    },
  });

  const productsByWarehouse = warehouseProductsQuery.data ?? {};
  const transfers = transfersQuery.data ?? [];

  const metrics = useMemo<WarehouseMetrics[]>(() => {
    return warehouses.map((warehouse) => {
      const products = productsByWarehouse[warehouse.id] ?? [];

      const withStockCount = products.filter((p) => Number(p.warehouse_quantity || 0) > 0).length;
      const zeroStockCount = products.filter((p) => Number(p.warehouse_quantity || 0) <= 0).length;
      const lowStockProducts = products
        .filter((p) => {
          const qty = Number(p.warehouse_quantity || 0);
          const min = Number(p.min_stock_level || 0);
          return qty > 0 && min > 0 && qty <= min;
        })
        .sort(
          (a, b) =>
            Number(a.warehouse_quantity || 0) - Number(b.warehouse_quantity || 0)
        );

      const relatedTransfers = transfers.filter(
        (t) => t.from_warehouse_id === warehouse.id || t.to_warehouse_id === warehouse.id
      );

      const pendingOutgoing = relatedTransfers.filter(
        (t) => t.status === 'pending' && t.from_warehouse_id === warehouse.id
      ).length;

      const pendingIncoming = relatedTransfers.filter(
        (t) => t.status === 'pending' && t.to_warehouse_id === warehouse.id
      ).length;

      const allOutgoing = relatedTransfers.filter(
        (t) => t.from_warehouse_id === warehouse.id
      ).length;

      const allIncoming = relatedTransfers.filter(
        (t) => t.to_warehouse_id === warehouse.id
      ).length;

      const totalQty = Number(warehouse.total_quantity || 0);
      const totalProducts = Number(warehouse.products_count || 0);

      const pressureScore =
        lowStockProducts.length * 4 +
        zeroStockCount * 2 +
        pendingOutgoing +
        pendingIncoming;

      return {
        warehouse,
        products,
        withStockCount,
        zeroStockCount,
        lowStockCount: lowStockProducts.length,
        totalQty,
        totalProducts,
        pendingOutgoing,
        pendingIncoming,
        allOutgoing,
        allIncoming,
        relatedTransfersCount: relatedTransfers.length,
        pressureScore,
        healthLabel: buildHealthLabel({
          totalQty,
          lowStockCount: lowStockProducts.length,
          zeroStockCount,
          pendingIncoming,
          pendingOutgoing,
        }),
        topLowStockProducts: lowStockProducts.slice(0, 4),
        topQtyProducts: [...products]
          .sort(
            (a, b) =>
              Number(b.warehouse_quantity || 0) - Number(a.warehouse_quantity || 0)
          )
          .slice(0, 4),
      };
    });
  }, [warehouses, productsByWarehouse, transfers]);

  const filteredMetrics = useMemo(() => {
    const term = q.trim().toLowerCase();

    const rows = metrics.filter((row) => {
      const matchesStatus = showInactive ? true : row.warehouse.is_active;
      const matchesSearch =
        !term ||
        row.warehouse.name.toLowerCase().includes(term) ||
        String(row.warehouse.code || '').toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });

    rows.sort((a, b) => {
      if (sortBy === 'qty_desc') {
        return b.totalQty - a.totalQty;
      }

      if (sortBy === 'low_stock_desc') {
        return b.lowStockCount - a.lowStockCount || b.pressureScore - a.pressureScore;
      }

      if (sortBy === 'activity_desc') {
        return b.relatedTransfersCount - a.relatedTransfersCount || b.pendingIncoming + b.pendingOutgoing - (a.pendingIncoming + a.pendingOutgoing);
      }

      if (sortBy === 'name_asc') {
        return a.warehouse.name.localeCompare(b.warehouse.name, 'ar');
      }

      return b.pressureScore - a.pressureScore || b.lowStockCount - a.lowStockCount;
    });

    return rows;
  }, [metrics, q, showInactive, sortBy]);

  const selectedMetrics = useMemo(
    () => metrics.find((m) => m.warehouse.id === selectedWarehouseId) ?? null,
    [metrics, selectedWarehouseId]
  );

  const globalStats = useMemo(() => {
    const allWarehouseProducts = Object.values(productsByWarehouse).flat();

    const lowStockAlerts = allWarehouseProducts.filter((p) => {
      const qty = Number(p.warehouse_quantity || 0);
      const min = Number(p.min_stock_level || 0);
      return qty > 0 && min > 0 && qty <= min;
    }).length;

    const zeroStockProducts = allWarehouseProducts.filter(
      (p) => Number(p.warehouse_quantity || 0) <= 0
    ).length;

    const pendingTransfers = transfers.filter((t) => t.status === 'pending').length;

    const mostPressured = [...metrics].sort((a, b) => b.pressureScore - a.pressureScore)[0] ?? null;
    const mostLoaded = [...metrics].sort((a, b) => b.totalQty - a.totalQty)[0] ?? null;

    const routeMap = new Map<string, { label: string; count: number }>();
    for (const transfer of transfers) {
      const key = `${transfer.from_warehouse_id}-${transfer.to_warehouse_id}`;
      const label = `${transfer.from_warehouse_name} ← ${transfer.to_warehouse_name}`;
      const current = routeMap.get(key);
      routeMap.set(key, {
        label,
        count: (current?.count ?? 0) + 1,
      });
    }

    const busiestRoute =
      [...routeMap.values()].sort((a, b) => b.count - a.count)[0] ?? null;

    return {
      totalWarehouses: warehouses.length,
      activeWarehouses: warehouses.filter((w) => w.is_active).length,
      totalDistributedQty: warehouses.reduce((sum, w) => sum + Number(w.total_quantity || 0), 0),
      totalProductsLinked: warehouses.reduce((sum, w) => sum + Number(w.products_count || 0), 0),
      lowStockAlerts,
      zeroStockProducts,
      pendingTransfers,
      mostPressured,
      mostLoaded,
      busiestRoute,
    };
  }, [warehouses, productsByWarehouse, transfers, metrics]);

  const smartAlerts = useMemo(() => {
    return [...metrics]
      .filter((m) => m.lowStockCount > 0 || m.pendingIncoming + m.pendingOutgoing > 0 || m.totalQty <= 0)
      .sort((a, b) => b.pressureScore - a.pressureScore)
      .slice(0, 5);
  }, [metrics]);

  const isPageLoading =
    settingsLoading ||
    (isMultiWarehouseEnabled &&
      (warehousesQuery.isLoading || transfersQuery.isLoading || warehouseProductsQuery.isLoading));

  if (settingsLoading) {
    return (
      <div className="space-y-5" dir="rtl">
        <div className="rounded-3xl p-6 text-center" style={surfaceCard}>
          <div className="text-sm font-black" style={text.heading}>
            جاري تحميل إعدادات الصفحة...
          </div>
        </div>
      </div>
    );
  }

  if (!isMultiWarehouseEnabled) {
    return (
      <div className="space-y-5" dir="rtl">
        <div className="rounded-3xl p-5 md:p-6" style={surfaceCard}>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <WarehouseIcon size={22} />
            </div>

            <div>
              <div className="text-xl font-black" style={text.heading}>
                الصفحة الذكية للمستودعات
              </div>
              <div className="text-sm mt-1" style={text.muted}>
                هذه الصفحة تعمل فقط عند تفعيل نظام المستودعات المتعددة
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl p-8 text-center" style={surfaceCard}>
          <div
            className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
          >
            <AlertTriangle size={28} />
          </div>

          <div className="text-lg font-black" style={text.heading}>
            ميزة ذكاء المستودعات معطلة حاليًا
          </div>

          <div className="text-sm mt-2 max-w-xl mx-auto leading-7" style={text.muted}>
            فعّل خيار المستودعات المتعددة من صفحة الإعدادات حتى تتمكن من عرض أداء كل مستودع وتحليل أرصدته وتحويلاته.
          </div>
        </div>
      </div>
    );
  }

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
              الصفحة الذكية للمستودعات
            </h1>
            <p className="text-sm font-semibold mt-1" style={text.secondary}>
              لوحة تشغيلية سريعة لفهم ضغط كل مستودع، النواقص، والتحويلات المرتبطة به
            </p>
          </div>

          <button
            onClick={() => {
              warehousesQuery.refetch();
              transfersQuery.refetch();
              warehouseProductsQuery.refetch();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition"
            style={subtleCard}
          >
            <RefreshCw
              size={15}
              className={
                warehousesQuery.isFetching || transfersQuery.isFetching || warehouseProductsQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }
              style={text.secondary}
            />
            <span style={text.heading}>تحديث</span>
          </button>
        </div>
      </div>

      {isPageLoading ? (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-3xl h-36 animate-pulse" style={surfaceCard} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-3xl h-72 animate-pulse" style={surfaceCard} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <KpiCard
              title="المستودعات النشطة"
              value={globalStats.activeWarehouses}
              sub={`من أصل ${globalStats.totalWarehouses}`}
              icon={<Building2 size={18} />}
            />
            <KpiCard
              title="مجموع الأرصدة الموزعة"
              value={fmtQty(globalStats.totalDistributedQty)}
              sub={`${globalStats.totalProductsLinked} صنف مرتبط`}
              icon={<WarehouseIcon size={18} />}
            />
            <KpiCard
              title="تنبيهات المخزون"
              value={globalStats.lowStockAlerts}
              sub={`${globalStats.zeroStockProducts} صفري داخل المستودعات`}
              icon={<AlertTriangle size={18} />}
            />
            <KpiCard
              title="التحويلات المعلقة"
              value={globalStats.pendingTransfers}
              sub="قيد الانتظار حاليًا"
              icon={<Clock3 size={18} />}
            />
            <KpiCard
              title="أكثر مستودع تحميلًا"
              value={globalStats.mostLoaded?.warehouse.name ?? '—'}
              sub={globalStats.mostLoaded ? `رصيد ${fmtQty(globalStats.mostLoaded.totalQty)}` : 'لا توجد بيانات'}
              icon={<Boxes size={18} />}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <SectionCard
              title="اقتراحات ذكية سريعة"
              icon={<AlertTriangle size={16} style={{ color: 'var(--primary)' }} />}
            >
              {smartAlerts.length === 0 ? (
                <EmptyState textValue="لا توجد مستودعات تحتاج متابعة فورية الآن" />
              ) : (
                <div className="space-y-3">
                  {smartAlerts.map((m) => (
                    <div key={m.warehouse.id} className="rounded-2xl p-3" style={subtleCard}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black truncate" style={text.heading}>
                            {m.warehouse.name}
                          </div>
                          <div className="text-[11px] mt-1" style={text.muted}>
                            {m.healthLabel}
                          </div>
                        </div>

                        <span className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-black" style={statusPillStyle(true)}>
                          {m.pressureScore}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <InfoCell label="منخفض" value={m.lowStockCount} />
                        <InfoCell label="صفر" value={m.zeroStockCount} />
                        <InfoCell label="معلق" value={m.pendingIncoming + m.pendingOutgoing} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="أكثر خط تحويل نشاطًا"
              icon={<ArrowLeftRight size={16} style={{ color: 'var(--primary)' }} />}
            >
              {!globalStats.busiestRoute ? (
                <EmptyState textValue="لا توجد تحويلات كافية لاستخراج مسار نشط" />
              ) : (
                <div className="rounded-2xl p-4" style={subtleCard}>
                  <div className="text-sm font-black" style={text.heading}>
                    {globalStats.busiestRoute.label}
                  </div>
                  <div className="text-xs mt-2" style={text.muted}>
                    تكرر هذا المسار {globalStats.busiestRoute.count} مرة
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-2">
                {transfers.slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={subtleCard}>
                    <div className="min-w-0">
                      <div className="text-sm font-black truncate" style={text.heading}>
                        {t.transfer_number}
                      </div>
                      <div className="text-[11px] mt-1" style={text.muted}>
                        {t.from_warehouse_name} ← {t.to_warehouse_name}
                      </div>
                    </div>

                    <span className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-black flex-shrink-0" style={statusPillStyle(t.status === 'pending')}>
                      {t.status === 'pending'
                        ? 'قيد الانتظار'
                        : t.status === 'approved'
                          ? 'معتمد'
                          : t.status === 'received'
                            ? 'مستلم'
                            : 'ملغي'}
                    </span>
                  </div>
                ))}

                {transfers.length === 0 && <EmptyState textValue="لا توجد تحويلات مسجلة بعد" />}
              </div>
            </SectionCard>

            <SectionCard
              title="أقرب مستودع يحتاج تعبئة"
              icon={<Package size={16} style={{ color: 'var(--primary)' }} />}
            >
              {!globalStats.mostPressured ? (
                <EmptyState textValue="كل المستودعات بحالة جيدة حاليًا" />
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl p-4" style={subtleCard}>
                    <div className="text-sm font-black" style={text.heading}>
                      {globalStats.mostPressured.warehouse.name}
                    </div>
                    <div className="text-xs mt-2" style={text.muted}>
                      منخفضة المخزون: {globalStats.mostPressured.lowStockCount} — معلقة: {globalStats.mostPressured.pendingIncoming + globalStats.mostPressured.pendingOutgoing}
                    </div>
                  </div>

                  {globalStats.mostPressured.topLowStockProducts.length > 0 ? (
                    <div className="space-y-2">
                      {globalStats.mostPressured.topLowStockProducts.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={subtleCard}>
                          <div className="min-w-0">
                            <div className="text-sm font-black truncate" style={text.heading}>
                              {p.name}
                            </div>
                            <div className="text-[11px] mt-1" style={text.muted}>
                              حد أدنى {fmtQty(p.min_stock_level || 0)}
                            </div>
                          </div>

                          <div className="text-sm font-black flex-shrink-0" style={{ color: 'var(--primary)' }}>
                            {fmtQty(p.warehouse_quantity || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState textValue="لا توجد أصناف منخفضة واضحة داخل هذا المستودع" />
                  )}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search
                  size={16}
                  className="absolute top-1/2 -translate-y-1/2 right-3"
                  style={text.muted}
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث باسم المستودع أو رمزه..."
                  className="w-full rounded-2xl pr-10 pl-3 py-3 text-sm outline-none"
                  style={subtleCard}
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as WarehouseSort)}
                  className="rounded-2xl px-3 py-3 text-sm outline-none"
                  style={subtleCard}
                >
                  <option value="smart_desc">الترتيب الذكي</option>
                  <option value="qty_desc">الأعلى كمية</option>
                  <option value="low_stock_desc">الأكثر نقصًا</option>
                  <option value="activity_desc">الأكثر نشاطًا</option>
                  <option value="name_asc">الاسم</option>
                </select>

                <label
                  className="flex items-center gap-2 rounded-2xl px-3 py-2.5 cursor-pointer"
                  style={subtleCard}
                >
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                  />
                  <span className="text-sm font-bold" style={text.secondary}>
                    إظهار المعطّل
                  </span>
                </label>
              </div>
            </div>
          </div>

          {filteredMetrics.length === 0 ? (
            <div className="rounded-3xl p-10 text-center" style={surfaceCard}>
              <div className="text-base font-black" style={text.heading}>
                لا توجد مستودعات مطابقة
              </div>
              <div className="text-sm mt-2" style={text.muted}>
                غيّر البحث أو خيارات العرض لإظهار نتائج أخرى
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              {filteredMetrics.map((m) => (
                <SmartWarehouseCard
                  key={m.warehouse.id}
                  metrics={m}
                  onOpenProducts={() => setSelectedWarehouseId(m.warehouse.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selectedMetrics && (
        <WarehouseProductsDetailsModal
          warehouse={selectedMetrics.warehouse}
          products={selectedMetrics.products}
          onClose={() => setSelectedWarehouseId(null)}
        />
      )}
    </div>
  );
}