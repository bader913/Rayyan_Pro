import React, { useEffect, useState } from 'react';
import { dashboardApi, type DashboardStats, type DashboardSmartSuggestions } from '../api/dashboard.ts';
import SaleInvoiceDetailsModal from '@/components/SaleInvoiceDetailsModal.tsx';
import { useAuthStore } from '../store/authStore.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { settingsApi } from '../api/settings.ts';
import { apiClient } from '../api/client.ts';
import {
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  DollarSign,
  Users,
  Truck,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from 'lucide-react';

const fmtN = (v: number) => v.toLocaleString('en-US');
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ar-EG-u-nu-latn', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير عام',
  manager: 'مدير',
  cashier: 'كاشير',
  warehouse: 'مخزن',
};

const absMoney = (n: number) => Math.abs(n);

const customerBalanceMeta = (n: number) =>
  n < 0
    ? { label: 'لهم', color: '#f59e0b' }
    : n > 0
      ? { label: 'عليهم', color: '#ef4444' }
      : { label: 'متوازن', color: 'var(--text-muted)' };

const supplierBalanceMeta = (n: number) =>
  n > 0
    ? { label: 'علينا', color: '#ef4444' }
    : n < 0
      ? { label: 'بذمته', color: '#10b981' }
      : { label: 'متوازن', color: 'var(--text-muted)' };

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

interface WarehouseOption {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const { fmt } = useCurrency();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [smartSuggestions, setSmartSuggestions] = useState<DashboardSmartSuggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
const [showAllTopProducts, setShowAllTopProducts] = useState(false);
const [showAllLowStock, setShowAllLowStock] = useState(false);
const [showAllRecentSales, setShowAllRecentSales] = useState(false);
  const [warehouseFilterId, setWarehouseFilterId] = useState<number | ''>('');
  const [isMultiWarehouseEnabled, setIsMultiWarehouseEnabled] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  const customerMeta = customerBalanceMeta(stats?.receivables.customerDebt ?? 0);
  const supplierMeta = supplierBalanceMeta(stats?.receivables.supplierBalance ?? 0);

