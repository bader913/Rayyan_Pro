export type CurrencyCode = 'USD' | 'SYP' | 'TRY' | 'SAR' | 'AED';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  SYP: 'ل.س',
  TRY: 'TL',
  SAR: 'ر.س',
  AED: 'د.إ',
};

export type ExchangeRates = Record<CurrencyCode, number>;

export const getRatesFromSettings = (settings: Record<string, string>): ExchangeRates => ({
  USD: 1,
  SYP: Number(settings.usd_to_syp || 11000),
  TRY: Number(settings.usd_to_try || 44),
  SAR: Number(settings.usd_to_sar || 3.75),
  AED: Number(settings.usd_to_aed || 3.67),
});

export const convertFromUSD = (
  amountUSD: number,
  target: CurrencyCode,
  rates: ExchangeRates
): number => {
  return amountUSD * rates[target];
};

export const convertToUSD = (
  amount: number,
  source: CurrencyCode,
  rates: ExchangeRates
): number => {
  if (rates[source] === 0) return 0;
  return amount / rates[source];
};

export const getRateFromUSD = (
  currency: CurrencyCode,
  rates: ExchangeRates
): number => rates[currency] ?? 1;
