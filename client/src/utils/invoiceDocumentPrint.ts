import { openPrintWindowHtml } from './printWindow.ts';

type InvoicePrintCard = {
  label: string;
  value: string;
};

type InvoicePrintColumn = {
  label: string;
  width?: string;
  align?: 'right' | 'center' | 'left';
};

type InvoicePrintTotalRow = {
  label: string;
  value: string;
  highlight?: boolean;
};

type InvoiceDocumentPrintOptions = {
  title: string;
  accentColor: string;
  invoiceNumber: string;
  dateText: string;
  sideMetaLines?: string[];
  cards: InvoicePrintCard[];
  columns: InvoicePrintColumn[];
  rows: string[][];
  totals: InvoicePrintTotalRow[];
  notes?: string;
  width?: number;
  height?: number;
};

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printInvoiceDocumentA4({
  title,
  accentColor,
  invoiceNumber,
  dateText,
  sideMetaLines = [],
  cards,
  columns,
  rows,
  totals,
  notes,
  width = 1000,
  height = 800,
}: InvoiceDocumentPrintOptions) {
  const cardsHtml = cards
    .map(
      (card) => `
        <div class="card">
          <div class="label">${esc(card.label)}</div>
          <div class="value">${esc(card.value)}</div>
        </div>
      `
    )
    .join('');

  const headHtml = columns
    .map((col) => {
      const align = col.align ?? 'center';
      const style = [
        col.width ? `width:${col.width};` : '',
        `text-align:${align};`,
      ].join('');

      return `<th style="${style}">${esc(col.label)}</th>`;
    })
    .join('');

  const rowsHtml = rows
    .map(
      (row) => `
        <tr>
          ${row
            .map((cell, idx) => {
              const col = columns[idx];
              const align = col?.align ?? 'center';
              return `
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:${align};">
                  ${esc(cell)}
                </td>
              `;
            })
            .join('')}
        </tr>
      `
    )
    .join('');

  const totalsHtml = totals
    .map(
      (row) => `
        <div class="totals-row ${row.highlight ? 'totals-row-highlight' : ''}">
          <span>${esc(row.label)}</span>
          <span>${esc(row.value)}</span>
        </div>
      `
    )
    .join('');

  const sideMetaHtml = sideMetaLines
    .map((line) => `${esc(line)}<br/>`)
    .join('');

  const html = `
    <html dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${esc(title)} ${esc(invoiceNumber)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Tahoma, sans-serif;
            direction: rtl;
            color: #111827;
            padding: 24px;
            margin: 0;
            background: #fff;
          }
          .page {
            max-width: 900px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 24px;
            font-weight: 900;
            color: ${accentColor};
            margin-bottom: 6px;
          }
          .meta {
            font-size: 12px;
            color: #6b7280;
            line-height: 1.9;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin: 18px 0 22px;
          }
          .card {
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 12px;
            background: #f9fafb;
          }
          .label {
            font-size: 11px;
            color: #6b7280;
            margin-bottom: 6px;
            font-weight: 700;
          }
          .value {
            font-size: 13px;
            font-weight: 800;
            color: #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 14px;
          }
          thead th {
            background: ${accentColor};
            color: #fff;
            padding: 10px 8px;
            font-size: 12px;
          }
          .totals {
            margin-top: 18px;
            width: 320px;
            margin-right: auto;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            overflow: hidden;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 14px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
          }
          .totals-row:last-child {
            border-bottom: none;
          }
          .totals-row-highlight {
            background: color-mix(in srgb, ${accentColor} 10%, white);
            font-weight: 900;
            color: ${accentColor};
          }
          .notes {
            margin-top: 18px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 12px;
            background: #f9fafb;
          }
          .notes .label {
            margin-bottom: 8px;
          }
          @media print {
            body { padding: 0; }
            .page { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="title">${esc(title)}</div>
              <div class="meta">
                رقم الفاتورة: <strong>${esc(invoiceNumber)}</strong><br/>
                التاريخ: ${esc(dateText)}
              </div>
            </div>
            <div class="meta">
              ${sideMetaHtml}
            </div>
          </div>

          <div class="grid">
            ${cardsHtml}
          </div>

          <table>
            <thead>
              <tr>
                ${headHtml}
              </tr>
            </thead>
            <tbody>
              ${
                rows.length > 0
                  ? rowsHtml
                  : `
                    <tr>
                      <td colspan="${columns.length}" style="padding:20px;text-align:center;color:#6b7280;">
                        لا توجد بيانات
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>

          <div class="totals">
            ${totalsHtml}
          </div>

          ${
            notes
              ? `
                <div class="notes">
                  <div class="label">ملاحظات</div>
                  <div class="value">${esc(notes)}</div>
                </div>
              `
              : ''
          }
        </div>

        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        <\/script>
      </body>
    </html>
  `;

  openPrintWindowHtml(html, { width, height });
}