import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Brain,
  Clock3,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  dashboardApi,
  type MorningDecisionData,
  type MorningDecisionSummary,
} from '../api/dashboard.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { useAuthStore } from '../store/authStore.ts';

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

const MORNING_DECISIONS_READ_KEY_PREFIX = 'morning-decisions:last-opened:';

function getLocalDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const fmtDateTime = (value: string) =>
  new Date(value).toLocaleDateString('ar-EG-u-nu-latn', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const sourceLabel = (source: string) => {
  switch (source) {
    case 'telegram':
      return 'تيليغرام';
    case 'web':
      return 'ويب';
    default:
      return source || 'طلب';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'new':
      return 'جديد';
    case 'reviewed':
      return 'تمت مراجعته';
    default:
      return status;
  }
};

const paymentLabel = (method: string) => {
  switch (method) {
    case 'cash_on_delivery':
      return 'نقدًا عند الاستلام';
    case 'sham_cash':
      return 'شام كاش';
    default:
      return method;
  }
};

export default function MorningDecisionsPage() {
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const user = useAuthStore((s) => s.user);

  const [summary, setSummary] = useState<MorningDecisionSummary | null>(null);
  const [decisions, setDecisions] = useState<MorningDecisionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError('');

    dashboardApi
      .getMorningDecisions()
      .then((res) => {
        if (!alive) return;
        setSummary(res.data.summary);
        setDecisions(res.data.decisions);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e?.response?.data?.message ?? 'تعذر تحميل قرارات اليوم');
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(
      `${MORNING_DECISIONS_READ_KEY_PREFIX}${user.id}`,
      getLocalDateKey()
    );
  }, [user?.id]);

  return (
    <div className="space-y-5" dir="rtl">
      <div
        className="rounded-3xl px-5 py-5 md:px-6 md:py-6"
        style={{
          ...surfaceCard,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 92%, var(--bg-subtle)) 0%, var(--bg-card) 100%)',
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  color: 'var(--primary)',
                  border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
                }}
              >
                <Brain className="w-6 h-6" />
              </div>

              <div>
                <h1 className="text-2xl font-black tracking-tight" style={text.heading}>
                  قرارات اليوم
                </h1>
                <p className="text-sm font-semibold mt-1" style={text.secondary}>
                  صفحة تقول لك ماذا تفعل اليوم بدل قراءة الأرقام فقط
                </p>
              </div>
            </div>

            {summary?.generated_at && (
              <p className="text-xs font-medium mt-4" style={text.muted}>
                آخر تحديث: {fmtDateTime(summary.generated_at)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:min-w-[420px]">
            <SummaryPill
              label="قرارات قابلة للتنفيذ"
              value={summary?.badge_count ?? 0}
            />
            <SummaryPill
              label="تحتاج شراء"
              value={summary?.urgent_restock_count ?? 0}
            />
            <SummaryPill
              label="طلبات بانتظارك"
              value={summary?.pending_orders_count ?? 0}
            />
            <SummaryPill
              label="تحتاج انتباه"
              value={summary?.attention_count ?? 0}
            />
          </div>
        </div>
      </div>

      {loading && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-3xl h-80 animate-pulse" style={surfaceCard} />
            ))}
          </div>
          <div className="rounded-3xl h-72 animate-pulse" style={surfaceCard} />
        </>
      )}

      {!loading && error && (
        <div className="rounded-3xl p-8 text-center" style={surfaceCard}>
          <div
            className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)' }}
          >
            <RefreshCw className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-sm font-semibold" style={text.secondary}>
            {error}
          </p>
        </div>
      )}

      {!loading && !error && decisions && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SectionCard
              icon={<Truck className="w-4 h-4" style={{ color: '#b45309' }} />}
              title="أصناف تحتاج شراء قريب"
              subtitle="الأصناف التي تبيع ولديها نقص فعلي أو أصبحت عند الحد الأدنى"
              actionLabel="فتح المشتريات"
              onAction={() => navigate('/purchases')}
            >
              {decisions.urgentRestock.length === 0 ? (
                <EmptyState text="لا توجد أصناف تحتاج شراء عاجل الآن" success />
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {decisions.urgentRestock.map((item) => (
                    <div key={item.id} className="rounded-2xl px-3 py-3" style={subtleCard}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black truncate" style={text.heading}>
                            {item.name}
                          </div>
                          <div className="text-xs mt-1 font-medium" style={text.muted}>
                            المتوفر {item.stock_quantity.toLocaleString('en-US')} / الحد الأدنى{' '}
                            {item.min_stock_level.toLocaleString('en-US')}
                          </div>
                        </div>

                        <div
                          className="px-2.5 py-1 rounded-xl text-xs font-black whitespace-nowrap"
                          style={{
                            background: 'var(--bg-card)',
                            color: '#b45309',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {item.days_left == null
                            ? `بيع 30 يوم: ${item.net_sold_30.toLocaleString('en-US')}`
                            : `يكفي ${item.days_left.toLocaleString('en-US')} يوم`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={<Clock3 className="w-4 h-4" style={{ color: '#6b7280' }} />}
              title="أصناف راكدة"
              subtitle="منتجات عندها مخزون لكنها لم تتحرك منذ فترة"
              actionLabel="فتح المنتجات"
              onAction={() => navigate('/products')}
            >
              {decisions.slowMoving.length === 0 ? (
                <EmptyState text="لا توجد أصناف راكدة حاليًا" success />
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {decisions.slowMoving.map((item) => (
                    <div key={item.id} className="rounded-2xl px-3 py-3" style={subtleCard}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black truncate" style={text.heading}>
                            {item.name}
                          </div>
                          <div className="text-xs mt-1 font-medium" style={text.muted}>
                            المخزون الحالي {item.stock_quantity.toLocaleString('en-US')}
                          </div>
                        </div>

                        <div
                          className="px-2.5 py-1 rounded-xl text-xs font-black whitespace-nowrap"
                          style={{
                            background: 'var(--bg-card)',
                            color: 'var(--text-body)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {item.days_since_last_sale == null
                            ? 'لا يوجد بيع سابق'
                            : `منذ ${item.days_since_last_sale.toLocaleString('en-US')} يوم`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={<TrendingUp className="w-4 h-4" style={{ color: '#059669' }} />}
              title="أكثر 10 أصناف بيعًا"
              subtitle="أفضل الأصناف حركةً خلال آخر 7 أيام"
              actionLabel="فتح فواتير المبيعات"
              onAction={() => navigate('/sellInvoices')}
            >
              {decisions.topSelling.length === 0 ? (
                <EmptyState text="لا توجد بيانات بيع كافية" />
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {decisions.topSelling.map((item, index) => (
                    <div
                      key={item.product_id}
                      className="rounded-2xl px-3 py-3 flex items-center justify-between gap-3"
                      style={subtleCard}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                          style={{
                            background: 'var(--bg-card)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {index + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-black truncate" style={text.heading}>
                            {item.product_name}
                          </div>
                          <div className="text-xs mt-1 font-medium" style={text.muted}>
                            الإيراد الصافي: {fmt(item.net_revenue)}
                          </div>
                        </div>
                      </div>

                      <div
                        className="px-2.5 py-1 rounded-xl text-xs font-black whitespace-nowrap"
                        style={{
                          background: 'var(--bg-card)',
                          color: '#059669',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {item.net_qty.toLocaleString('en-US')} {item.product_unit || 'وحدة'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={<ShoppingBag className="w-4 h-4" style={{ color: '#2563eb' }} />}
              title="طلبات واردة تحتاج تصرفًا"
              subtitle="طلبات جديدة أو تمت مراجعتها ولم تُحوّل بعد"
              actionLabel="فتح الطلبات الواردة"
              onAction={() => navigate('/incoming-orders')}
            >
              {decisions.pendingOrders.length === 0 ? (
                <EmptyState text="لا توجد طلبات معلقة الآن" success />
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {decisions.pendingOrders.map((item) => (
                    <div key={item.id} className="rounded-2xl px-3 py-3" style={subtleCard}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black" style={text.heading}>
                              {item.order_number}
                            </span>
                            <span
                              className="text-[11px] font-black px-2 py-0.5 rounded-full"
                              style={{
                                background: 'var(--bg-card)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {sourceLabel(item.source)}
                            </span>
                            <span
                              className="text-[11px] font-black px-2 py-0.5 rounded-full"
                              style={{
                                background:
                                  item.status === 'new'
                                    ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                                    : 'var(--bg-card)',
                                color:
                                  item.status === 'new'
                                    ? 'var(--primary)'
                                    : 'var(--text-body)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {statusLabel(item.status)}
                            </span>
                          </div>

                          <div className="text-xs mt-2 font-medium" style={text.muted}>
                            {item.customer_name}
                            {item.recipient_name ? ` • المستلم: ${item.recipient_name}` : ''}
                          </div>

                          <div className="text-xs mt-1 font-medium" style={text.muted}>
                            {paymentLabel(item.payment_method)}
                            {item.warehouse_name ? ` • ${item.warehouse_name}` : ''}
                          </div>
                        </div>

                        <div className="text-left flex-shrink-0">
                          <div className="text-xs font-bold" style={text.muted}>
                            {fmtDateTime(item.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard
            icon={<AlertTriangle className="w-4 h-4 text-rose-500" />}
            title="أمور تحتاج انتباه"
            subtitle="مشكلات أو مؤشرات تستحق فتحها اليوم"
            actionLabel=""
          >
            {decisions.attention.length === 0 ? (
              <EmptyState text="لا توجد إشارات مقلقة اليوم" success />
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {decisions.attention.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="w-full rounded-2xl px-3 py-3 text-right transition-all hover:scale-[1.005]"
                    style={subtleCard}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black" style={text.heading}>
                            {item.title}
                          </span>
                          <span
                            className="text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{
                              background:
                                item.severity === 'high'
                                  ? 'rgba(239,68,68,0.12)'
                                  : 'rgba(245,158,11,0.12)',
                              color: item.severity === 'high' ? '#dc2626' : '#b45309',
                              border:
                                item.severity === 'high'
                                  ? '1px solid rgba(239,68,68,0.2)'
                                  : '1px solid rgba(245,158,11,0.25)',
                            }}
                          >
                            {item.severity === 'high' ? 'مرتفع' : 'متوسط'}
                          </span>
                        </div>

                        <div className="text-xs mt-1.5 font-medium" style={text.muted}>
                          {item.subtitle}
                        </div>
                      </div>

                      <div
                        className="px-2.5 py-1 rounded-xl text-xs font-black whitespace-nowrap flex-shrink-0"
                        style={{
                          background: 'var(--bg-card)',
                          color:
                            item.severity === 'high' ? '#dc2626' : 'var(--text-body)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {item.metric_kind === 'money'
                          ? `${item.metric_prefix ?? ''}${fmt(item.metric_value)}`
                          : item.metric_kind === 'hours'
                          ? `${item.metric_value.toLocaleString('en-US')} س`
                          : `${item.metric_value.toLocaleString('en-US')} وحدة`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl px-3 py-3" style={subtleCard}>
      <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="text-lg font-black mt-1" style={{ color: 'var(--text-heading)' }}>
        {value.toLocaleString('en-US')}
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl p-5" style={surfaceCard}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-black" style={{ color: 'var(--text-body)' }}>
              {title}
            </h3>
          </div>

          {subtitle ? (
            <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          ) : null}
        </div>

        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="px-3 py-2 rounded-xl text-xs font-black transition"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-body)',
              border: '1px solid var(--border)',
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      {children}
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