  useEffect(() => {
    let alive = true;

    if (!isManager) {
      setIsMultiWarehouseEnabled(false);
      setWarehouses([]);
      setWarehouseFilterId('');
      return () => {
        alive = false;
      };
    }

    settingsApi
      .getAll()
      .then(async (res) => {
        if (!alive) return;

        const enabled = res.data.settings?.enable_multi_warehouse === 'true';
        setIsMultiWarehouseEnabled(enabled);

        if (!enabled) {
          setWarehouses([]);
          setWarehouseFilterId('');
          return;
        }

        const warehousesRes = await apiClient.get<{ success: boolean; warehouses: WarehouseOption[] }>('/warehouses', {
          params: { active: 'true' },
        });

        if (!alive) return;
        setWarehouses(warehousesRes.data.warehouses ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setIsMultiWarehouseEnabled(false);
        setWarehouses([]);
        setWarehouseFilterId('');
      });

    return () => {
      alive = false;
    };
  }, [isManager]);

  useEffect(() => {
    let alive = true;

    if (!isManager) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setLoading(true);

    dashboardApi
      .getStats(warehouseFilterId || undefined)
      .then((res) => {
        if (!alive) return;
        setStats(res.data.stats);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isManager, warehouseFilterId]);

  useEffect(() => {
    let alive = true;

    if (!isManager) {
      setSmartSuggestions(null);
      setSuggestionsLoading(false);
      return () => {
        alive = false;
      };
    }

    setSuggestionsLoading(true);

    dashboardApi
      .getSmartSuggestions(warehouseFilterId || undefined)
      .then((res) => {
        if (!alive) return;
        setSmartSuggestions(res.data.suggestions);
        setSuggestionsLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setSmartSuggestions(null);
        setSuggestionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isManager, warehouseFilterId]);

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
        <div className="flex flex-col gap-1">
          <h1
            className="text-[10px] md:text-[25px] font-black tracking-tight"
            style={text.heading}
          >
            مرحباً، {user?.full_name} 👋
          </h1>
          <p className="text-sm font-semibold" style={text.secondary}>
            {ROLE_LABELS[user?.role ?? ''] ?? user?.role} — نظام ريان برو
          </p>
        </div>
      </div>

      {isManager && isMultiWarehouseEnabled && (
        <div
          className="rounded-3xl p-4 md:p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
          style={surfaceCard}
        >
          <div>
            <h2 className="text-sm font-black" style={text.heading}>
              فلترة الداشبورد حسب المستودع
            </h2>
            <p className="text-xs mt-1 font-medium" style={text.muted}>
              عند اختيار مستودع سيتم تصفية مؤشرات المبيعات والمشتريات والمخزون عليه.
              أرصدة العملاء والموردين تبقى إجمالية على مستوى المتجر.
            </p>
          </div>

          <div className="w-full md:w-[280px]">
            <select
              value={warehouseFilterId}
              onChange={(e) => setWarehouseFilterId(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                color: 'var(--text-body)',
              }}
            >
              <option value="">كل المستودعات</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!isManager && (
        <div
          className="rounded-3xl p-8 text-center"
          style={surfaceCard}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)' }}
          >
            <Package className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>

          <p className="text-sm font-semibold" style={text.secondary}>
            لا تتوفر إحصائيات لدورك الحالي. استخدم القائمة للوصول إلى صلاحياتك.
          </p>
        </div>
      )}

      {isManager && loading && (
        <>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="rounded-3xl h-36 animate-pulse"
                style={surfaceCard}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-3xl h-72 animate-pulse"
                style={surfaceCard}
              />
            ))}
          </div>
        </>
      )}

      {isManager && !loading && stats && (
        <>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
          >
            <KpiCard
              icon={<ShoppingCart className="w-5 h-5" />}
              iconBg="#dbeafe"
              iconColor="#1d4ed8"
              label="مبيعات اليوم"
              value={fmt(stats.sales.today.total)}
              sub={`${fmtN(stats.sales.today.count)} فاتورة`}
            />

            <KpiCard
              icon={<TrendingUp className="w-5 h-5" />}
              iconBg="#d1fae5"
              iconColor="#065f46"
              label="مبيعات الشهر"
              value={fmt(stats.sales.month.total)}
              sub={`${fmtN(stats.sales.month.count)} فاتورة`}
            />

            <KpiCard
              icon={<Truck className="w-5 h-5" />}
              iconBg="#fef3c7"
              iconColor="#92400e"
              label="مشتريات الشهر"
              value={fmt(stats.purchases.month.total)}
              sub={`${fmtN(stats.purchases.month.count)} فاتورة`}
            />

            <KpiCard
              icon={<DollarSign className="w-5 h-5" />}
              iconBg={stats.cashFlow.net >= 0 ? '#d1fae5' : '#fee2e2'}
              iconColor={stats.cashFlow.net >= 0 ? '#065f46' : '#991b1b'}
              label="صافي التدفق النقدي"
              value={`${stats.cashFlow.net >= 0 ? '+' : ''}${fmt(stats.cashFlow.net)}`}
              sub="للشهر الحالي"
              valueColor={stats.cashFlow.net >= 0 ? '#10b981' : '#ef4444'}
            />

            {stats.profit && (
              <KpiCard
                icon={<TrendingUp className="w-5 h-5" />}
                iconBg={(stats.profit.netProfit ?? 0) >= 0 ? '#d1fae5' : '#fee2e2'}
                iconColor={(stats.profit.netProfit ?? 0) >= 0 ? '#065f46' : '#991b1b'}
                label="صافي الربح"
                value={`${(stats.profit.netProfit ?? 0) >= 0 ? '+' : ''}${fmt(stats.profit.netProfit ?? 0)}`}
                sub={`مصاريف: ${fmt(stats.profit.totalExpenses ?? 0)}`}
                valueColor={(stats.profit.netProfit ?? 0) >= 0 ? '#10b981' : '#ef4444'}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BalanceCard
              icon={<Users className="w-4 h-4" />}
              title="إجمالي حسابات العملاء"
              value={fmt(absMoney(stats.receivables.customerDebt))}
              label={customerMeta.label}
              color={customerMeta.color}
            />

            <BalanceCard
              icon={<Truck className="w-4 h-4" />}
              title="إجمالي حسابات الموردين"
              value={fmt(absMoney(stats.receivables.supplierBalance))}
              label={supplierMeta.label}
              color={supplierMeta.color}
            />
          </div>

          <SectionCard
            icon={<Package className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
            title="اقتراحات تشغيل ذكية"
          >
            <p className="text-xs font-medium mb-4" style={text.muted}>
              {isMultiWarehouseEnabled && warehouseFilterId
                ? 'الاقتراحات محسوبة على المستودع المحدد حاليًا.'
                : 'الاقتراحات محسوبة على مستوى المتجر الحالي.'}
            </p>

            {suggestionsLoading ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="rounded-3xl h-40 animate-pulse"
                    style={subtleCard}
                  />
                ))}
              </div>
            ) : !smartSuggestions || smartSuggestions.total === 0 ? (
              <EmptyState text="لا توجد اقتراحات تشغيلية حالياً" success />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <SuggestionGroup
  title="شراء فوري"
  count={smartSuggestions.reorderNow.length}
>
  {smartSuggestions.reorderNow.length === 0 ? (
    <EmptyState text="لا يوجد نقص حرج" success />
  ) : (
    smartSuggestions.reorderNow.map((item) => (
      <SuggestionItem
        key={`reorder-${item.id}`}
        title={item.name}
        sub={`المتوفر ${fmtN(item.stock_quantity)} / الحد ${fmtN(item.min_stock_level)}`}
        badge={
          item.days_left == null
            ? `مبيع 30 يوم: ${fmtN(item.net_sold_30)}`
            : `يكفي ${fmtN(item.days_left)} يوم`
        }
      />
    ))
  )}
</SuggestionGroup>

<SuggestionGroup
  title="خطر نفاد قريب"
  count={smartSuggestions.stockRisk.length}
>
  {smartSuggestions.stockRisk.length === 0 ? (
    <EmptyState text="لا توجد أصناف على وشك النفاد" success />
  ) : (
    smartSuggestions.stockRisk.map((item) => (
      <SuggestionItem
        key={`risk-${item.id}`}
        title={item.name}
        sub={`المتوفر ${fmtN(item.stock_quantity)} / الحد ${fmtN(item.min_stock_level)}`}
        badge={`يكفي ${fmtN(item.days_left)} يوم`}
      />
    ))
  )}
</SuggestionGroup>

<SuggestionGroup
  title="أصناف راكدة"
  count={smartSuggestions.slowMoving.length}
>
  {smartSuggestions.slowMoving.length === 0 ? (
    <EmptyState text="لا توجد أصناف راكدة حاليًا" success />
  ) : (
    smartSuggestions.slowMoving.map((item) => (
      <SuggestionItem
        key={`slow-${item.id}`}
        title={item.name}
        sub={`المتوفر ${fmtN(item.stock_quantity)} / الحد ${fmtN(item.min_stock_level)}`}
        badge={
          item.days_since_last_sale == null
            ? 'لا يوجد بيع سابق'
            : `آخر بيع منذ ${fmtN(item.days_since_last_sale)} يوم`
        }
      />
    ))
  )}
</SuggestionGroup>
              </div>
            )}
          </SectionCard>


          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <SectionCard
              icon={<ArrowUp className="w-4 h-4 text-emerald-500" />}
              title="أكثر المنتجات مبيعاً (الشهر)"
            >
              {stats.topProducts.length === 0 ? (
                <EmptyState text="لا توجد بيانات" />
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {stats.topProducts.map((p, i) => (
                    <div
                      key={`${p.product_name}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3"
                      style={subtleCard}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                          style={{
                            background: 'var(--bg-card)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {i + 1}
                        </div>

                        <span
                          className="text-sm font-bold truncate"
                          style={text.heading}
                        >
                          {p.product_name}
                        </span>
                      </div>

                      <div className="text-left flex-shrink-0">
                        <span className="text-sm font-black text-emerald-500">
                          {fmtN(parseFloat(p.total_qty))}
                        </span>
                        <span className="text-xs mr-1" style={text.muted}>
                          {(p as any).product_unit || 'وحدة'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
              title="تنبيهات المخزون"
            >
              {stats.lowStock.length === 0 ? (
                <EmptyState text="✓ المخزون بخير" success />
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {stats.lowStock.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3"
                      style={subtleCard}
                    >
                      <span
                        className="text-sm font-bold truncate"
                        style={text.heading}
                      >
                        {p.name}
                      </span>

                      <span className="text-sm font-black text-amber-500 flex-shrink-0">
                        {fmtN(parseFloat(p.stock_quantity))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={<ArrowDown className="w-4 h-4 text-blue-500" />}
              title="آخر المبيعات"
            >
              {stats.recentSales.length === 0 ? (
                <EmptyState text="لا توجد مبيعات" />
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {stats.recentSales.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3"
                      style={subtleCard}
                    >
                      <div className="min-w-0">
                        <button
                          onClick={() => setSelectedSaleId(s.id)}
                          className="text-sm font-black hover:underline transition"
                          style={{ color: '#2563eb' }}
                          title="عرض تفاصيل الفاتورة"
                        >
                          {s.invoice_number}
                        </button>

                        <p className="text-xs mt-1 font-medium" style={text.muted}>
                          {s.customer_name ?? 'زبون نقدي'}
                        </p>
                      </div>

                      <div className="text-left flex-shrink-0">
                        <p className="text-sm font-black" style={text.heading}>
                          {fmt(parseFloat(s.total_amount))}
                        </p>
                        <p className="text-xs mt-1 font-medium" style={text.muted}>
                          {fmtDate(s.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}

      {isManager && !loading && !stats && (
        <div
          className="rounded-3xl p-8 text-center"
          style={surfaceCard}
        >
          <div
            className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)' }}
          >
            <RefreshCw className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
          </div>

          <p className="text-sm font-semibold" style={text.secondary}>
            تعذّر تحميل الإحصائيات
          </p>
        </div>
      )}

      <SaleInvoiceDetailsModal
        saleId={selectedSaleId}
        open={selectedSaleId !== null}
        onClose={() => setSelectedSaleId(null)}
      />
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div
      className="rounded-3xl p-4 md:p-5 transition-transform duration-200 hover:-translate-y-[1px]"
      style={surfaceCard}
    >
      <div
        className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-4 flex-shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>

      <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </p>

      <p
        className="text-2xl font-black tracking-tight"
        style={{ color: valueColor ?? 'var(--text-heading)' }}
      >
        {value}
      </p>

      <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
        {sub}
      </p>
    </div>
  );
}

function BalanceCard({
  icon,
  title,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div
      className="rounded-3xl px-5 py-4 flex items-center justify-between gap-4"
      style={surfaceCard}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'var(--bg-subtle)',
            color,
            border: '1px solid var(--border)',
          }}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
            {title}
          </div>
          <div className="text-xs font-black mt-1" style={{ color }}>
            {label}
          </div>
        </div>
      </div>

      <div className="text-left flex-shrink-0">
        <p
          className="text-[30px] leading-none font-black tracking-tight"
          style={{ color }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-3xl p-5"
      style={surfaceCard}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-black" style={{ color: 'var(--text-body)' }}>
          {title}
        </h3>
      </div>

      {children}
    </div>
  );
}

function SuggestionGroup({
  title,
  count = 0,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = React.Children.toArray(children);
  const hasMore = items.length > 10;
  const visibleItems = expanded ? items : items.slice(0, 10);

  return (
    <div className="rounded-3xl p-4" style={subtleCard}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-sm font-black" style={text.heading}>
          {title}
        </div>

        <div
          className="text-[11px] font-black px-2.5 py-1 rounded-xl whitespace-nowrap"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
        >
          {count} عنصر
        </div>
      </div>

      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {visibleItems}
      </div>

      {hasMore && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold" style={text.muted}>
            {expanded ? `يعرض الكل (${items.length})` : `يعرض 10 من أصل ${items.length}`}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-black transition"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-body)',
              border: '1px solid var(--border)',
            }}
          >
            {expanded ? 'عرض أقل' : 'عرض الكل'}
          </button>
        </div>
      )}
    </div>
  );
}

function SuggestionItem({
  title,
  sub,
  badge,
}: {
  title: string;
  sub: string;
  badge?: string;
}) {
  return (
    <div
      className="rounded-2xl px-3 py-3 flex items-center justify-between gap-3"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="min-w-0">
        <div className="text-sm font-bold truncate" style={text.heading}>
          {title}
        </div>
        <div className="text-xs mt-1 font-medium" style={text.muted}>
          {sub}
        </div>
      </div>

      {badge ? (
        <div
          className="text-xs font-black px-2.5 py-1 rounded-xl whitespace-nowrap"
          style={{
            background: 'var(--bg-subtle)',
            color: 'var(--text-body)',
            border: '1px solid var(--border)',
          }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  text,
  success = false,
}: {
  text: string;
  success?: boolean;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-8 text-center text-sm font-semibold"
      style={{
        background: 'var(--bg-subtle)',
        color: success ? '#10b981' : 'var(--text-muted)',
        border: '1px solid var(--border)',
      }}
    >
      {text}
    </div>
  );
}