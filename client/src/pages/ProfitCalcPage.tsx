import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, TrendingUp, Plus, X, Calculator, RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client.ts';

interface Product {
  id:             number;
  name:           string;
  purchase_price: string;
  retail_price:   string;
  wholesale_price: string;
  stock_quantity: string;
  category_name:  string | null;
  unit:           string | null;
}

interface CalcItem {
  id:         number;
  name:       string;
  costPrice:  number;
  salePrice:  number;
  quantity:   number;
}

export default function ProfitCalcPage() {
  const [search,     setSearch]     = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [items,      setItems]      = useState<CalcItem[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: productData, isLoading } = useQuery({
    queryKey: ['products-profit', debouncedQ],
    queryFn:  () => apiClient.get('/products', { params: { q: debouncedQ, limit: 30 } })
      .then((r) => r.data as { products: Product[] }),
  });

  const addProduct = useCallback((p: Product) => {
    setItems((prev) => {
      if (prev.find((x) => x.id === p.id)) return prev;
      return [...prev, {
        id:        p.id,
        name:      p.name,
        costPrice: parseFloat(p.purchase_price) || 0,
        salePrice: parseFloat(p.retail_price)   || 0,
        quantity:  1,
      }];
    });
    setSearch('');
  }, []);

  const update = (id: number, field: keyof CalcItem, value: number) =>
    setItems((prev) => prev.map((x) => x.id === id ? { ...x, [field]: value } : x));

  const remove = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  // Totals
  const totalCost     = items.reduce((s, i) => s + i.costPrice * i.quantity, 0);
  const totalRevenue  = items.reduce((s, i) => s + i.salePrice * i.quantity, 0);
  const totalProfit   = totalRevenue - totalCost;
  const profitMargin  = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const roi           = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  const fmt = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const products: Product[] = productData?.products ?? [];

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text-heading)' }}>
          حاسبة الربح
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          محاكاة بيع تخيلية لمعرفة الربح المتوقع قبل اتخاذ قرارات البيع
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Search */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="text-xs font-black mb-3" style={{ color: 'var(--text-muted)' }}>
            إضافة صنف
          </div>
          <div className="relative mb-3">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن صنف..."
              className="w-full pr-9 pl-3 py-2.5 rounded-xl border text-sm focus:outline-none"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="max-h-80 overflow-y-auto flex flex-col gap-1">
            {isLoading && <div className="text-center py-4"><RefreshCw className="animate-spin inline" size={18} style={{ color: 'var(--text-muted)' }} /></div>}
            {products.map((p) => {
              const cost  = parseFloat(p.purchase_price) || 0;
              const sale  = parseFloat(p.retail_price)   || 0;
              const margin = sale > 0 ? ((sale - cost) / sale * 100).toFixed(0) : '—';
              const added = items.some((x) => x.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => !added && addProduct(p)}
                  disabled={added}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-xl text-right w-full transition-colors disabled:opacity-50"
                  style={{ background: 'var(--bg-muted)' }}
                  onMouseEnter={(e) => { if (!added) e.currentTarget.style.background = 'var(--bg-card)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      تكلفة: ${cost.toFixed(2)} · سعر: ${sale.toFixed(2)} · هامش: {margin}%
                    </div>
                  </div>
                  {!added && <Plus size={14} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 3 }} />}
                  {added  && <span className="text-[10px] font-black text-emerald-500 flex-shrink-0 mt-1">مضاف</span>}
                </button>
              );
            })}
            {products.length === 0 && !isLoading && (
              <div className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد نتائج</div>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div
          className="xl:col-span-2 rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20" style={{ color: 'var(--text-muted)' }}>
              <Calculator size={48} />
              <span className="text-sm">أضف أصناف من القائمة اليسرى للبدء</span>
            </div>
          ) : (
            <>
              {/* Header */}
              <div
                className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black border-b"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                <div className="col-span-3">الصنف</div>
                <div className="col-span-2 text-center">الكمية</div>
                <div className="col-span-2 text-center">سعر التكلفة $</div>
                <div className="col-span-2 text-center">سعر البيع $</div>
                <div className="col-span-2 text-center">الربح</div>
                <div className="col-span-1" />
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {items.map((item) => {
                  const profit  = (item.salePrice - item.costPrice) * item.quantity;
                  const margin  = item.salePrice > 0 ? ((item.salePrice - item.costPrice) / item.salePrice * 100) : 0;
                  const isLoss  = profit < 0;
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-2 px-4 py-3 items-center"
                    >
                      <div className="col-span-3">
                        <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                        <div className="text-[10px]" style={{ color: isLoss ? '#ef4444' : '#10b981' }}>
                          هامش: {margin.toFixed(1)}%
                        </div>
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number" min="0.001" step="1"
                          value={item.quantity}
                          onChange={(e) => update(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full text-center px-2 py-1.5 rounded-lg border text-sm font-bold focus:outline-none"
                          style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number" min="0" step="0.01"
                          value={item.costPrice}
                          onChange={(e) => update(item.id, 'costPrice', parseFloat(e.target.value) || 0)}
                          className="w-full text-center px-2 py-1.5 rounded-lg border text-sm font-bold focus:outline-none"
                          style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number" min="0" step="0.01"
                          value={item.salePrice}
                          onChange={(e) => update(item.id, 'salePrice', parseFloat(e.target.value) || 0)}
                          className="w-full text-center px-2 py-1.5 rounded-lg border text-sm font-bold focus:outline-none"
                          style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>

                      <div className="col-span-2 text-center">
                        <div
                          className="text-sm font-black tabular-nums"
                          style={{ color: isLoss ? '#ef4444' : '#10b981' }}
                        >
                          {isLoss ? '-' : '+'}{fmt(Math.abs(profit))}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          إجمالي: {fmt(item.salePrice * item.quantity)}
                        </div>
                      </div>

                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => remove(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Summary Bar */}
          {items.length > 0 && (
            <div
              className="grid grid-cols-4 gap-4 p-4 border-t"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}
            >
              {[
                { label: 'إجمالي التكلفة',   value: fmt(totalCost),    color: '#94a3b8' },
                { label: 'إجمالي الإيرادات', value: fmt(totalRevenue), color: '#3b82f6' },
                { label: 'صافي الربح',        value: (totalProfit < 0 ? '-' : '+') + fmt(Math.abs(totalProfit)), color: totalProfit >= 0 ? '#10b981' : '#ef4444' },
                { label: 'هامش الربح',        value: `${profitMargin.toFixed(1)}%`, color: profitMargin >= 0 ? '#10b981' : '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
                  <div className="text-base font-black tabular-nums" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ROI card */}
      {items.length > 0 && (
        <div
          className="mt-4 rounded-2xl p-5 flex items-center gap-6 flex-wrap"
          style={{ background: totalProfit >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${totalProfit >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}
        >
          <TrendingUp size={32} style={{ color: totalProfit >= 0 ? '#10b981' : '#ef4444', flexShrink: 0 }} />
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
              العائد على الاستثمار (ROI)
            </div>
            <div className="text-3xl font-black tabular-nums" style={{ color: totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
              {roi.toFixed(1)}%
            </div>
          </div>
          <div className="flex-1" />
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            لكل {fmt(totalCost)} مستثمر، ستربح {fmt(Math.max(0, totalProfit))}
          </div>
        </div>
      )}
    </div>
  );
}
