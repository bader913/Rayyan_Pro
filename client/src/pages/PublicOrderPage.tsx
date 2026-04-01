import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    publicCustomerOrdersApi,
    type PublicCatalogProduct,
    type PublicOrderCurrencyCode,
    type PublicOrderPaymentMethod,
} from '../api/publicCustomerOrders';
import {
    Search,
    Plus,
    Minus,
    ShoppingBag,
    Phone,
    User,
    CheckCircle2,
    AlertTriangle,
    Wallet,
    BadgeDollarSign,
} from 'lucide-react';

type CartItem = {
    product: PublicCatalogProduct;
    quantity: number;
};

const CURRENCY_LABELS: Record<PublicOrderCurrencyCode, string> = {
    USD: 'USD',
    SYP: 'ل.س',
    TRY: 'TL',
    SAR: 'ر.س',
    AED: 'د.إ',
};

const PAYMENT_LABELS: Record<PublicOrderPaymentMethod, string> = {
    cash_on_delivery: 'نقدًا عند الاستلام',
    sham_cash: 'شام كاش',
};
function getPublicOrderErrorMeta(message?: string) {
    const normalized = String(message || '').trim();

    if (normalized.includes('غير مفعلة')) {
        return {
            title: 'قناة الطلب عبر الويب متوقفة حاليًا',
            description: 'تم إيقاف الطلبات الإلكترونية لهذا المتجر حاليًا. يرجى المحاولة لاحقًا أو التواصل مع المتجر مباشرة.',
        };
    }

    return {
        title: 'تعذر فتح صفحة الطلب',
        description: normalized || 'حاول لاحقًا',
    };
}
function normalizeTelegramLink(value: string | null | undefined) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw;
    }

    if (raw.startsWith('@')) {
        return `https://t.me/${raw.slice(1)}`;
    }

    return `https://t.me/${raw}`;
}

function buildTelegramOrderMessage(params: {
  customerName: string;
  recipientName: string;
  phone: string;
  notes: string;
  paymentMethod: PublicOrderPaymentMethod;
  currency: PublicOrderCurrencyCode;
  rates: Record<PublicOrderCurrencyCode, number>;
  warehouseName: string;
  cart: CartItem[];
  totalUsd: number;
}) {
  const {
    customerName,
    recipientName,
    phone,
    notes,
    paymentMethod,
    currency,
    rates,
    warehouseName,
    cart,
    totalUsd,
  } = params;

  const lines = [
    '#RAYYAN_ORDER',
    `CUSTOMER_NAME: ${customerName.trim()}`,
    `RECIPIENT_NAME: ${recipientName.trim()}`,
    `PHONE: ${phone.trim()}`,
    `PAYMENT_METHOD: ${paymentMethod}`,
    `CURRENCY_CODE: ${currency}`,
    `WAREHOUSE_NAME: ${warehouseName}`,
    'ITEMS:',
    ...cart.map((item) => `${item.product.name} || ${item.quantity}`),
    `TOTAL_DISPLAY: ${formatMoney(totalUsd, currency, rates)}`,
    `NOTES: ${notes.trim()}`,
  ];

  return lines.join('\n');
}

function formatMoney(
    amountUsd: number,
    currency: PublicOrderCurrencyCode,
    rates: Record<PublicOrderCurrencyCode, number>
) {
    const rate = Number(rates[currency] || 1);
    const amount = amountUsd * rate;
    const decimals = currency === 'SYP' ? 0 : 2;

    return `${amount.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })} ${CURRENCY_LABELS[currency]}`;
}

function QtyButton({
    children,
    onClick,
}: {
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                color: 'var(--text-heading)',
            }}
        >
            {children}
        </button>
    );
}

