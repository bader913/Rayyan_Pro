import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../api/settings.ts';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';

const CURRENCIES = [
  { code: 'USD', symbol: '$',    name: 'دولار أمريكي',  flag: '🇺🇸' },
  { code: 'SYP', symbol: 'ل.س',  name: 'ليرة سورية',   flag: '🇸🇾' },
  { code: 'TRY', symbol: 'TL',   name: 'ليرة تركية',   flag: '🇹🇷' },
  { code: 'SAR', symbol: 'ر.س',  name: 'ريال سعودي',   flag: '🇸🇦' },
  { code: 'AED', symbol: 'د.إ',  name: 'درهم إماراتي', flag: '🇦🇪' },
];

export default function CurrencyCalcPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 0,
  });

  const [amount, setAmount]   = useState<string>('1');
  const [from,   setFrom]     = useState('USD');
  const [to,     setTo]       = useState('SYP');

  const getRate = (code: string): number => {
    if (code === 'USD') return 1;
    const key = `usd_to_${code.toLowerCase()}`;
    return parseFloat(settings?.[key] ?? '1') || 1;
  };

  const convert = (val: number, fromCode: string, toCode: string): number => {
    const usd = val / getRate(fromCode);
    return usd * getRate(toCode);
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

  const inputVal = parseFloat(amount) || 0;
  const result   = convert(inputVal, from, to);

  const allConversions = CURRENCIES.filter((c) => c.code !== from).map((c) => ({
    ...c,
    value: convert(inputVal, from, c.code),
  }));

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text-heading)' }}>
          محول العملات
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          يعتمد على أسعار الصرف المضبوطة في إعدادات البرنامج
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="animate-spin text-emerald-500" size={32} />
        </div>
      ) : (
        <>
          {/* Main Converter Card */}
          <div
            className="rounded-2xl p-6 mb-4 shadow-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex gap-3 items-end flex-wrap">
              {/* Amount */}
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  المبلغ
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-lg font-black focus:outline-none transition-colors"
                  style={{
                    background: 'var(--bg-muted)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* From */}
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  من
                </label>
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border font-bold focus:outline-none"
                  style={{
                    background: 'var(--bg-muted)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Swap */}
              <button
                onClick={() => { setFrom(to); setTo(from); }}
                className="p-3 rounded-xl transition-colors hover:opacity-80 self-end mb-0.5"
                style={{ background: 'var(--primary)', color: '#fff' }}
                title="عكس العملتين"
              >
                <ArrowLeftRight size={18} />
              </button>

              {/* To */}
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  إلى
                </label>
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border font-bold focus:outline-none"
                  style={{
                    background: 'var(--bg-muted)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Result */}
            <div
              className="mt-5 rounded-xl p-5 text-center"
              style={{ background: 'var(--bg-muted)' }}
            >
              <div className="text-sm font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
                النتيجة
              </div>
              <div className="text-4xl font-black tabular-nums" style={{ color: 'var(--primary)' }}>
                {fmt(result)}{' '}
                <span className="text-2xl">{CURRENCIES.find((c) => c.code === to)?.symbol}</span>
              </div>
              <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                {fmt(inputVal)} {CURRENCIES.find((c) => c.code === from)?.symbol} =&nbsp;
                {fmt(result)} {CURRENCIES.find((c) => c.code === to)?.symbol}
              </div>
            </div>
          </div>

          {/* All Conversions */}
          <div className="grid grid-cols-2 gap-3">
            {allConversions.map((c) => (
              <div
                key={c.code}
                className="rounded-xl p-4 flex items-center gap-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <span className="text-2xl">{c.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                    {c.code} · {c.name}
                  </div>
                  <div className="text-lg font-black tabular-nums" style={{ color: 'var(--text-heading)' }}>
                    {fmt(c.value)} <span className="text-sm font-bold">{c.symbol}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Exchange rates info */}
          <div
            className="mt-4 rounded-xl p-4"
            style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-black mb-2" style={{ color: 'var(--text-muted)' }}>
              أسعار الصرف الحالية (مقابل الدولار)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CURRENCIES.filter((c) => c.code !== 'USD').map((c) => (
                <div key={c.code} className="flex justify-between items-center">
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                    1 $ =
                  </span>
                  <span className="text-xs font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {fmt(getRate(c.code))} {c.symbol}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
              * لتعديل أسعار الصرف اذهب إلى الإعدادات &gt; العملات
            </div>
          </div>
        </>
      )}
    </div>
  );
}
