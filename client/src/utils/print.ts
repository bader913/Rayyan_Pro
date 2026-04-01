import type { Sale } from '../api/pos.ts';

const fmtNum = (n: string | number, min = 0, max = 2) =>
  parseFloat(String(n)).toLocaleString('en-US', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

const toNumber = (v: string | number | null | undefined) =>
  parseFloat(String(v ?? 0)) || 0;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقداً',
  card: 'شام كاش',
  credit: 'آجل',
  mixed: 'مختلط',
};

const RETURN_METHOD_LABELS: Record<string, string> = {
  cash_refund: 'رد نقدي',
  debt_discount: 'خصم من الدين',
  stock_only: 'استرداد مخزون فقط',
};

export interface PrintCurrency {
  symbol: string;
  rate: number;
}

export interface SaleReceiptItemPrintData {
  product_name: string;
  quantity: string | number;
  unit?: string | null;
  unit_price: string | number;
  total_price?: string | number;
  item_discount?: string | number;
  is_weighted?: boolean;
  price_type?: string | null;
}

export interface SaleReceiptPrintData {
  invoice_number: string;
  created_at: string;
  customer_name?: string | null;
  sale_type?: string | null;
  payment_method?: string | null;
  total_amount: string | number;
  paid_amount?: string | number;
  sale_discount?: string | number;
  notes?: string | null;
  cashier_name?: string | null;
  terminal_name?: string | null;
  items: SaleReceiptItemPrintData[];
}

export interface SaleReturnReceiptItemPrintData {
  product_name: string;
  quantity: string | number;
  unit?: string | null;
  unit_price: string | number;
  total_price?: string | number;
}

export interface SaleReturnReceiptPrintData {
  return_number: string;
  sale_invoice?: string | null;
  created_at: string;
  customer_name?: string | null;
  total_amount: string | number;
  return_method?: string | null;
  reason?: string | null;
  notes?: string | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  items: SaleReturnReceiptItemPrintData[];
}
export interface PurchaseReceiptItemPrintData {
  product_name: string;
  quantity: string | number;
  unit?: string | null;
  unit_price: string | number;
  total_price?: string | number;
}

export interface PurchaseReceiptPrintData {
  invoice_number: string;
  created_at: string;
  supplier_name?: string | null;
  total_amount: string | number;
  paid_amount?: string | number;
  due_amount?: string | number;
  notes?: string | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  items: PurchaseReceiptItemPrintData[];
}
export interface PurchaseReturnReceiptItemPrintData {
  product_name: string;
  quantity: string | number;
  unit?: string | null;
  unit_price: string | number;
  total_price?: string | number;
}

export interface PurchaseReturnReceiptPrintData {
  return_number: string;
  purchase_invoice?: string | null;
  created_at: string;
  supplier_name?: string | null;
  total_amount: string | number;
  return_method?: string | null;
  reason?: string | null;
  notes?: string | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  items: PurchaseReturnReceiptItemPrintData[];
}

