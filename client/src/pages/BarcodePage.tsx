import React, { useState, useEffect, useRef, useCallback } from 'react';
import JsBarcode from 'jsbarcode';
import { useQuery } from '@tanstack/react-query';
import { Search, Printer, Barcode, Plus, X, RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client.ts';

interface Product {
  id:             number;
  name:           string;
  barcode:        string | null;
  purchase_price: string;
  retail_price:   string;
  category_name:  string | null;
}

interface BarcodeItem {
  id:      number;
  name:    string;
  barcode: string;
  price:   string;
  copies:  number;
}

function BarcodePreview({ barcode, name }: { barcode: string; name: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try {
      JsBarcode(svgRef.current, barcode, {
        format: 'CODE128',
        width: 1.8,
        height: 50,
        displayValue: true,
        fontSize: 11,
        margin: 6,
        background: '#ffffff',
        lineColor: '#1e293b',
      });
    } catch {}
  }, [barcode]);

  if (!barcode) return (
    <div className="flex items-center justify-center h-16 text-xs" style={{ color: 'var(--text-muted)' }}>
      لا يوجد باركود
    </div>
  );

  return (
    <div className="bg-white rounded-lg p-2 inline-block">
      <svg ref={svgRef} />
      <div className="text-center text-[10px] text-slate-500 mt-1 max-w-[180px] truncate">{name}</div>
    </div>
  );
}

