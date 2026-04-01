import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../api/settings.ts';

const SYMBOLS: Record<string, string> = {
  USD: '$',
  SYP: 'ل.س',
  TRY: 'TL',
  SAR: 'ر.س',
  AED: 'د.إ',
};

interface CurrencyContext {
  currency: string;
  symbol:   string;
  rate:     number;
  /** Format a USD value → display currency string (e.g. "115,000 ل.س") */
  fmt: (usdVal: number | string | null | undefined, dec?: number) => string;
  /** Convert display-currency INPUT back to USD for API storage */
  toUSD: (displayVal: number) => number;
  /** Convert USD amount to display-currency number (for input defaultValues) */
  toDisplay: (usdVal: number) => number;
}

export function useCurrency(): CurrencyContext {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 0,
  });

  const currency = settings?.currency ?? 'USD';
  const rateKey  = `usd_to_${currency.toLowerCase()}`;
  const rate     = currency === 'USD' ? 1 : (parseFloat(settings?.[rateKey] ?? '1') || 1);
  const symbol   = SYMBOLS[currency] ?? currency;

  const fmt = (usdVal: number | string | null | undefined, dec = 2): string => {
    if (usdVal == null || usdVal === '') return '—';
    const converted = parseFloat(String(usdVal)) * rate;
    if (isNaN(converted)) return '—';
    const formatted = converted.toLocaleString('en-US', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
    return `${formatted} ${symbol}`;
  };

  const toUSD     = (displayVal: number) => displayVal / rate;
  const toDisplay = (usdVal: number)     => usdVal * rate;

  return { currency, symbol, rate, fmt, toUSD, toDisplay };
}
