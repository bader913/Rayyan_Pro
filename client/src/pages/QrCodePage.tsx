import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { QrCode, Printer, Wifi, MessageSquare, Link, Download } from 'lucide-react';

type QrType = 'text' | 'url' | 'wifi';

const WIFI_SECURITY = ['WPA', 'WEP', 'nopass'];

const surfaceCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

const subtleCard: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
};

const text = {
  heading: { color: 'var(--text-heading)' } as React.CSSProperties,
  body: { color: 'var(--text-body)' } as React.CSSProperties,
  secondary: { color: 'var(--text-secondary)' } as React.CSSProperties,
  muted: { color: 'var(--text-muted)' } as React.CSSProperties,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  color: 'var(--text-body)',
};

export default function QrCodePage() {
  const [qrType, setQrType] = useState<QrType>('text');
  const [textVal, setTextVal] = useState('');
  const [urlVal, setUrlVal] = useState('https://');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiSec, setWifiSec] = useState('WPA');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getContent = (): string => {
    if (qrType === 'text') return textVal;
    if (qrType === 'url') return urlVal;
    if (qrType === 'wifi') {
      const pass = wifiSec === 'nopass' ? '' : wifiPass;
      return `WIFI:T:${wifiSec};S:${wifiSsid};P:${pass};;`;
    }
    return '';
  };

  useEffect(() => {
    const content = getContent();
    if (!content || content === 'https://') {
      setQrDataUrl(null);
      return;
    }

    QRCode.toDataURL(content, {
      width: 400,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrType, textVal, urlVal, wifiSsid, wifiPass, wifiSec]);

  const handlePrint = () => {
    if (!qrDataUrl) return;

    const items = Array.from({ length: copies })
      .map(
        () => `
        <div class="qr-item">
          <img src="${qrDataUrl}" />
          <p class="label">${getContent()}</p>
        </div>
      `
      )
      .join('');

    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>طباعة QR كود</title>
          <style>
            body { margin: 0; font-family: sans-serif; direction: rtl; }
            .grid { display: flex; flex-wrap: wrap; gap: 16px; padding: 16px; }
            .qr-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 12px;
            }
            .qr-item img { width: 180px; height: 180px; }
            .label {
              font-size: 10px;
              max-width: 180px;
              text-align: center;
              word-break: break-all;
              margin-top: 6px;
              color: #475569;
            }
            @media print { @page { margin: 1cm; } }
          </style>
        </head>
        <body>
          <div class="grid">${items}</div>
          <script>window.onload=()=>{ window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'qrcode.png';
    a.click();
  };

  const TYPE_TABS: { id: QrType; icon: React.ElementType; label: string }[] = [
    { id: 'text', icon: MessageSquare, label: 'نص عادي' },
    { id: 'url', icon: Link, label: 'رابط URL' },
    { id: 'wifi', icon: Wifi, label: 'شبكة WiFi' },
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto" dir="rtl">
      <div
        className="rounded-3xl px-5 py-4 md:px-6 md:py-5"
        style={{
          ...surfaceCard,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle)) 0%, var(--bg-card) 100%)',
        }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-[28px] font-black tracking-tight" style={text.heading}>
            منشئ QR كود
          </h1>
          <p className="text-sm font-semibold" style={text.secondary}>
            توليد رموز QR للنصوص والروابط وشبكات WiFi مع إمكانية الطباعة والتنزيل
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
        <div className="space-y-5">
          <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-black" style={text.body}>
                نوع QR الكود
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TYPE_TABS.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setQrType(id)}
                  className="flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-2xl text-xs font-black transition-all"
                  style={
                    qrType === id
                      ? {
                          background: '#059669',
                          color: '#fff',
                          boxShadow: '0 10px 24px rgba(5, 150, 105, 0.18)',
                        }
                      : {
                          background: 'var(--bg-subtle)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                        }
                  }
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-black" style={text.body}>
                بيانات الكود
              </h3>
            </div>

            <div className="space-y-3">
              {qrType === 'text' && (
                <div>
                  <label className="block text-xs font-black mb-1.5" style={text.secondary}>
                    النص
                  </label>
                  <textarea
                    rows={5}
                    value={textVal}
                    onChange={(e) => setTextVal(e.target.value)}
                    placeholder="اكتب النص هنا..."
                    className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none resize-none"
                    style={inputStyle}
                  />
                </div>
              )}

              {qrType === 'url' && (
                <div>
                  <label className="block text-xs font-black mb-1.5" style={text.secondary}>
                    الرابط
                  </label>
                  <input
                    type="url"
                    value={urlVal}
                    onChange={(e) => setUrlVal(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
                    style={inputStyle}
                    dir="ltr"
                  />
                </div>
              )}

              {qrType === 'wifi' && (
                <>
                  <div>
                    <label className="block text-xs font-black mb-1.5" style={text.secondary}>
                      اسم الشبكة (SSID)
                    </label>
                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="MyWiFiNetwork"
                      className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black mb-1.5" style={text.secondary}>
                      نوع الحماية
                    </label>
                    <select
                      value={wifiSec}
                      onChange={(e) => setWifiSec(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
                      style={inputStyle}
                    >
                      {WIFI_SECURITY.map((s) => (
                        <option key={s} value={s}>
                          {s === 'nopass' ? 'بدون كلمة مرور' : s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {wifiSec !== 'nopass' && (
                    <div>
                      <label className="block text-xs font-black mb-1.5" style={text.secondary}>
                        كلمة المرور
                      </label>
                      <input
                        type="text"
                        value={wifiPass}
                        onChange={(e) => setWifiPass(e.target.value)}
                        placeholder="كلمة مرور الشبكة"
                        className="w-full px-3 py-2.5 rounded-2xl text-sm font-medium focus:outline-none"
                        style={inputStyle}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-black" style={text.body}>
                  عدد النسخ للطباعة
                </div>
                <div className="text-xs font-medium mt-1" style={text.muted}>
                  يمكنك طباعة أكثر من نسخة دفعة واحدة
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCopies((c) => Math.max(1, c - 1))}
                  className="w-10 h-10 rounded-2xl font-black text-lg flex items-center justify-center"
                  style={{ ...subtleCard, color: 'var(--text-body)' }}
                >
                  −
                </button>

                <span
                  className="w-10 text-center font-black text-lg tabular-nums"
                  style={text.heading}
                >
                  {copies}
                </span>

                <button
                  onClick={() => setCopies((c) => Math.min(50, c + 1))}
                  className="w-10 h-10 rounded-2xl font-black text-lg flex items-center justify-center"
                  style={{ ...subtleCard, color: 'var(--text-body)' }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl p-5 md:p-6" style={surfaceCard}>
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-black" style={text.body}>
                المعاينة
              </h3>
            </div>

            <div className="flex flex-col items-center gap-4">
              {qrDataUrl ? (
                <>
                  <div
                    className="rounded-3xl p-4"
                    style={{
                      background: '#fff',
                      border: '1px solid var(--border)',
                      boxShadow: '0 10px 24px rgba(15,23,42,0.06)',
                    }}
                  >
                    <img
                      src={qrDataUrl}
                      alt="QR Code"
                      className="rounded-2xl"
                      style={{ width: 240, height: 240 }}
                    />
                  </div>

                  <div
                    className="w-full rounded-2xl px-4 py-3 text-center text-xs font-medium break-all"
                    style={subtleCard}
                  >
                    <span style={text.muted}>{getContent()}</span>
                  </div>
                </>
              ) : (
                <div
                  className="w-full flex flex-col items-center justify-center gap-3 rounded-3xl"
                  style={{
                    minHeight: 330,
                    background: 'var(--bg-subtle)',
                    border: '1px dashed var(--border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <QrCode size={54} />
                  <span className="text-sm font-semibold">أدخل المحتوى للمعاينة</span>
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-white disabled:opacity-40 transition"
              style={{ background: '#059669' }}
            >
              <Printer size={16} />
              طباعة {copies > 1 ? `(${copies})` : ''}
            </button>

            <button
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black disabled:opacity-40 transition"
              style={{ ...subtleCard, color: 'var(--text-body)' }}
            >
              <Download size={16} />
              تنزيل PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}