export default function BarcodePage() {
  const [search,    setSearch]    = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selected,  setSelected]  = useState<BarcodeItem[]>([]);
  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: productData, isLoading } = useQuery({
    queryKey: ['products-barcode', debouncedQ],
    queryFn: () => apiClient.get('/products', { params: { q: debouncedQ, limit: 30 } })
      .then((r) => r.data as { products: Product[] }),
    enabled: debouncedQ.length >= 0,
  });

  const addProduct = useCallback((p: Product) => {
    if (!p.barcode) return;
    setSelected((prev) => {
      const existing = prev.find((x) => x.id === p.id);
      if (existing) return prev.map((x) => x.id === p.id ? { ...x, copies: x.copies + 1 } : x);
      return [...prev, { id: p.id, name: p.name, barcode: p.barcode!, price: p.retail_price, copies: 1 }];
    });
  }, []);

  const addCustom = () => {
    if (!customCode.trim()) return;
    const id = Date.now();
    setSelected((prev) => [...prev, { id, name: customName || customCode, barcode: customCode.trim(), price: '', copies: 1 }]);
    setCustomCode(''); setCustomName('');
  };

  const removeItem = (id: number) => setSelected((prev) => prev.filter((x) => x.id !== id));
  const setCopies  = (id: number, n: number) => setSelected((prev) => prev.map((x) => x.id === id ? { ...x, copies: Math.max(1, n) } : x));

  const handlePrint = () => {
    if (!selected.length) return;
    const items: string[] = [];
    selected.forEach((item) => {
      for (let i = 0; i < item.copies; i++) {
        items.push(`
          <div class="label">
            <svg id="bc-${item.id}-${i}" class="barcode-svg"></svg>
            <div class="product-name">${item.name}</div>
            ${item.price ? `<div class="product-price">$ ${parseFloat(item.price).toLocaleString()}</div>` : ''}
          </div>
        `);
      }
    });

    const barcodeData = selected.map((item) =>
      `{ id: "${item.id}", barcode: "${item.barcode}", copies: ${item.copies} }`
    ).join(',');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>طباعة باركود</title>
      <style>
        body { margin: 0; font-family: sans-serif; direction: rtl; }
        .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; }
        .label { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; break-inside: avoid; }
        .barcode-svg { display: block; }
        .product-name { font-size: 10px; max-width: 180px; text-align: center; color: #334155; margin-top: 2px; }
        .product-price { font-size: 12px; font-weight: 900; color: #059669; }
        @media print { @page { margin: 1cm; } }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      </head>
      <body><div class="grid">${items.join('')}</div>
      <script>
        const data = [${barcodeData}];
        let svgIdx = 0;
        data.forEach(d => {
          for(let i=0;i<d.copies;i++){
            const svg = document.getElementById('bc-'+d.id+'-'+i);
            if(svg) JsBarcode(svg, d.barcode, { format:'CODE128', width:1.8, height:50, fontSize:11, margin:4, background:'#fff', lineColor:'#1e293b' });
            svgIdx++;
          }
        });
        setTimeout(() => { window.print(); window.close(); }, 500);
      <\/script>
      </body></html>`);
    win.document.close();
  };

  const products: Product[] = productData?.products ?? [];

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text-heading)' }}>
          توليد الباركود
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          أنشئ وأطبع باركود للمنتجات أو أدخل رموزاً مخصصة
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Product Search + Custom */}
        <div className="flex flex-col gap-4">
          {/* Search */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-black mb-3" style={{ color: 'var(--text-muted)' }}>
              بحث في المنتجات
            </div>
            <div className="relative mb-3">
              <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن منتج..."
                className="w-full pr-9 pl-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
              {isLoading && <div className="text-center py-4"><RefreshCw className="animate-spin inline" size={18} style={{ color: 'var(--text-muted)' }} /></div>}
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => p.barcode && addProduct(p)}
                  disabled={!p.barcode}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-colors w-full disabled:opacity-40"
                  style={{
                    background: 'var(--bg-muted)',
                    color: p.barcode ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                  onMouseEnter={(e) => { if (p.barcode) e.currentTarget.style.background = 'var(--bg-card)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
                >
                  <Barcode size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{p.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {p.barcode || 'لا يوجد باركود'}
                    </div>
                  </div>
                  {p.barcode && <Plus size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                </button>
              ))}
              {products.length === 0 && !isLoading && (
                <div className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                  لا توجد نتائج
                </div>
              )}
            </div>
          </div>

          {/* Custom barcode */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-black mb-3" style={{ color: 'var(--text-muted)' }}>
              إضافة باركود مخصص
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                placeholder="رمز الباركود..."
                className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="اسم المنتج (اختياري)..."
                className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={addCustom}
                disabled={!customCode.trim()}
                className="w-full py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-40"
                style={{ background: 'var(--primary)' }}
              >
                إضافة للقائمة
              </button>
            </div>
          </div>
        </div>

        {/* Right: Selected items + Print */}
        <div className="flex flex-col gap-4">
          <div
            className="rounded-2xl p-4 flex-1"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: '300px' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-black" style={{ color: 'var(--text-muted)' }}>
                قائمة الطباعة
              </div>
              {selected.length > 0 && (
                <span
                  className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--primary)', color: '#fff' }}
                >
                  {selected.reduce((s, x) => s + x.copies, 0)} قطعة
                </span>
              )}
            </div>

            {selected.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-3 py-12"
                style={{ color: 'var(--text-muted)' }}
              >
                <Barcode size={40} />
                <span className="text-sm">أضف منتجات من القائمة</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
                {selected.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--bg-muted)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                      <BarcodePreview barcode={item.barcode} name={item.name} />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setCopies(item.id, item.copies - 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center font-black"
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>−</button>
                      <span className="w-6 text-center text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{item.copies}</span>
                      <button onClick={() => setCopies(item.id, item.copies + 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center font-black"
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>+</button>
                      <button onClick={() => removeItem(item.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600"
                        style={{ background: 'var(--bg-card)' }}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handlePrint}
            disabled={!selected.length}
            className="w-full py-4 rounded-xl text-white font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: 'var(--primary)' }}
          >
            <Printer size={18} />
            طباعة ({selected.reduce((s, x) => s + x.copies, 0)} قطعة)
          </button>
        </div>
      </div>
    </div>
  );
}