function openPrintHtml(html: string, width = 420, height = 640) {
  const w = window.open('', '_blank', `width=${width},height=${height}`);
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function buildSaleReceiptHtml(
  sale: SaleReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  const { symbol, rate } = currency;

  const fmtC = (usd: string | number): string =>
    `${fmtNum(toNumber(usd) * rate)} ${symbol}`;

  const subtotal = sale.items.reduce(
    (sum, item) => sum + (toNumber(item.quantity) * toNumber(item.unit_price)),
    0
  );

  const totalAmount = toNumber(sale.total_amount);
  const paidAmount = toNumber(sale.paid_amount);
  const saleDiscount = toNumber(sale.sale_discount);
  const due = totalAmount - paidAmount > 0.001 ? totalAmount - paidAmount : 0;
  const change = paidAmount - totalAmount > 0.001 ? paidAmount - totalAmount : 0;

  const itemRows = sale.items
    .map((item) => {
      const qty = toNumber(item.quantity);
      const unit = item.is_weighted
        ? `${qty.toFixed(3)} ${item.unit || 'كغ'}`
        : `${fmtNum(qty, 0, 3)} ${item.unit || ''}`.trim();

      const itemDiscount = toNumber(item.item_discount);
      const total =
        item.total_price !== undefined
          ? toNumber(item.total_price)
          : (qty * toNumber(item.unit_price)) - itemDiscount;

      const disc =
        itemDiscount > 0
          ? `<span style="color:#ef4444;font-size:11px;"> (-${fmtC(itemDiscount)})</span>`
          : '';

      return `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;font-size:13px;">
            ${item.product_name}
            ${item.price_type === 'wholesale' ? '<span style="font-size:10px;color:#0891b2;"> (جملة)</span>' : ''}
            ${item.price_type === 'custom' ? '<span style="font-size:10px;color:#7c3aed;"> (مخصص)</span>' : ''}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">${unit}</td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">${fmtC(item.unit_price)}</td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:left;font-size:13px;font-weight:700;">
            ${fmtC(total)}${disc}
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>فاتورة ${sale.invoice_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; font-size:13px; color:#1e293b; }
  .page { max-width:340px; margin:0 auto; padding:16px; }
  h1 { font-size:18px; font-weight:900; color:#059669; text-align:center; }
  .sub { text-align:center; font-size:11px; color:#64748b; margin-bottom:12px; }
  .divider { border:none; border-top:2px dashed #e2e8f0; margin:10px 0; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:11px; color:#64748b; font-weight:700; padding:4px; border-bottom:2px solid #e2e8f0; }
  .totals td { padding:4px 4px; font-size:13px; }
  .totals .big { font-size:16px; font-weight:900; color:#059669; }
  .footer { text-align:center; font-size:11px; color:#94a3b8; margin-top:14px; }
  .note { margin-top:10px; padding:8px; border:1px dashed #cbd5e1; border-radius:10px; font-size:11px; color:#475569; }
  @media print {
    @page { margin:6mm; }
    body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>${storeName}</h1>
  <div class="sub">فاتورة بيع${sale.terminal_name ? ` · ${sale.terminal_name}` : ''}</div>
  <hr class="divider"/>

  <table style="margin-bottom:4px;">
    <tr>
      <td style="font-size:11px;color:#64748b;">رقم الفاتورة</td>
      <td style="font-weight:700;text-align:left;">${sale.invoice_number}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#64748b;">التاريخ</td>
      <td style="text-align:left;font-size:12px;">${new Date(sale.created_at).toLocaleString('en-US')}</td>
    </tr>
    ${sale.cashier_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">الكاشير</td>
      <td style="text-align:left;font-size:12px;">${sale.cashier_name}</td>
    </tr>` : ''}
    ${sale.customer_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">العميل</td>
      <td style="text-align:left;font-size:12px;">${sale.customer_name}</td>
    </tr>` : ''}
    <tr>
      <td style="font-size:11px;color:#64748b;">نوع البيع</td>
      <td style="text-align:left;font-size:12px;">${sale.sale_type === 'wholesale' ? 'جملة' : 'مفرق'}</td>
    </tr>
  </table>

  <hr class="divider"/>

  <table>
    <thead>
      <tr>
        <th style="text-align:right;">المنتج</th>
        <th style="text-align:center;">الكمية</th>
        <th style="text-align:center;">السعر</th>
        <th style="text-align:left;">المجموع</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr class="divider"/>

  <table class="totals">
    <tr>
      <td>المجموع الفرعي</td>
      <td style="text-align:left;">${fmtC(subtotal)}</td>
    </tr>
    ${saleDiscount > 0 ? `
    <tr>
      <td style="color:#ef4444;">الخصم</td>
      <td style="text-align:left;color:#ef4444;">- ${fmtC(saleDiscount)}</td>
    </tr>` : ''}
    <tr>
      <td class="big">الإجمالي</td>
      <td class="big" style="text-align:left;">${fmtC(totalAmount)}</td>
    </tr>
    <tr>
      <td style="color:#64748b;">طريقة الدفع</td>
      <td style="text-align:left;font-weight:700;">${PAYMENT_LABELS[sale.payment_method || ''] ?? sale.payment_method ?? '—'}</td>
    </tr>
    ${paidAmount > 0 ? `
    <tr>
      <td>المدفوع</td>
      <td style="text-align:left;">${fmtC(paidAmount)}</td>
    </tr>` : ''}
    ${change > 0 ? `
    <tr>
      <td style="color:#059669;">الباقي للعميل</td>
      <td style="text-align:left;color:#059669;font-weight:700;">${fmtC(change)}</td>
    </tr>` : ''}
    ${due > 0 ? `
    <tr>
      <td style="color:#ef4444;">المتبقي (آجل)</td>
      <td style="text-align:left;color:#ef4444;font-weight:700;">${fmtC(due)}</td>
    </tr>` : ''}
  </table>

  ${sale.notes ? `<div class="note"><strong>ملاحظات:</strong> ${sale.notes}</div>` : ''}

  <hr class="divider"/>
  <div class="footer">شكراً لزيارتكم · ${storeName}</div>
</div>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;
}

function buildSaleReturnReceiptHtml(
  saleReturn: SaleReturnReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  const { symbol, rate } = currency;

  const fmtC = (usd: string | number): string =>
    `${fmtNum(toNumber(usd) * rate)} ${symbol}`;

  const itemRows = saleReturn.items
    .map((item) => {
      const qty = toNumber(item.quantity);
      const total =
        item.total_price !== undefined
          ? toNumber(item.total_price)
          : qty * toNumber(item.unit_price);

      return `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;font-size:13px;">
            ${item.product_name}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">
            ${fmtNum(qty, 0, 3)} ${item.unit || ''}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">
            ${fmtC(item.unit_price)}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:left;font-size:13px;font-weight:700;">
            ${fmtC(total)}
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>مرتجع ${saleReturn.return_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; font-size:13px; color:#1e293b; }
  .page { max-width:340px; margin:0 auto; padding:16px; }
  h1 { font-size:18px; font-weight:900; color:#dc2626; text-align:center; }
  .sub { text-align:center; font-size:11px; color:#64748b; margin-bottom:12px; }
  .divider { border:none; border-top:2px dashed #e2e8f0; margin:10px 0; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:11px; color:#64748b; font-weight:700; padding:4px; border-bottom:2px solid #e2e8f0; }
  .totals td { padding:4px 4px; font-size:13px; }
  .totals .big { font-size:16px; font-weight:900; color:#dc2626; }
  .footer { text-align:center; font-size:11px; color:#94a3b8; margin-top:14px; }
  .note { margin-top:10px; padding:8px; border:1px dashed #cbd5e1; border-radius:10px; font-size:11px; color:#475569; }
  @media print {
    @page { margin:6mm; }
    body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>${storeName}</h1>
  <div class="sub">سند مرتجع بيع</div>
  <hr class="divider"/>

  <table style="margin-bottom:4px;">
    <tr>
      <td style="font-size:11px;color:#64748b;">رقم المرتجع</td>
      <td style="font-weight:700;text-align:left;">${saleReturn.return_number}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#64748b;">التاريخ</td>
      <td style="text-align:left;font-size:12px;">${new Date(saleReturn.created_at).toLocaleString('en-US')}</td>
    </tr>
    ${saleReturn.sale_invoice ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">فاتورة البيع</td>
      <td style="text-align:left;font-size:12px;">${saleReturn.sale_invoice}</td>
    </tr>` : ''}
    ${saleReturn.customer_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">العميل</td>
      <td style="text-align:left;font-size:12px;">${saleReturn.customer_name}</td>
    </tr>` : ''}
    ${saleReturn.warehouse_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">المستودع</td>
      <td style="text-align:left;font-size:12px;">${saleReturn.warehouse_name}${saleReturn.warehouse_code ? ` (${saleReturn.warehouse_code})` : ''}</td>
    </tr>` : ''}
    <tr>
      <td style="font-size:11px;color:#64748b;">طريقة الإرجاع</td>
      <td style="text-align:left;font-size:12px;">${RETURN_METHOD_LABELS[saleReturn.return_method || ''] ?? saleReturn.return_method ?? '—'}</td>
    </tr>
  </table>

  <hr class="divider"/>

  <table>
    <thead>
      <tr>
        <th style="text-align:right;">المنتج</th>
        <th style="text-align:center;">الكمية</th>
        <th style="text-align:center;">السعر</th>
        <th style="text-align:left;">المجموع</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr class="divider"/>

  <table class="totals">
    <tr>
      <td class="big">إجمالي المرتجع</td>
      <td class="big" style="text-align:left;">${fmtC(saleReturn.total_amount)}</td>
    </tr>
  </table>

  ${saleReturn.reason ? `<div class="note"><strong>السبب:</strong> ${saleReturn.reason}</div>` : ''}
  ${saleReturn.notes ? `<div class="note"><strong>ملاحظات:</strong> ${saleReturn.notes}</div>` : ''}

  <hr class="divider"/>
  <div class="footer">تمت معالجة المرتجع · ${storeName}</div>
</div>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;
}
function buildPurchaseReceiptHtml(
  purchase: PurchaseReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  const { symbol, rate } = currency;

  const fmtC = (usd: string | number): string =>
    `${fmtNum(toNumber(usd) * rate)} ${symbol}`;

  const itemRows = purchase.items
    .map((item) => {
      const qty = toNumber(item.quantity);
      const total =
        item.total_price !== undefined
          ? toNumber(item.total_price)
          : qty * toNumber(item.unit_price);

      return `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;font-size:13px;">
            ${item.product_name}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">
            ${fmtNum(qty, 0, 3)} ${item.unit || ''}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">
            ${fmtC(item.unit_price)}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:left;font-size:13px;font-weight:700;">
            ${fmtC(total)}
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>شراء ${purchase.invoice_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; font-size:13px; color:#1e293b; }
  .page { max-width:340px; margin:0 auto; padding:16px; }
  h1 { font-size:18px; font-weight:900; color:#059669; text-align:center; }
  .sub { text-align:center; font-size:11px; color:#64748b; margin-bottom:12px; }
  .divider { border:none; border-top:2px dashed #e2e8f0; margin:10px 0; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:11px; color:#64748b; font-weight:700; padding:4px; border-bottom:2px solid #e2e8f0; }
  .totals td { padding:4px 4px; font-size:13px; }
  .totals .big { font-size:16px; font-weight:900; color:#059669; }
  .footer { text-align:center; font-size:11px; color:#94a3b8; margin-top:14px; }
  .note { margin-top:10px; padding:8px; border:1px dashed #cbd5e1; border-radius:10px; font-size:11px; color:#475569; }
  @media print {
    @page { margin:6mm; }
    body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>${storeName}</h1>
  <div class="sub">فاتورة شراء</div>
  <hr class="divider"/>

  <table style="margin-bottom:4px;">
    <tr>
      <td style="font-size:11px;color:#64748b;">رقم الفاتورة</td>
      <td style="font-weight:700;text-align:left;">${purchase.invoice_number}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#64748b;">التاريخ</td>
      <td style="text-align:left;font-size:12px;">${new Date(purchase.created_at).toLocaleString('en-US')}</td>
    </tr>
    ${purchase.supplier_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">المورد</td>
      <td style="text-align:left;font-size:12px;">${purchase.supplier_name}</td>
    </tr>` : ''}
    ${purchase.warehouse_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">المستودع</td>
      <td style="text-align:left;font-size:12px;">${purchase.warehouse_name}${purchase.warehouse_code ? ` (${purchase.warehouse_code})` : ''}</td>
    </tr>` : ''}
  </table>

  <hr class="divider"/>

  <table>
    <thead>
      <tr>
        <th style="text-align:right;">المنتج</th>
        <th style="text-align:center;">الكمية</th>
        <th style="text-align:center;">السعر</th>
        <th style="text-align:left;">المجموع</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr class="divider"/>

  <table class="totals">
    <tr>
      <td class="big">الإجمالي</td>
      <td class="big" style="text-align:left;">${fmtC(purchase.total_amount)}</td>
    </tr>
    <tr>
      <td>المدفوع</td>
      <td style="text-align:left;">${fmtC(purchase.paid_amount || 0)}</td>
    </tr>
    <tr>
      <td style="color:#ef4444;">المتبقي</td>
      <td style="text-align:left;color:#ef4444;font-weight:700;">${fmtC(purchase.due_amount || 0)}</td>
    </tr>
  </table>

  ${purchase.notes ? `<div class="note"><strong>ملاحظات:</strong> ${purchase.notes}</div>` : ''}

  <hr class="divider"/>
  <div class="footer">تمت طباعة فاتورة الشراء · ${storeName}</div>
</div>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;
}
function buildPurchaseReturnReceiptHtml(
  purchaseReturn: PurchaseReturnReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  const { symbol, rate } = currency;

  const fmtC = (usd: string | number): string =>
    `${fmtNum(toNumber(usd) * rate)} ${symbol}`;

  const returnMethodLabel =
    purchaseReturn.return_method === 'cash_refund'
      ? 'استرداد نقدي'
      : purchaseReturn.return_method === 'debt_discount'
        ? 'خصم من ذمة المورد'
        : purchaseReturn.return_method === 'stock_only'
          ? 'إرجاع مخزون فقط'
          : (purchaseReturn.return_method || '—');

  const itemRows = purchaseReturn.items
    .map((item) => {
      const qty = toNumber(item.quantity);
      const total =
        item.total_price !== undefined
          ? toNumber(item.total_price)
          : qty * toNumber(item.unit_price);

      return `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;font-size:13px;">
            ${item.product_name}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">
            ${fmtNum(qty, 0, 3)} ${item.unit || ''}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:center;font-size:12px;">
            ${fmtC(item.unit_price)}
          </td>
          <td style="padding:6px 4px;border-bottom:1px dotted #e2e8f0;text-align:left;font-size:13px;font-weight:700;">
            ${fmtC(total)}
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>مرتجع شراء ${purchaseReturn.return_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; font-size:13px; color:#1e293b; }
  .page { max-width:340px; margin:0 auto; padding:16px; }
  h1 { font-size:18px; font-weight:900; color:#dc2626; text-align:center; }
  .sub { text-align:center; font-size:11px; color:#64748b; margin-bottom:12px; }
  .divider { border:none; border-top:2px dashed #e2e8f0; margin:10px 0; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:11px; color:#64748b; font-weight:700; padding:4px; border-bottom:2px solid #e2e8f0; }
  .totals td { padding:4px 4px; font-size:13px; }
  .totals .big { font-size:16px; font-weight:900; color:#dc2626; }
  .footer { text-align:center; font-size:11px; color:#94a3b8; margin-top:14px; }
  .note { margin-top:10px; padding:8px; border:1px dashed #cbd5e1; border-radius:10px; font-size:11px; color:#475569; }
  @media print {
    @page { margin:6mm; }
    body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>${storeName}</h1>
  <div class="sub">سند مرتجع شراء</div>
  <hr class="divider"/>

  <table style="margin-bottom:4px;">
    <tr>
      <td style="font-size:11px;color:#64748b;">رقم المرتجع</td>
      <td style="font-weight:700;text-align:left;">${purchaseReturn.return_number}</td>
    </tr>
    ${purchaseReturn.purchase_invoice ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">فاتورة الشراء</td>
      <td style="text-align:left;font-size:12px;">${purchaseReturn.purchase_invoice}</td>
    </tr>` : ''}
    <tr>
      <td style="font-size:11px;color:#64748b;">التاريخ</td>
      <td style="text-align:left;font-size:12px;">${new Date(purchaseReturn.created_at).toLocaleString('en-US')}</td>
    </tr>
    ${purchaseReturn.supplier_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">المورد</td>
      <td style="text-align:left;font-size:12px;">${purchaseReturn.supplier_name}</td>
    </tr>` : ''}
    ${purchaseReturn.warehouse_name ? `
    <tr>
      <td style="font-size:11px;color:#64748b;">المستودع</td>
      <td style="text-align:left;font-size:12px;">${purchaseReturn.warehouse_name}${purchaseReturn.warehouse_code ? ` (${purchaseReturn.warehouse_code})` : ''}</td>
    </tr>` : ''}
    <tr>
      <td style="font-size:11px;color:#64748b;">الطريقة</td>
      <td style="text-align:left;font-size:12px;">${returnMethodLabel}</td>
    </tr>
  </table>

  <hr class="divider"/>

  <table>
    <thead>
      <tr>
        <th style="text-align:right;">المنتج</th>
        <th style="text-align:center;">الكمية</th>
        <th style="text-align:center;">السعر</th>
        <th style="text-align:left;">المجموع</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr class="divider"/>

  <table class="totals">
    <tr>
      <td class="big">إجمالي المرتجع</td>
      <td class="big" style="text-align:left;">${fmtC(purchaseReturn.total_amount)}</td>
    </tr>
  </table>

  ${purchaseReturn.reason ? `<div class="note"><strong>السبب:</strong> ${purchaseReturn.reason}</div>` : ''}
  ${purchaseReturn.notes ? `<div class="note"><strong>ملاحظات:</strong> ${purchaseReturn.notes}</div>` : ''}

  <hr class="divider"/>
  <div class="footer">تمت طباعة سند مرتجع الشراء · ${storeName}</div>
</div>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;
}

export function printSaleReceipt(
  sale: SaleReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  openPrintHtml(buildSaleReceiptHtml(sale, storeName, currency), 400, 620);
}

export function printSaleReturnReceipt(
  saleReturn: SaleReturnReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  openPrintHtml(buildSaleReturnReceiptHtml(saleReturn, storeName, currency), 400, 620);
}
export function printPurchaseReceipt(
  purchase: PurchaseReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  openPrintHtml(buildPurchaseReceiptHtml(purchase, storeName, currency), 400, 620);
}
export function printPurchaseReturnReceipt(
  purchaseReturn: PurchaseReturnReceiptPrintData,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 }
) {
  openPrintHtml(buildPurchaseReturnReceiptHtml(purchaseReturn, storeName, currency), 400, 620);
}

export function printInvoice(
  sale: Sale,
  storeName = 'ريان برو',
  currency: PrintCurrency = { symbol: 'ل.س', rate: 1 },
) {
  printSaleReceipt(
    {
      invoice_number: sale.invoice_number,
      created_at: sale.created_at,
      customer_name: sale.customer_name,
      sale_type: sale.sale_type,
      payment_method: sale.payment_method,
      total_amount: sale.total_amount,
      paid_amount: sale.paid_amount,
      sale_discount: sale.discount,
      notes: sale.notes,
      cashier_name: sale.cashier_name,
      terminal_name: sale.terminal_name,
      items: sale.items.map((item) => ({
        product_name: item.product_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        item_discount: item.discount,
        is_weighted: item.is_weighted,
        price_type: item.price_type,
      })),
    },
    storeName,
    currency
  );
}