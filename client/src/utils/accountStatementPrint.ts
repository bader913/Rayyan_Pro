import { openPrintWindowHtml } from './printWindow.ts';

type StatementCard = {
  label: string;
  value: string;
};

type AccountStatementPrintOptions = {
  title: string;
  subjectName: string;
  generatedAt: string;
  printedRowsCount: number | string;
  cards: StatementCard[];
  rowsHtml: string;
  footerText: string;
  emptyMessage?: string;
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

export function printAccountStatementA4({
  title,
  subjectName,
  generatedAt,
  printedRowsCount,
  cards,
  rowsHtml,
  footerText,
  emptyMessage = 'لا توجد حركات للطباعة',
  width = 1100,
  height = 800,
}: AccountStatementPrintOptions) {
  const safeRows = String(rowsHtml || '').trim();

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
            max-width: 1000px;
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
            color: #2563eb;
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
            background: #2563eb;
            color: #fff;
            padding: 10px 8px;
            font-size: 12px;
            text-align: center;
          }
          .footer {
            margin-top: 14px;
            font-size: 12px;
            color: #6b7280;
            text-align: left;
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
                الاسم: <strong>${esc(subjectName)}</strong><br/>
                التاريخ: ${esc(generatedAt)}
              </div>
            </div>
            <div class="meta">
              عدد الحركات المطبوعة: <strong>${esc(String(printedRowsCount))}</strong><br/>
              نوع الطباعة: <strong>كشف كامل</strong>
            </div>
          </div>

          <div class="grid">
            ${cardsHtml}
          </div>

          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              ${
                safeRows ||
                `
                  <tr>
                    <td colspan="6" style="padding:20px;text-align:center;color:#6b7280;">
                      ${esc(emptyMessage)}
                    </td>
                  </tr>
                `
              }
            </tbody>
          </table>

          <div class="footer">
            ${esc(footerText)}
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