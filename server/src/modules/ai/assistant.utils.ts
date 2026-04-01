export function formatNumber(value: number) {
  return new Intl.NumberFormat('ar-EG-u-nu-latn', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function formatMoney(value: number, currency: string) {
  const digits = currency === 'SYP' ? 0 : 2;

  return `${new Intl.NumberFormat('ar-EG-u-nu-latn', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)} ${currency}`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'غير معروف';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizeArabicText(input: string) {
  let text = String(input || '').toLowerCase().trim();

  text = text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const corrections: Array<[string, string]> = [
    ['المبيغات', 'المبيعات'],
    ['مبيغات', 'مبيعات'],
    ['المبيعهات', 'المبيعات'],
    ['الارباح', 'الربح'],
    ['ارباح', 'ربح'],
    ['الخالصة', 'النافده'],
    ['الخالصه', 'النافده'],
    ['خلصانه', 'نافده'],
    ['المخزون الخالص', 'المخزون النافد'],
    ['النواقص', 'منخفض المخزون'],
    ['الناقص', 'منخفض المخزون'],
    ['قديش', 'كم'],
    ['بكم', 'كم سعر'],
  ];

  for (const [from, to] of corrections) {
    text = text.replaceAll(from, to);
  }

  return text;
}

export function hasAny(normalized: string, ...terms: string[]) {
  return terms.some((term) => normalized.includes(term));
}

export function escapeSql(value: string) {
  return String(value || '').replace(/'/g, "''");
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripStandaloneTerms(text: string, terms: string[]) {
  let result = ` ${String(text || '')} `;

  for (const term of terms) {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(term)}(?=\\s|$)`, 'g');
    result = result.replace(pattern, ' ');
  }

  return result.replace(/\s+/g, ' ').trim();
}

export function cleanSearchPhrase(text: string) {
  const stripped = stripStandaloneTerms(String(text || ''), [
    'كم',
    'سعر',
    'كم سعر',
    'مخزون',
    'رصيد',
    'متوفر',
    'المتوفر',
    'من',
    'هو',
    'هي',
    'المنتج',
    'الصنف',
    'بضاعة',
    'عندي',
    'عندنا',
    'لو',
    'سمحت',
    'ورجيني',
    'طلعلي',
    'اعطيني',
    'اعطني',
    'شو',
    'ما',
    'في',
    'كمية',
    'قديش',
    'بكم',
  ]);

  return stripped
    .replace(/[؟?،,:;!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}