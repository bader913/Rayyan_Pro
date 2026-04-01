import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag, Printer, Filter, RefreshCw, Search } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import { useCurrency } from '../hooks/useCurrency.ts';

interface Product {
  id:             number;
  name:           string;
  barcode:        string | null;
  retail_price:   string;
  wholesale_price:string;
  stock_quantity: string;
  category_name:  string | null;
  unit:           string | null;
}

interface Category { id: number; name: string; }

type PrintMode = 'labels' | 'catalog';
type PriceType = 'retail' | 'wholesale' | 'both';

export default function PriceTagsPage() {
  const { fmt } = useCurrency();

  const [search,      setSearch]      = useState('');
  const [categoryId,  setCategoryId]  = useState('');
  const [lowStock,    setLowStock]    = useState(false);
  const [printMode,   setPrintMode]   = useState<PrintMode>('labels');
  const [priceType,   setPriceType]   = useState<PriceType>('retail');
  const [selected,    setSelected]    = useState<Set<number>>(new Set());
  const [selectAll,   setSelectAll]   = useState(false);

  const { data: productData, isLoading } = useQuery({
    queryKey: ['products-tags', search, categoryId, lowStock],
    queryFn: () => apiClient.get('/products', {
      params: { q: search, category_id: categoryId || undefined, limit: 200 },
    }).then((r) => r.data as { products: Product[] }),
  });

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn:  () => apiClient.get('/categories').then((r) => r.data as { categories: Category[] }),
  });

  const products = (productData?.products ?? []).filter((p) =>
    !lowStock || parseFloat(p.stock_quantity) <= 5
  );

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSelectAll(false);
  };

  const handleSelectAll = () => {
    if (selectAll) { setSelected(new Set()); setSelectAll(false); }
    else { setSelected(new Set(products.map((p) => p.id))); setSelectAll(true); }
  };

  const toPrint = selected.size > 0 ? products.filter((p) => selected.has(p.id)) : products;

  const priceLabel = (p: Product): string => {
    const r = parseFloat(p.retail_price) || 0;
    const w = parseFloat(p.wholesale_price) || 0;
    if (priceType === 'retail')    return `$${r.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (priceType === 'wholesale') return `$${w.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    return `مفرق: $${r.toFixed(2)} | جملة: $${w.toFixed(2)}`;
  };

  const handlePrint = () => {
    if (!toPrint.length) return;

    if (printMode === 'labels') {
      const labels = toPrint.map((p) => `
        <div class="label">
          <div class="product-name">${p.name}</div>
          <div class="product-price">${priceLabel(p)}</div>
          ${p.barcode ? `<div class="product-barcode">${p.barcode}</div>` : ''}
          ${p.category_name ? `<div class="product-cat">${p.category_name}</div>` : ''}
        </div>
      `).join('');
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`
        <html><head><title>ملصقات الأسعار</title>
        <style>
          body { margin: 0; font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; }
          .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; }
          .label { border: 1.5px solid #334155; border-radius: 8px; padding: 8px 10px; width: 120px; display: flex; flex-direction: column; align-items: center; text-align: center; break-inside: avoid; }
          .product-name { font-size: 9px; font-weight: 700; color: #1e293b; line-height: 1.3; margin-bottom: 4px; }
          .product-price { font-size: 13px; font-weight: 900; color: #059669; }
          .product-barcode { font-size: 8px; color: #94a3b8; margin-top: 3px; }
          .product-cat { font-size: 7px; color: #94a3b8; margin-top: 2px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
          @media print { @page { margin: 0.5cm; size: A4; } }
        </style></head>
        <body><div class="grid">${labels}</div>
        <script>window.onload=()=>{ window.print(); window.close(); }<\/script>
        </body></html>`);
      win.document.close();
    } else {
      const rows = toPrint.map((p, i) => `
        <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
          <td>${i + 1}</td>
          <td style="font-weight:700">${p.name}</td>
          <td>${p.category_name || '—'}</td>
          <td style="font-weight:900;color:#059669">${priceLabel(p)}</td>
          <td>${parseFloat(p.stock_quantity).toLocaleString()} ${p.unit || ''}</td>
          <td style="font-family:monospace;font-size:11px">${p.barcode || '—'}</td>
        </tr>
      `).join('');
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`
        <html><head><title>كتالوج المنتجات</title>
        <style>
          body { margin: 0; font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; font-size:12px; }
          .header { padding: 20px; background: #1e293b; color: white; }
          .header h1 { margin: 0; font-size: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #334155; color: white; padding: 8px 12px; text-align: right; font-size: 11px; }
          td { padding: 7px 12px; border-bottom: 1px solid #e2e8f0; }
          @media print { @page { margin: 1cm; size: A4 landscape; } }
        </style></head>
        <body>
        <div class="header"><h1>كتالوج المنتجات (${toPrint.length} صنف)</h1></div>
        <table>
          <thead><tr><th>#</th><th>اسم المنتج</th><th>الفئة</th><th>السعر</th><th>المخزون</th><th>الباركود</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.onload=()=>{ window.print(); window.close(); }<\/script>
        </body></html>`);
      win.document.close();
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text-heading)' }}>
          طباعة الأسعار والملصقات
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          اطبع ملصقات الرفوف أو كتالوج كامل لمخزون المحل
        </p>
      </div>

      {/* Controls */}
      <div
        className="rounded-2xl p-4 mb-4 flex flex-wrap gap-4 items-end"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Print mode */}
        <div>
          <div className="text-xs font-black mb-1.5" style={{ color: 'var(--text-muted)' }}>نوع الطباعة</div>
          <div className="flex gap-2">
            {(['labels', 'catalog'] as PrintMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setPrintMode(m)}
                className="px-4 py-2 rounded-xl text-sm font-black transition-colors"
                style={printMode === m
                  ? { background: 'var(--primary)', color: '#fff' }
                  : { background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
              >
                {m === 'labels' ? '🏷️ ملصقات الرفوف' : '📋 كتالوج'}
              </button>
            ))}
          </div>
        </div>

        {/* Price type */}
        <div>
          <div className="text-xs font-black mb-1.5" style={{ color: 'var(--text-muted)' }}>نوع السعر</div>
          <select
            value={priceType}
            onChange={(e) => setPriceType(e.target.value as PriceType)}
            className="px-3 py-2 rounded-xl border text-sm font-bold focus:outline-none"
            style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="retail">سعر المفرق فقط</option>
            <option value="wholesale">سعر الجملة فقط</option>
            <option value="both">كلاهما</option>
          </select>
        </div>

        {/* Category */}
        <div>
          <div className="text-xs font-black mb-1.5" style={{ color: 'var(--text-muted)' }}>الفئة</div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm font-bold focus:outline-none"
            style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="">كل الفئات</option>
            {(catData?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[160px]">
          <div className="text-xs font-black mb-1.5" style={{ color: 'var(--text-muted)' }}>بحث</div>
          <div className="relative">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم المنتج..."
              className="w-full pr-8 pl-3 py-2 rounded-xl border text-sm focus:outline-none"
              style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Low stock filter */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => setLowStock(e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-600"
          />
          <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
            مخزون منخفض فقط
          </span>
        </label>

        {/* Print button */}
        <button
          onClick={handlePrint}
          disabled={!toPrint.length}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-black disabled:opacity-40 mr-auto"
          style={{ background: 'var(--primary)' }}
        >
          <Printer size={16} />
          طباعة ({toPrint.length})
        </button>
      </div>

      {/* Products Grid */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded accent-emerald-600"
            />
            <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
              تحديد الكل ({products.length})
            </span>
          </label>
          {selected.size > 0 && (
            <span className="text-xs font-black" style={{ color: 'var(--primary)' }}>
              {selected.size} محدد
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12" style={{ background: 'var(--bg-card)' }}>
            <RefreshCw className="animate-spin" size={28} style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px"
            style={{ background: 'var(--border)' }}
          >
            {products.map((p) => {
              const isChecked = selected.has(p.id);
              const stock = parseFloat(p.stock_quantity);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  className="p-3 text-right flex flex-col gap-1.5 transition-colors"
                  style={{
                    background: isChecked ? 'rgba(var(--primary-rgb),0.08)' : 'var(--bg-card)',
                    outline: isChecked ? '2px solid var(--primary)' : 'none',
                    outlineOffset: '-2px',
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="text-xs font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {p.name}
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded flex-shrink-0 mt-0.5 accent-emerald-600"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {p.category_name && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded self-start"
                      style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                    >
                      {p.category_name}
                    </span>
                  )}
                  <div className="text-sm font-black" style={{ color: '#059669' }}>
                    {priceLabel(p)}
                  </div>
                  <div
                    className="text-[10px] font-bold"
                    style={{ color: stock <= 5 ? '#ef4444' : 'var(--text-muted)' }}
                  >
                    مخزون: {stock.toLocaleString()}
                  </div>
                </button>
              );
            })}
            {products.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                <Tag size={40} />
                <span className="text-sm">لا توجد منتجات</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