export default function PublicOrderPage() {
    const [search, setSearch] = useState('');
    const [currency, setCurrency] = useState<PublicOrderCurrencyCode>('USD');
    const [paymentMethod, setPaymentMethod] = useState<PublicOrderPaymentMethod>('cash_on_delivery');

    const [customerName, setCustomerName] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');

    const [cart, setCart] = useState<CartItem[]>([]);
    const [error, setError] = useState('');
    const [telegramNotice, setTelegramNotice] = useState('');

    const catalogQuery = useQuery({
        queryKey: ['public-customer-orders-catalog'],
        queryFn: publicCustomerOrdersApi.getCatalog,
        staleTime: 30_000,
    });

    const createOrderMutation = useMutation({
        mutationFn: publicCustomerOrdersApi.createOrder,
        onSuccess: () => {
            setCart([]);
            setCustomerName('');
            setRecipientName('');
            setPhone('');
            setNotes('');
            setError('');
            setTelegramNotice('');
            setSearch('');
        },
        onError: (err: any) => {
            setError(err?.message ?? 'تعذر إرسال الطلب');
        },
    });

    const catalog = catalogQuery.data;
    const rates = catalog?.currency?.rates;
    const warehouseName = catalog?.warehouse?.name || 'المستودع الرئيسي';
    const telegramEnabled = Boolean(catalog?.channels?.telegram_enabled);
    const telegramLink = normalizeTelegramLink(catalog?.channels?.telegram_link);

    const catalogErrorMessage =
        catalogQuery.error instanceof Error ? catalogQuery.error.message : '';

    const catalogErrorMeta = getPublicOrderErrorMeta(catalogErrorMessage);

    useEffect(() => {
        if (catalog?.currency?.default_currency) {
            setCurrency(catalog.currency.default_currency);
        }
    }, [catalog?.currency?.default_currency]);

    const filteredProducts = useMemo(() => {
        const products = catalog?.products ?? [];
        const term = search.trim().toLowerCase();

        if (term.length < 2) return [];

        return products.filter((product) =>
            product.name.toLowerCase().includes(term)
        );
    }, [catalog?.products, search]);

    const cartMap = useMemo(() => {
        return new Map(cart.map((item) => [item.product.id, item]));
    }, [cart]);

    const totalUsd = useMemo(() => {
        return cart.reduce((sum, item) => {
            return sum + Number(item.product.retail_price || 0) * item.quantity;
        }, 0);
    }, [cart]);

    const totalItems = useMemo(() => {
        return cart.reduce((sum, item) => sum + item.quantity, 0);
    }, [cart]);

    const addToCart = (product: PublicCatalogProduct) => {
        setError('');

        setCart((prev) => {
            const existing = prev.find((item) => item.product.id === product.id);

            if (existing) {
                return prev.map((item) =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }

            return [...prev, { product, quantity: 1 }];
        });
    };

    const changeQty = (productId: number, delta: number) => {
        setError('');

        setCart((prev) =>
            prev
                .map((item) =>
                    item.product.id === productId
                        ? { ...item, quantity: item.quantity + delta }
                        : item
                )
                .filter((item) => item.quantity > 0)
        );
    };

    const submitOrder = async () => {
        if (!customerName.trim()) {
            setError('اسم صاحب الطلب مطلوب');
            return;
        }

        if (cart.length === 0) {
            setError('السلة فارغة');
            return;
        }

        setError('');

        await createOrderMutation.mutateAsync({
            customer_name: customerName.trim(),
            recipient_name: recipientName.trim() || null,
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            payment_method: paymentMethod,
            currency_code: currency,
            items: cart.map((item) => ({
                product_id: item.product.id,
                quantity: item.quantity,
            })),
        });
    };
     const shareToTelegram = async () => {
    if (!customerName.trim()) {
      setTelegramNotice('');
      setError('اسم صاحب الطلب مطلوب');
      return;
    }

    if (cart.length === 0) {
      setTelegramNotice('');
      setError('السلة فارغة');
      return;
    }

    if (!rates) {
      setTelegramNotice('');
      setError('تعذر تجهيز الطلب لتيليغرام الآن');
      return;
    }

    if (!telegramEnabled) {
      setTelegramNotice('');
      setError('قناة تيليغرام غير مفعلة حاليًا');
      return;
    }

    if (!telegramLink) {
      setTelegramNotice('');
      setError('رابط أو يوزر بوت تيليغرام غير مضبوط');
      return;
    }

    setError('');

    const message = buildTelegramOrderMessage({
      customerName,
      recipientName,
      phone,
      notes,
      paymentMethod,
      currency,
      rates,
      warehouseName,
      cart,
      totalUsd,
    });

    let copied = false;

    try {
      await navigator.clipboard.writeText(message);
      copied = true;
    } catch {
      copied = false;
    }

    window.open(telegramLink, '_blank', 'noopener,noreferrer');

    setTelegramNotice(
      copied
        ? 'تم نسخ الطلب وفتح البوت. الصق الرسالة داخل البوت ثم أرسلها ليتم إدخال الطلب إلى النظام.'
        : 'تم فتح البوت. انسخ رسالة الطلب والصقها داخل البوت ثم أرسلها.'
    );
  };

    if (catalogQuery.isLoading) {
        return (
            <div
                dir="rtl"
                className="min-h-screen flex items-center justify-center p-4"
                style={{ background: 'var(--bg-page)' }}
            >
                <div
                    className="rounded-3xl p-6 text-center w-full max-w-sm"
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-card)',
                    }}
                >
                    <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                        جاري تحميل الصفحة...
                    </div>
                </div>
            </div>
        );
    }

    if (catalogQuery.isError || !catalog || !rates) {
        return (
            <div
                dir="rtl"
                className="min-h-screen flex items-center justify-center p-4"
                style={{ background: 'var(--bg-page)' }}
            >
                <div
                    className="w-full max-w-md rounded-3xl p-6 text-center"
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-card)',
                    }}
                >
                    <div
                        className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                        style={{ background: 'var(--bg-subtle)', color: '#dc2626' }}
                    >
                        <AlertTriangle size={22} />
                    </div>

                    <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
                        {catalogErrorMeta.title}
                    </div>
                    <div className="text-xs mt-2 leading-6" style={{ color: 'var(--text-muted)' }}>
                        {catalogErrorMeta.description}
                    </div>
                </div>
            </div>
        );
    }

    if (createOrderMutation.isSuccess && createOrderMutation.data?.order) {
        const order = createOrderMutation.data.order;

        return (
            <div
                dir="rtl"
                className="min-h-screen py-5 px-3"
                style={{ background: 'var(--bg-page)' }}
            >
                <div className="max-w-xl mx-auto">
                    <div
                        className="rounded-3xl p-5 text-center"
                        style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow-card)',
                        }}
                    >
                        <div
                            className="w-14 h-14 rounded-3xl mx-auto mb-4 flex items-center justify-center"
                            style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}
                        >
                            <CheckCircle2 size={28} />
                        </div>

                        <h1 className="text-xl font-black" style={{ color: 'var(--text-heading)' }}>
                            تم إرسال الطلب بنجاح
                        </h1>

                        <div className="mt-3 text-base font-black" style={{ color: 'var(--primary)' }}>
                            {order.order_number}
                        </div>

                        <div className="mt-5 space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span style={{ color: 'var(--text-muted)' }}>اسم صاحب الطلب</span>
                                <span className="font-black" style={{ color: 'var(--text-heading)' }}>
                                    {order.customer_name}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <span style={{ color: 'var(--text-muted)' }}>طريقة الدفع</span>
                                <span className="font-black" style={{ color: 'var(--text-heading)' }}>
                                    {PAYMENT_LABELS[order.payment_method]}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <span style={{ color: 'var(--text-muted)' }}>الإجمالي</span>
                                <span className="font-black" style={{ color: 'var(--text-heading)' }}>
                                    {formatMoney(Number(order.total_usd || 0), order.currency_code, rates)}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={() => createOrderMutation.reset()}
                            className="mt-6 w-full py-3 rounded-2xl text-sm font-black text-white"
                            style={{ background: 'var(--primary)' }}
                        >
                            إرسال طلب جديد
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            dir="rtl"
            className="min-h-screen py-4 px-2.5"
            style={{ background: 'var(--bg-page)' }}
        >
            <div className="max-w-6xl mx-auto space-y-4">
                <div
                    className="rounded-3xl px-4 py-4"
                    style={{
                        background:
                            'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle)) 0%, var(--bg-card) 100%)',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-card)',
                    }}
                >
                    <div className="flex items-start gap-3">
                        <div
                            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
                        >
                            <ShoppingBag size={18} />
                        </div>

                        <div className="min-w-0 flex-1">
                            <h1 className="text-lg font-black" style={{ color: 'var(--text-heading)' }}>
                                طلب أوردر جديد
                            </h1>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                ابحث عن الصنف ثم اضغط عليه لإضافته
                            </p>
                            <div className="text-[11px] mt-2 font-bold" style={{ color: 'var(--text-muted)' }}>
                                الطلب من: {warehouseName}
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div
                        className="rounded-2xl px-4 py-3 text-sm font-bold"
                        style={{
                            background: 'rgba(239,68,68,0.08)',
                            color: '#dc2626',
                            border: '1px solid rgba(239,68,68,0.18)',
                        }}
                    >
                        {error}
                    </div>
                )}

                {telegramNotice && (
                    <div
                        className="rounded-2xl px-4 py-3 text-sm font-bold"
                        style={{
                            background: 'rgba(16,185,129,0.10)',
                            color: '#047857',
                            border: '1px solid rgba(16,185,129,0.18)',
                        }}
                    >
                        {telegramNotice}
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-[1fr,340px] gap-4 items-start">
                    <div className="space-y-4">
                        <div
                            className="rounded-3xl p-3"
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                boxShadow: 'var(--shadow-card)',
                            }}
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr,110px] gap-2.5">
                                <div className="relative">
                                    <Search
                                        size={14}
                                        className="absolute top-1/2 -translate-y-1/2 right-3"
                                        style={{ color: 'var(--text-muted)' }}
                                    />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="ابحث عن منتج..."
                                        className="w-full rounded-2xl pr-9 pl-3 py-2.5 text-sm outline-none"
                                        style={{
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-body)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                </div>

                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value as PublicOrderCurrencyCode)}
                                    className="w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
                                    style={{
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-body)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    {(['USD', 'SYP', 'TRY', 'SAR', 'AED'] as PublicOrderCurrencyCode[]).map((code) => (
                                        <option key={code} value={code}>
                                            {code}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            {search.trim().length < 2 ? (
                                <div
                                    className="rounded-3xl px-4 py-10 text-center text-sm font-semibold"
                                    style={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        boxShadow: 'var(--shadow-card)',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    اكتب حرفين على الأقل للبحث
                                </div>
                            ) : filteredProducts.length === 0 ? (
                                <div
                                    className="rounded-3xl px-4 py-10 text-center text-sm font-semibold"
                                    style={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        boxShadow: 'var(--shadow-card)',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    لا توجد نتائج
                                </div>
                            ) : (
                                filteredProducts.map((product) => {
                                    const cartItem = cartMap.get(product.id);

                                    return (
                                        <button
                                            key={product.id}
                                            type="button"
                                            onClick={() => addToCart(product)}
                                            className="w-full rounded-3xl p-3.5 text-right"
                                            style={{
                                                background: 'var(--bg-card)',
                                                border: '1px solid var(--border)',
                                                boxShadow: 'var(--shadow-card)',
                                            }}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-black truncate" style={{ color: 'var(--text-heading)' }}>
                                                        {product.name}
                                                    </div>

                                                    <div className="text-[11px] mt-1 font-semibold" style={{ color: 'var(--text-muted)' }}>
                                                        {product.unit}
                                                    </div>

                                                    <div className="text-sm font-black mt-2" style={{ color: 'var(--primary)' }}>
                                                        {formatMoney(Number(product.retail_price || 0), currency, rates)}
                                                    </div>
                                                </div>

                                                {cartItem ? (
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <QtyButton onClick={() => changeQty(product.id, -1)}>
                                                                <Minus size={12} />
                                                            </QtyButton>
                                                        </div>

                                                        <div
                                                            className="min-w-[38px] h-8 px-2 rounded-xl flex items-center justify-center text-sm font-black"
                                                            style={{
                                                                background: 'var(--bg-subtle)',
                                                                border: '1px solid var(--border)',
                                                                color: 'var(--text-heading)',
                                                            }}
                                                        >
                                                            {cartItem.quantity}
                                                        </div>

                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <QtyButton onClick={() => changeQty(product.id, 1)}>
                                                                <Plus size={12} />
                                                            </QtyButton>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-black text-white flex-shrink-0"
                                                        style={{ background: 'var(--primary)' }}
                                                    >
                                                        <Plus size={13} />
                                                        إضافة
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="space-y-4 xl:sticky xl:top-5">
                        <div
                            className="rounded-3xl p-4 space-y-4"
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                boxShadow: 'var(--shadow-card)',
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <Wallet size={15} style={{ color: 'var(--text-secondary)' }} />
                                <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
                                    بيانات الطلب
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                <div className="relative">
                                    <User
                                        size={13}
                                        className="absolute top-1/2 -translate-y-1/2 right-3"
                                        style={{ color: 'var(--text-muted)' }}
                                    />
                                    <input
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="اسم صاحب الطلب *"
                                        className="w-full rounded-2xl pr-9 pl-3 py-2.5 text-sm outline-none"
                                        style={{
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-body)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                </div>

                                <div className="relative">
                                    <User
                                        size={13}
                                        className="absolute top-1/2 -translate-y-1/2 right-3"
                                        style={{ color: 'var(--text-muted)' }}
                                    />
                                    <input
                                        value={recipientName}
                                        onChange={(e) => setRecipientName(e.target.value)}
                                        placeholder="اسم المستلم"
                                        className="w-full rounded-2xl pr-9 pl-3 py-2.5 text-sm outline-none"
                                        style={{
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-body)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                </div>

                                <div className="relative">
                                    <Phone
                                        size={13}
                                        className="absolute top-1/2 -translate-y-1/2 right-3"
                                        style={{ color: 'var(--text-muted)' }}
                                    />
                                    <input
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="رقم الهاتف"
                                        className="w-full rounded-2xl pr-9 pl-3 py-2.5 text-sm outline-none"
                                        style={{
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-body)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                </div>

                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    placeholder="ملاحظات"
                                    className="w-full rounded-2xl px-3 py-3 text-sm outline-none resize-none"
                                    style={{
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-body)',
                                        border: '1px solid var(--border)',
                                    }}
                                />

                                <div className="space-y-2">
                                    <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                                        طريقة الدفع
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {(['cash_on_delivery', 'sham_cash'] as PublicOrderPaymentMethod[]).map((method) => (
                                            <button
                                                key={method}
                                                onClick={() => setPaymentMethod(method)}
                                                className="px-3 py-2.5 rounded-2xl text-sm font-black"
                                                style={
                                                    paymentMethod === method
                                                        ? { background: 'var(--primary)', color: '#fff' }
                                                        : {
                                                            background: 'var(--bg-subtle)',
                                                            color: 'var(--text-heading)',
                                                            border: '1px solid var(--border)',
                                                        }
                                                }
                                            >
                                                {PAYMENT_LABELS[method]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div
                            className="rounded-3xl p-4 space-y-4"
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                boxShadow: 'var(--shadow-card)',
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <BadgeDollarSign size={15} style={{ color: 'var(--text-secondary)' }} />
                                <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
                                    السلة
                                </div>
                            </div>

                            {cart.length === 0 ? (
                                <div
                                    className="rounded-2xl px-4 py-6 text-center text-sm font-semibold"
                                    style={{
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-muted)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    السلة فارغة
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
                                    {cart.map((item) => (
                                        <div
                                            key={item.product.id}
                                            className="rounded-2xl p-3"
                                            style={{
                                                background: 'var(--bg-subtle)',
                                                border: '1px solid var(--border)',
                                            }}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-black truncate" style={{ color: 'var(--text-heading)' }}>
                                                        {item.product.name}
                                                    </div>
                                                    <div className="text-[11px] mt-1 font-semibold" style={{ color: 'var(--text-muted)' }}>
                                                        {item.quantity} × {formatMoney(Number(item.product.retail_price || 0), currency, rates)}
                                                    </div>
                                                </div>

                                                <div className="text-sm font-black whitespace-nowrap" style={{ color: 'var(--text-heading)' }}>
                                                    {formatMoney(Number(item.product.retail_price || 0) * item.quantity, currency, rates)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div
                                className="rounded-2xl px-4 py-3.5"
                                style={{
                                    background: 'color-mix(in srgb, var(--bg-subtle) 80%, var(--bg-card))',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                                        الإجمالي
                                    </span>
                                    <span className="text-lg font-black" style={{ color: 'var(--primary)' }}>
                                        {formatMoney(totalUsd, currency, rates)}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <button
                                    onClick={submitOrder}
                                    disabled={createOrderMutation.isPending || cart.length === 0}
                                    className="w-full py-3 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                                    style={{ background: 'var(--primary)' }}
                                >
                                    {createOrderMutation.isPending ? 'جارٍ إرسال الطلب...' : 'إرسال الطلب'}
                                </button>

                                {telegramEnabled && (
                                    <button
                                        type="button"
                                        onClick={shareToTelegram}
                                        disabled={createOrderMutation.isPending || cart.length === 0}
                                        className="w-full py-3 rounded-2xl text-sm font-black disabled:opacity-60"
                                        style={{
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-heading)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        إرسال عبر تيليغرام
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="md:hidden h-24" />

            <div
                className="md:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-2"
                style={{
                    background: 'color-mix(in srgb, var(--bg-card) 92%, transparent)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderTop: '1px solid var(--border)',
                }}
            >
                <div
                    className="rounded-3xl px-4 py-3"
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-card)',
                    }}
                >
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                                السلة
                            </div>
                            <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                                {totalItems} قطعة
                            </div>
                        </div>

                        <div className="text-left">
                            <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                                الإجمالي
                            </div>
                            <div className="text-base font-black" style={{ color: 'var(--primary)' }}>
                                {formatMoney(totalUsd, currency, rates)}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <button
                            onClick={submitOrder}
                            disabled={createOrderMutation.isPending || cart.length === 0}
                            className="w-full py-3 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                            style={{ background: 'var(--primary)' }}
                        >
                            {createOrderMutation.isPending ? 'جارٍ إرسال الطلب...' : 'إرسال الطلب'}
                        </button>

                        {telegramEnabled && (
                            <button
                                type="button"
                                onClick={shareToTelegram}
                                disabled={createOrderMutation.isPending || cart.length === 0}
                                className="w-full py-3 rounded-2xl text-sm font-black disabled:opacity-60"
                                style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-heading)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                إرسال عبر تيليغرام
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}