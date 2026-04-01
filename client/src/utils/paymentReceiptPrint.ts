import { openPrintWindowHtml } from './printWindow.ts';

type ReceiptCard = {
  label: string;
  value: string;
};

type PaymentReceiptPrintOptions = {
  title: string;
  subjectName: string;
  generatedAt: string;
  receiptNumber: string;
  receiptTypeLabel: string;
  paymentStatus: string;
  cards: ReceiptCard[];
  summaryRows: ReceiptCard[];
  note?: string;
  titleColor?: string;
  summaryAccentBg?: string;
  summaryAccentColor?: string;
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

export function printPaymentReceiptA4({
  title,
  subjectName,
  generatedAt,
  receiptNumber,
  receiptTypeLabel,
  paymentStatus,
  cards,
  summaryRows,
  note,
  titleColor = '#16a34a',
  summaryAccentBg = '#f0fdf4',
  summaryAccentColor = '#166534',
  width = 950,
  height = 760,
}: PaymentReceiptPrintOptions) {
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

  const summaryHtml = summaryRows
    .map(
      (row, idx) => `
        <div class="summary-row ${idx === summaryRows.length - 1 ? 'summary-row-final' : ''}">
          <span>${esc(row.label)}</span>
          <span>${esc(row.value)}</span>
        </div>
      `
    )
    .join('');

  const html = `
    <html dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${esc(title)} - ${esc(subjectName)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: #fff;
            color: #111827;
            font-family: Arial, Tahoma, sans-serif;
            direction: rtl;
          }
          .page {
            max-width: 900px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 26px;
            font-weight: 900;
            color: ${titleColor};
            margin-bottom: 6px;
          }
          .meta {
            font-size: 12px;
            color: #6b7280;
            line-height: 1.9;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin: 18px 0 22px;
          }
          .card {
            border: 1px solid #e5e7eb;
            border-radius: 14px;
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
            font-size: 14px;
            font-weight: 800;
            color: #111827;
          }
          .note-box {
            margin-top: 14px;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            padding: 12px;
            background: #f9fafb;
          }
          .summary {
            margin-top: 18px;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            overflow: hidden;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 14px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-row-final {
            background: ${summaryAccentBg};
            color: ${summaryAccentColor};
            font-weight: 900;
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
                رقم السند: <strong>${esc(receiptNumber)}</strong><br/>
                التاريخ: ${esc(generatedAt)}
              </div>
            </div>
            <div class="meta">
              نوع السند: <strong>${esc(receiptTypeLabel)}</strong><br/>
              الحالة: <strong>${esc(paymentStatus)}</strong>
            </div>
          </div>

          <div class="grid">
            ${cardsHtml}
          </div>

          <div class="summary">
            ${summaryHtml}
          </div>

          <div class="note-box">
            <div class="label">ملاحظة</div>
            <div class="value">${esc(note || '—')}</div>
          </div>
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