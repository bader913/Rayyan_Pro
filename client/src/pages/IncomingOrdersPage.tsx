import React, { useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../api/settings.ts';
import { useAuthStore } from '../store/authStore.ts';
import { useNavigate } from 'react-router-dom';
import { usePosStore } from '../store/posStore.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    customerOrdersApi,
    getCustomerOrderPaymentLabel,
    getCustomerOrderStatusLabel,
    type CustomerOrder,
    type CustomerOrderListItem,
    type CustomerOrderStatus,
} from '../api/customerOrders.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import {
    Search,
    RefreshCw,
    ShoppingBag,
    Phone,
    User,
    UserCircle2,
    Check,
    X,
    FileText,
    AlertTriangle,
    Loader2,
    MessageSquare,
} from 'lucide-react';

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

function fmtDate(value: string) {
    return new Date(value).toLocaleDateString('ar-EG-u-nu-latn', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function StatusBadge({ status }: { status: CustomerOrderStatus }) {
    const label = getCustomerOrderStatusLabel(status);

    const style =
        status === 'new'
            ? { background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.22)' }
            : status === 'reviewed'
                ? { background: 'rgba(59,130,246,0.12)', color: '#1d4ed8', border: '1px solid rgba(59,130,246,0.22)' }
                : status === 'converted'
                    ? { background: 'rgba(16,185,129,0.12)', color: '#047857', border: '1px solid rgba(16,185,129,0.22)' }
                    : { background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.18)' };

    return (
        <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black"
            style={style}
        >
            {label}
        </span>
    );
}

function KpiCard({
    label,
    value,
    sub,
}: {
    label: string;
    value: string | number;
    sub: string;
}) {
    return (
        <div className="rounded-3xl p-4" style={surfaceCard}>
            <div className="text-[11px] font-bold" style={text.muted}>{label}</div>
            <div className="text-xl md:text-2xl font-black mt-1.5" style={text.heading}>{value}</div>
            <div className="text-[11px] mt-1 font-semibold" style={text.secondary}>{sub}</div>
        </div>
    );
}
function normalizeBoolSetting(value: string | undefined, fallback: boolean) {
    return String(value ?? (fallback ? 'true' : 'false')).trim().toLowerCase() === 'true'
        ? 'true'
        : 'false';
}

function getOrderSourceMeta(source: string) {
    const normalized = String(source || '').trim().toLowerCase();

    if (normalized === 'telegram') {
        return {
            label: 'تيليغرام',
            style: {
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
            } as React.CSSProperties,
        };
    }

    if (normalized === 'web' || normalized === 'telegram_web') {
        return {
            label: 'ويب',
            style: {
                background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
            } as React.CSSProperties,
        };
    }

    return {
        label: normalized || 'غير محدد',
        style: {
            background: 'var(--bg-subtle)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
        } as React.CSSProperties,
    };
}

function SourceBadge({ source }: { source: string }) {
    const meta = getOrderSourceMeta(source);

    return (
        <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black"
            style={meta.style}
        >
            {meta.label}
        </span>
    );
}

function ChannelToggle({
    label,
    hint,
    enabled,
    disabled,
    onToggle,
}: {
    label: string;
    hint: string;
    enabled: boolean;
    disabled?: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="rounded-2xl p-3 flex items-center justify-between gap-3" style={subtleCard}>
            <div className="min-w-0">
                <div className="text-sm font-black" style={text.heading}>
                    {label}
                </div>
                <div className="text-[11px] mt-1 font-semibold" style={text.muted}>
                    {hint}
                </div>
            </div>

            <button
                type="button"
                onClick={onToggle}
                disabled={disabled}
                className="px-3.5 py-2 rounded-2xl text-xs font-black disabled:opacity-60"
                style={
                    enabled
                        ? {
                            background: 'var(--primary)',
                            color: '#fff',
                            border: '1px solid transparent',
                        }
                        : {
                            background: 'var(--bg-card)',
                            color: 'var(--text-heading)',
                            border: '1px solid var(--border)',
                        }
                }
            >
                {enabled ? 'مفعّل' : 'متوقف'}
            </button>
        </div>
    );
}

function ActionButton({
    children,
    onClick,
    disabled,
    primary = false,
    danger = false,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-black disabled:opacity-60 min-w-[128px]"
            style={
                primary
                    ? { background: 'var(--primary)', color: '#fff' }
                    : danger
                        ? {
                            background: 'rgba(239,68,68,0.08)',
                            color: '#dc2626',
                            border: '1px solid rgba(239,68,68,0.18)',
                        }
                        : {
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-heading)',
                            border: '1px solid var(--border)',
                        }
            }
        >
            {children}
        </button>
    );
}

function OrderDetailsPanel({
    order,
    loading,
    onMarkReviewed,
    onCancel,
    onExecute,
    onNotifyDelivered,
    onOpenMessageModal,
    busy,
    notifyBusy,
}: {
    order: CustomerOrder | null;
    loading: boolean;
    onMarkReviewed: (order: CustomerOrder) => void;
    onCancel: (order: CustomerOrder) => void;
    onExecute: (order: CustomerOrder) => void;
    onNotifyDelivered: (order: CustomerOrder) => void;
    onOpenMessageModal: (order: CustomerOrder) => void;
    busy: boolean;
    notifyBusy: boolean;
}) {
    const { fmt } = useCurrency();

    if (loading) {
        return (
            <div className="rounded-3xl p-5 animate-pulse" style={surfaceCard}>
                <div className="h-6 rounded-xl mb-4" style={{ background: 'var(--bg-subtle)' }} />
                <div className="h-24 rounded-2xl" style={{ background: 'var(--bg-subtle)' }} />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="rounded-3xl p-8 text-center" style={surfaceCard}>
                <div
                    className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}
                >
                    <ShoppingBag size={24} />
                </div>

                <div className="text-sm font-black" style={text.heading}>
                    اختر طلبًا من القائمة
                </div>
                <div className="text-xs mt-2 font-semibold" style={text.muted}>
                    ستظهر هنا التفاصيل الكاملة والبنود والإجراءات
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
            <div
                className="px-4 md:px-5 py-4 border-b"
                style={{
                    borderColor: 'var(--border)',
                    background: 'color-mix(in srgb, var(--bg-card) 92%, var(--bg-subtle))',
                }}
            >
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg font-black" style={text.heading}>
                                    {order.order_number}
                                </h2>
                                <StatusBadge status={order.status} />
                                <SourceBadge source={order.source} />
                            </div>

                            <div className="text-xs mt-1.5 font-semibold" style={text.muted}>
                                تاريخ الإنشاء: {fmtDate(order.created_at)}
                            </div>
                        </div>

                        <div className="text-left flex-shrink-0">
                            <div className="text-sm font-black" style={text.heading}>
                                {fmt(order.total_usd)}
                            </div>
                            <div className="text-[11px] mt-1 font-semibold" style={text.muted}>
                                {getCustomerOrderPaymentLabel(order.payment_method)}
                            </div>
                        </div>
                    </div>

                    <div
                        className="rounded-2xl p-3 flex flex-wrap gap-2"
                        style={subtleCard}
                    >
                        {(order.status === 'new' || order.status === 'reviewed') && (
                            <ActionButton onClick={() => onExecute(order)} disabled={busy} primary>
                                <ShoppingBag size={15} />
                                تنفيذ الطلب
                            </ActionButton>
                        )}
                                                {order.source === 'telegram' && order.telegram_chat_id && (
                            <ActionButton
                                onClick={() => onOpenMessageModal(order)}
                                disabled={busy || notifyBusy}
                            >
                                <MessageSquare size={15} />
                                مراسلة الزبون
                            </ActionButton>
                        )}
                        {order.status === 'converted' && order.source === 'telegram' && !order.delivery_notified_at && (
                            <ActionButton
                                onClick={() => onNotifyDelivered(order)}
                                disabled={busy || notifyBusy || !order.telegram_chat_id}
                                primary
                            >
                                {notifyBusy ? (
                                    <>
                                        <Loader2 size={15} className="animate-spin" />
                                        جارٍ إرسال الإشعار...
                                    </>
                                ) : (
                                    <>
                                        <Check size={15} />
                                        تم التسليم وإشعار الزبون
                                    </>
                                )}
                                                        {order.source === 'telegram' && order.last_manual_message_at && (
                            <div
                                className="rounded-2xl px-4 py-3 text-sm font-bold"
                                style={{
                                    background: 'rgba(168,85,247,0.10)',
                                    color: '#7c3aed',
                                    border: '1px solid rgba(168,85,247,0.18)',
                                }}
                            >
                                تم إرسال آخر ملاحظة للزبون في: {fmtDate(order.last_manual_message_at)}
                            </div>
                        )}
                            </ActionButton>
                            
                        )}

                        {order.status === 'new' && (
                            <ActionButton onClick={() => onMarkReviewed(order)} disabled={busy}>
                                <Check size={15} />
                                مراجعة الطلب
                            </ActionButton>
                        )}

                        {(order.status === 'new' || order.status === 'reviewed') && (
                            <ActionButton onClick={() => onCancel(order)} disabled={busy} danger>
                                <X size={15} />
                                إلغاء الطلب
                            </ActionButton>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-4 md:p-5 space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-3xl p-4 space-y-3" style={subtleCard}>
                        <div className="flex items-center gap-2">
                            <User size={15} style={{ color: 'var(--text-secondary)' }} />
                            <div className="text-sm font-black" style={text.heading}>بيانات الطلب</div>
                        </div>

                        <Row label="اسم صاحب الطلب" value={order.customer_name} />
                        <Row label="اسم المستلم" value={order.recipient_name || '—'} />
                        <Row label="الهاتف" value={order.phone || '—'} />
                        <Row label="المصدر" value={getOrderSourceMeta(order.source).label} />
                        <Row label="طريقة الدفع" value={getCustomerOrderPaymentLabel(order.payment_method)} />
                        <Row label="العملة المختارة" value={order.currency_code} />
                        <Row label="المستودع" value={order.warehouse_name || '—'} />
                    </div>

                    <div className="rounded-3xl p-4 space-y-3" style={subtleCard}>
                        <div className="flex items-center gap-2">
                            <FileText size={15} style={{ color: 'var(--text-secondary)' }} />
                            <div className="text-sm font-black" style={text.heading}>ملخص مالي</div>
                        </div>

                        <Row label="الإجمالي الأساسي" value={fmt(order.total_usd)} />
                        {order.status === 'converted' && (
                            <Row
                                label="رقم الفاتورة"
                                value={order.converted_sale_invoice_number || '—'}
                            />
                        )}
                        <Row label="سعر الصرف" value={Number(order.exchange_rate || 1).toLocaleString('en-US')} />
                        <Row
                            label="ملاحظات"
                            value={order.notes?.trim() ? order.notes : 'لا توجد ملاحظات'}
                            multiLine
                        />

                        {order.cancel_reason && (
                            <Row
                                label="سبب الإلغاء"
                                value={order.cancel_reason}
                                multiLine
                            />
                        )}
                    </div>
                </div>

                <div className="rounded-3xl overflow-hidden" style={subtleCard}>
                    <div
                        className="grid grid-cols-12 gap-3 px-4 py-3 border-b text-xs font-black"
                        style={{
                            borderColor: 'var(--border)',
                            color: 'var(--text-muted)',
                            background: 'color-mix(in srgb, var(--bg-card) 70%, var(--bg-subtle))',
                        }}
                    >
                        <div className="col-span-12 md:col-span-5">الصنف</div>
                        <div className="col-span-4 md:col-span-2">الكمية</div>
                        <div className="col-span-4 md:col-span-2">السعر</div>
                        <div className="col-span-4 md:col-span-3">الإجمالي</div>
                    </div>

                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {order.items.map((item) => (
                            <div key={item.id} className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center">
                                <div className="col-span-12 md:col-span-5 min-w-0">
                                    <div className="text-sm font-black truncate" style={text.heading}>
                                        {item.product_name_snapshot}
                                    </div>
                                    <div className="text-[11px] mt-1 font-semibold" style={text.muted}>
                                        {item.unit_snapshot}
                                    </div>
                                </div>

                                <div className="col-span-4 md:col-span-2">
                                    <div className="text-sm font-black" style={text.body}>
                                        {Number(item.quantity).toLocaleString('en-US', {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 3,
                                        })}
                                    </div>
                                </div>

                                <div className="col-span-4 md:col-span-2">
                                    <div className="text-sm font-black" style={text.body}>
                                        {fmt(item.unit_price_usd)}
                                    </div>
                                </div>

                                <div className="col-span-4 md:col-span-3">
                                    <div className="text-sm font-black" style={text.body}>
                                        {fmt(item.line_total_usd)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {(order.status === 'converted' || order.status === 'cancelled') && (
                    <div className="space-y-3">
                        {order.status === 'converted' && (
                            <div
                                className="rounded-2xl px-4 py-3 text-sm font-bold"
                                style={{
                                    background: 'rgba(16,185,129,0.10)',
                                    color: '#047857',
                                    border: '1px solid rgba(16,185,129,0.18)',
                                }}
                            >
                                تم تحويل هذا الطلب سابقًا إلى فاتورة بيع.
                                {order.converted_sale_invoice_number ? ` رقم الفاتورة: ${order.converted_sale_invoice_number}` : ''}
                            </div>
                        )}

                        {order.status === 'cancelled' && (
                            <div
                                className="rounded-2xl px-4 py-3 text-sm font-bold"
                                style={{
                                    background: 'rgba(239,68,68,0.10)',
                                    color: '#dc2626',
                                    border: '1px solid rgba(239,68,68,0.18)',
                                }}
                            >
                                تم إلغاء هذا الطلب.
                            </div>
                        )}

                        {order.source === 'telegram' && order.delivery_notified_at && (
                            <div
                                className="rounded-2xl px-4 py-3 text-sm font-bold"
                                style={{
                                    background: 'rgba(59,130,246,0.10)',
                                    color: '#1d4ed8',
                                    border: '1px solid rgba(59,130,246,0.18)',
                                }}
                            >
                                تم إشعار الزبون بالتسليم في: {fmtDate(order.delivery_notified_at)}
                            </div>
                        )}

                        {order.source === 'telegram' && order.cancel_notified_at && (
                            <div
                                className="rounded-2xl px-4 py-3 text-sm font-bold"
                                style={{
                                    background: 'rgba(239,68,68,0.10)',
                                    color: '#dc2626',
                                    border: '1px solid rgba(239,68,68,0.18)',
                                }}
                            >
                                تم إشعار الزبون بإلغاء الطلب في: {fmtDate(order.cancel_notified_at)}
                            </div>
                        )}

                        {order.source === 'telegram' && !order.telegram_chat_id && (
                            <div
                                className="rounded-2xl px-4 py-3 text-sm font-bold"
                                style={{
                                    background: 'rgba(245,158,11,0.10)',
                                    color: '#b45309',
                                    border: '1px solid rgba(245,158,11,0.18)',
                                }}
                            >
                                هذا الطلب من تيليغرام لكنه لا يحتوي Chat ID صالحًا للإشعار.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Row({
    label,
    value,
    multiLine = false,
}: {
    label: string;
    value: string;
    multiLine?: boolean;
}) {
    return (
        <div className={`flex ${multiLine ? 'flex-col gap-1' : 'items-center justify-between gap-3'}`}>
            <div className="text-xs font-bold" style={text.muted}>{label}</div>
            <div
                className={`${multiLine ? 'text-sm leading-7' : 'text-sm'} font-black`}
                style={text.body}
            >
                {value}
            </div>
        </div>
    );
}

export default function IncomingOrdersPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const setPendingOrderExecution = usePosStore((s) => s.setPendingOrderExecution);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<CustomerOrderStatus | 'all'>('all');
    const [source, setSource] = useState<'all' | 'web' | 'telegram'>('all');
    const [page, setPage] = useState(1);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelTarget, setCancelTarget] = useState<CustomerOrder | null>(null);
    const user = useAuthStore((s) => s.user);
    const canManageOrderChannels = user?.role === 'admin';
        const [messageTarget, setMessageTarget] = useState<CustomerOrder | null>(null);
    const [messageText, setMessageText] = useState('');

    const [channelsOpen, setChannelsOpen] = useState(false);
    const [channelForm, setChannelForm] = useState({
        customer_orders_enabled: 'true',
        customer_orders_web_enabled: 'true',
        customer_orders_telegram_enabled: 'false',
        customer_orders_telegram_link: '',
    });

    const settingsQuery = useQuery({
        queryKey: ['settings'],
        queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
        staleTime: 0,
    });

    useEffect(() => {
        const settings = settingsQuery.data;
        if (!settings) return;

        setChannelForm({
            customer_orders_enabled: normalizeBoolSetting(settings.customer_orders_enabled, true),
            customer_orders_web_enabled: normalizeBoolSetting(settings.customer_orders_web_enabled, true),
            customer_orders_telegram_enabled: normalizeBoolSetting(settings.customer_orders_telegram_enabled, false),
            customer_orders_telegram_link: String(settings.customer_orders_telegram_link ?? ''),
        });
    }, [settingsQuery.data]);

    const saveOrderChannelsMutation = useMutation({
        mutationFn: (updates: Record<string, string>) => settingsApi.bulkUpdate(updates),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
    });

    const ordersChannelEnabled = channelForm.customer_orders_enabled === 'true';
    const webChannelEnabled = channelForm.customer_orders_web_enabled === 'true';
    const telegramChannelEnabled = channelForm.customer_orders_telegram_enabled === 'true';

    const resetChannelForm = () => {
        const settings = settingsQuery.data;
        if (!settings) return;

        setChannelForm({
            customer_orders_enabled: normalizeBoolSetting(settings.customer_orders_enabled, true),
            customer_orders_web_enabled: normalizeBoolSetting(settings.customer_orders_web_enabled, true),
            customer_orders_telegram_enabled: normalizeBoolSetting(settings.customer_orders_telegram_enabled, false),
            customer_orders_telegram_link: String(settings.customer_orders_telegram_link ?? ''),
        });
    };

    const handleSaveOrderChannels = () => {
        if (!canManageOrderChannels) return;

        saveOrderChannelsMutation.mutate({
            customer_orders_enabled: channelForm.customer_orders_enabled,
            customer_orders_web_enabled: channelForm.customer_orders_web_enabled,
            customer_orders_telegram_enabled: channelForm.customer_orders_telegram_enabled,
            customer_orders_telegram_link: channelForm.customer_orders_telegram_link.trim(),
        });
    };
    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['customer-orders', search, status, source, page],
        queryFn: async () => {
            const res = await customerOrdersApi.getAll({
                q: search.trim() || undefined,
                status,
                source,
                page,
                limit: 20,
            });
            return res.data;
        },
        placeholderData: (prev) => prev,
    });

    const selectedOrderQuery = useQuery({
        queryKey: ['customer-order-details', selectedOrderId],
        queryFn: async () => {
            const res = await customerOrdersApi.getById(selectedOrderId!);
            return res.data.order;
        },
        enabled: selectedOrderId !== null,
    });

    const updateStatusMutation = useMutation({
        mutationFn: (payload: {
            id: number;
            status: 'new' | 'reviewed' | 'cancelled';
            cancel_reason?: string | null;
        }) => customerOrdersApi.updateStatus(payload.id, payload),
        onSuccess: async (res) => {
            const updatedOrder = res.data.order;

            await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
            await queryClient.invalidateQueries({ queryKey: ['customer-orders', 'pending-badge'] });
            await queryClient.invalidateQueries({ queryKey: ['customer-order-details', updatedOrder.id] });

            if (selectedOrderId === updatedOrder.id) {
                queryClient.setQueryData(['customer-order-details', updatedOrder.id], updatedOrder);
            }

            setCancelTarget(null);
            setCancelReason('');

            if (updatedOrder.status === 'cancelled' && selectedOrderId === updatedOrder.id) {
                setSelectedOrderId(null);
            }
        },
    });
    const notifyDeliveredMutation = useMutation({
        mutationFn: (id: number) => customerOrdersApi.notifyDelivered(id),
        onSuccess: async (res) => {
            const updatedOrder = res.data.order;

            await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
            await queryClient.invalidateQueries({ queryKey: ['customer-order-details', updatedOrder.id] });

            if (selectedOrderId === updatedOrder.id) {
                queryClient.setQueryData(['customer-order-details', updatedOrder.id], updatedOrder);
            }
        },
    });

        const sendTelegramNoteMutation = useMutation({
        mutationFn: (payload: { id: number; message: string }) =>
            customerOrdersApi.sendTelegramNote(payload.id, { message: payload.message }),
        onSuccess: async (res) => {
            const updatedOrder = res.data.order;

            await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
            await queryClient.invalidateQueries({ queryKey: ['customer-order-details', updatedOrder.id] });

            if (selectedOrderId === updatedOrder.id) {
                queryClient.setQueryData(['customer-order-details', updatedOrder.id], updatedOrder);
            }

            setMessageTarget(null);
            setMessageText('');
        },
    });
    const orders = data?.orders ?? [];
    const pagination = data?.pagination;

    const stats = useMemo(() => {
        return {
            total: orders.length,
            newCount: orders.filter((o) => o.status === 'new').length,
            reviewedCount: orders.filter((o) => o.status === 'reviewed').length,
            cancelledCount: orders.filter((o) => o.status === 'cancelled').length,
        };
    }, [orders]);

    const handleRefresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
        if (selectedOrderId) {
            await queryClient.invalidateQueries({ queryKey: ['customer-order-details', selectedOrderId] });
        }
    };
        const handleOpenMessageModal = (order: CustomerOrder) => {
        setMessageTarget(order);
        setMessageText('');
    };

    const handleSendTelegramNote = () => {
        if (!messageTarget) return;

        const normalized = messageText.trim();
        if (!normalized) return;

        sendTelegramNoteMutation.mutate({
            id: messageTarget.id,
            message: normalized,
        });
    };

    const handleMarkReviewed = (order: CustomerOrder) => {
        updateStatusMutation.mutate({
            id: order.id,
            status: 'reviewed',
        });
    };

    const handleExecuteOrder = (order: CustomerOrder) => {
        setPendingOrderExecution({
            order_id: order.id,
            source_order_id: order.id,
            sourceOrderId: order.id,
            order_number: order.order_number,
            customer_name: order.customer_name,
            recipient_name: order.recipient_name,
            phone: order.phone,
            notes: order.notes,
            payment_method: order.payment_method,
            currency_code: order.currency_code,
            total_usd: Number(order.total_usd || 0),
            warehouse_id: order.warehouse_id,
            items: order.items.map((item) => ({
                product_id: item.product_id,
                quantity: Number(item.quantity || 0),
                unit_price_usd: Number(item.unit_price_usd || 0),
            })),
        });

        if (order.status === 'new') {
            updateStatusMutation.mutate({
                id: order.id,
                status: 'reviewed',
            });
        }

        setSelectedOrderId(null);
        navigate('/pos');
    };
    const handleNotifyDelivered = (order: CustomerOrder) => {
        notifyDeliveredMutation.mutate(order.id);
    };
    const handleOpenCancel = (order: CustomerOrder) => {
        setCancelTarget(order);
        setCancelReason(order.cancel_reason || '');
    };

    const handleConfirmCancel = () => {
        if (!cancelTarget) return;

        updateStatusMutation.mutate({
            id: cancelTarget.id,
            status: 'cancelled',
            cancel_reason: cancelReason.trim(),
        });
    };

    return (
        <div className="space-y-4" dir="rtl">
            <div
                className="rounded-3xl px-5 py-4 md:px-6 md:py-5"
                style={{
                    ...surfaceCard,
                    background:
                        'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle)) 0%, var(--bg-card) 100%)',
                }}
            >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl md:text-[28px] font-black tracking-tight" style={text.heading}>
                            الطلبات الواردة
                        </h1>
                        <p className="text-sm font-semibold mt-1" style={text.secondary}>
                            متابعة الطلبات القادمة من قنوات الطلب الإلكتروني قبل تحويلها لاحقًا إلى بيع
                        </p>
                    </div>

                    <button
                        onClick={handleRefresh}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black"
                        style={{
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-heading)',
                            border: '1px solid var(--border)',
                        }}
                    >
                        <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                        تحديث
                    </button>
                </div>
            </div>
            <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="text-lg font-black" style={text.heading}>
                            قنوات الطلب الإلكتروني
                        </div>
                        <div className="text-xs mt-1 font-semibold" style={text.muted}>
                            نفس صفحة الطلبات الحالية، مع إدارة القنوات التي تُدخل الطلبات إلى هذه القائمة
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                            <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black"
                                style={
                                    ordersChannelEnabled
                                        ? {
                                            background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                                            color: 'var(--primary)',
                                            border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
                                        }
                                        : {
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)',
                                        }
                                }
                            >
                                {ordersChannelEnabled ? 'الطلبات الإلكترونية مفعّلة' : 'الطلبات الإلكترونية متوقفة'}
                            </span>

                            <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black"
                                style={
                                    webChannelEnabled
                                        ? {
                                            background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                                            color: 'var(--primary)',
                                            border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
                                        }
                                        : {
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)',
                                        }
                                }
                            >
                                {webChannelEnabled ? 'قناة الويب مفعّلة' : 'قناة الويب متوقفة'}
                            </span>

                            <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black"
                                style={
                                    telegramChannelEnabled
                                        ? {
                                            background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
                                            color: 'var(--primary)',
                                            border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
                                        }
                                        : {
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)',
                                        }
                                }
                            >
                                {telegramChannelEnabled ? 'قناة تيليغرام مفعّلة' : 'قناة تيليغرام متوقفة'}
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setChannelsOpen((v) => !v)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black"
                        style={{
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-heading)',
                            border: '1px solid var(--border)',
                        }}
                    >
                        {channelsOpen ? 'إخفاء إعدادات القنوات' : 'إدارة القنوات'}
                    </button>
                </div>

                {channelsOpen && (
                    <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                        <ChannelToggle
                            label="تفعيل الطلبات الإلكترونية"
                            hint="إذا توقفت، يبقى سجل الطلبات موجودًا لكن القنوات الجديدة تكون معطلة منطقيًا"
                            enabled={ordersChannelEnabled}
                            disabled={!canManageOrderChannels || saveOrderChannelsMutation.isPending}
                            onToggle={() =>
                                setChannelForm((prev) => ({
                                    ...prev,
                                    customer_orders_enabled:
                                        prev.customer_orders_enabled === 'true' ? 'false' : 'true',
                                }))
                            }
                        />

                        <ChannelToggle
                            label="قناة الويب"
                            hint="القناة الحالية الخاصة بصفحة الطلب العامة"
                            enabled={webChannelEnabled}
                            disabled={!canManageOrderChannels || saveOrderChannelsMutation.isPending}
                            onToggle={() =>
                                setChannelForm((prev) => ({
                                    ...prev,
                                    customer_orders_web_enabled:
                                        prev.customer_orders_web_enabled === 'true' ? 'false' : 'true',
                                }))
                            }
                        />

                        <ChannelToggle
                            label="قناة تيليغرام"
                            hint="تهيئة أولية للقناة دون استقبال الطلبات فعليًا بعد"
                            enabled={telegramChannelEnabled}
                            disabled={!canManageOrderChannels || saveOrderChannelsMutation.isPending}
                            onToggle={() =>
                                setChannelForm((prev) => ({
                                    ...prev,
                                    customer_orders_telegram_enabled:
                                        prev.customer_orders_telegram_enabled === 'true' ? 'false' : 'true',
                                }))
                            }
                        />

                        <div className="rounded-2xl p-3 space-y-2" style={subtleCard}>
                            <div className="text-sm font-black" style={text.heading}>
                                رابط أو يوزر تيليغرام
                            </div>
                            <div className="text-[11px] font-semibold" style={text.muted}>
                                مثال: https://t.me/your_bot أو @your_bot
                            </div>

                            <input
                                value={channelForm.customer_orders_telegram_link}
                                onChange={(e) =>
                                    setChannelForm((prev) => ({
                                        ...prev,
                                        customer_orders_telegram_link: e.target.value,
                                    }))
                                }
                                disabled={!canManageOrderChannels || saveOrderChannelsMutation.isPending}
                                placeholder="أدخل رابط أو يوزر تيليغرام"
                                className="w-full rounded-2xl px-3.5 py-3 text-sm font-medium outline-none"
                                style={{
                                    background: 'var(--bg-card)',
                                    color: 'var(--text-body)',
                                    border: '1px solid var(--border)',
                                }}
                            />
                        </div>

                        <div className="xl:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
                            <div className="text-xs font-semibold" style={text.muted}>
                                {canManageOrderChannels
                                    ? 'تُحفظ هذه الإعدادات داخل Settings الحالية بدون أي Migration جديد.'
                                    : 'يمكنك عرض حالة القنوات فقط. تعديل الإعدادات متاح للمدير العام.'}
                            </div>

                            {canManageOrderChannels && (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={resetChannelForm}
                                        disabled={saveOrderChannelsMutation.isPending || settingsQuery.isLoading}
                                        className="px-3.5 py-2.5 rounded-2xl text-sm font-black disabled:opacity-60"
                                        style={{
                                            background: 'var(--bg-subtle)',
                                            color: 'var(--text-heading)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        إعادة تحميل
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleSaveOrderChannels}
                                        disabled={saveOrderChannelsMutation.isPending || settingsQuery.isLoading}
                                        className="px-4 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                                        style={{ background: 'var(--primary)' }}
                                    >
                                        {saveOrderChannelsMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {saveOrderChannelsMutation.isError && (
                            <div
                                className="xl:col-span-2 rounded-2xl px-3 py-2 text-xs font-bold"
                                style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-heading)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                {((saveOrderChannelsMutation.error as any)?.response?.data?.message) ||
                                    'تعذر حفظ إعدادات القنوات'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard label="الطلبات الظاهرة" value={stats.total} sub="حسب الفلتر الحالي" />
                <KpiCard label="طلبات جديدة" value={stats.newCount} sub="تحتاج انتباهًا" />
                <KpiCard label="طلبات مُراجعة" value={stats.reviewedCount} sub="جاهزة للمتابعة" />
                <KpiCard label="طلبات ملغية" value={stats.cancelledCount} sub="ضمن النتائج الحالية" />
            </div>

            <div className="space-y-4">
                <div className="rounded-3xl p-4" style={surfaceCard}>
                    <div className="grid grid-cols-1 gap-3">
                        <div className="relative">
                            <Search
                                size={15}
                                className="absolute top-1/2 -translate-y-1/2 right-3"
                                style={{ color: 'var(--text-muted)' }}
                            />
                            <input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="ابحث باسم صاحب الطلب أو المستلم أو الهاتف..."
                                className="w-full rounded-2xl pr-10 pl-3.5 py-3 text-sm font-medium outline-none"
                                style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-body)',
                                    border: '1px solid var(--border)',
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <select
                                value={status}
                                onChange={(e) => {
                                    setStatus(e.target.value as CustomerOrderStatus | 'all');
                                    setPage(1);
                                }}
                                className="w-full rounded-2xl px-3.5 py-3 text-sm font-medium outline-none"
                                style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-body)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <option value="all">كل الحالات</option>
                                <option value="new">جديد</option>
                                <option value="reviewed">مُراجع</option>
                                <option value="converted">تم تحويله</option>
                                <option value="cancelled">ملغي</option>
                            </select>

                            <select
                                value={source}
                                onChange={(e) => {
                                    setSource(e.target.value as 'all' | 'web' | 'telegram');
                                    setPage(1);
                                }}
                                className="w-full rounded-2xl px-3.5 py-3 text-sm font-medium outline-none"
                                style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-body)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <option value="all">كل المصادر</option>
                                <option value="web">ويب</option>
                                <option value="telegram">تيليغرام</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
                    <div
                        className="px-4 py-3 border-b text-sm font-black"
                        style={{
                            borderColor: 'var(--border)',
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-heading)',
                        }}
                    >
                        قائمة الطلبات
                    </div>

                    {isLoading ? (
                        <div className="p-8 text-center text-sm font-semibold" style={text.muted}>
                            جاري تحميل الطلبات...
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="p-8 text-center">
                            <div
                                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                                style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}
                            >
                                <ShoppingBag size={24} />
                            </div>
                            <div className="text-sm font-black" style={text.heading}>لا توجد طلبات</div>
                            <div className="text-xs mt-2 font-semibold" style={text.muted}>
                                لم يصل أي طلب مطابق للفلاتر الحالية
                            </div>
                        </div>
                    ) : (
                        <div
                            className="divide-y overflow-y-auto"
                            style={{
                                borderColor: 'var(--border)',
                                maxHeight: 'calc(100vh - 320px)',
                            }}
                        >
                            {orders.map((order) => (
                                <OrderListCard
                                    key={order.id}
                                    order={order}
                                    selected={selectedOrderId === order.id}
                                    onClick={() => setSelectedOrderId(order.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {pagination && pagination.pages > 1 && (
                    <div className="rounded-3xl p-4 flex items-center justify-between gap-3" style={surfaceCard}>
                        <div className="text-xs font-semibold" style={text.muted}>
                            صفحة {pagination.page} من {pagination.pages}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={pagination.page <= 1}
                                className="px-3 py-2 rounded-2xl text-xs font-black disabled:opacity-40"
                                style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-heading)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                السابق
                            </button>

                            <button
                                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                                disabled={pagination.page >= pagination.pages}
                                className="px-3 py-2 rounded-2xl text-xs font-black disabled:opacity-40"
                                style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-heading)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                التالي
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {selectedOrderId !== null && (
                <div
                    className="fixed inset-0 z-[9990] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                    onClick={() => setSelectedOrderId(null)}
                >
                    <div
                        className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl"
                        onClick={(e) => e.stopPropagation()}
                        dir="rtl"
                    >
                        <button
                            onClick={() => setSelectedOrderId(null)}
                            className="absolute top-3 left-3 z-10 w-10 h-10 rounded-2xl flex items-center justify-center"
                            style={{
                                background: 'var(--bg-card)',
                                color: 'var(--text-heading)',
                                border: '1px solid var(--border)',
                                boxShadow: 'var(--shadow-card)',
                            }}
                        >
                            <X size={18} />
                        </button>

                                                <OrderDetailsPanel
                            order={selectedOrderQuery.data ?? null}
                            loading={selectedOrderQuery.isLoading}
                            onMarkReviewed={handleMarkReviewed}
                            onCancel={handleOpenCancel}
                            onExecute={handleExecuteOrder}
                            onNotifyDelivered={handleNotifyDelivered}
                            onOpenMessageModal={handleOpenMessageModal}
                            busy={updateStatusMutation.isPending}
                            notifyBusy={notifyDeliveredMutation.isPending}
                        />
                    </div>
                </div>
            )}
                        {messageTarget && (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                >
                    <div
                        className="w-full max-w-md rounded-3xl overflow-hidden"
                        style={surfaceCard}
                        dir="rtl"
                    >
                        <div
                            className="px-5 py-4 border-b"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <div className="flex items-center gap-2">
                                <MessageSquare size={17} style={{ color: 'var(--primary)' }} />
                                <div className="text-base font-black" style={text.heading}>
                                    مراسلة الزبون
                                </div>
                            </div>
                            <div className="text-xs mt-2 font-semibold" style={text.muted}>
                                {messageTarget.order_number} — {messageTarget.customer_name}
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold mb-1.5" style={text.secondary}>
                                    الملاحظة
                                </label>

                                <textarea
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value.slice(0, 100))}
                                    rows={4}
                                    maxLength={100}
                                    className="w-full rounded-2xl px-3 py-3 text-sm outline-none resize-none"
                                    style={{
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-body)',
                                        border: '1px solid var(--border)',
                                    }}
                                    placeholder="اكتب ملاحظة قصيرة للزبون..."
                                />

                                <div className="text-[11px] mt-2 font-semibold" style={text.muted}>
                                    {messageText.trim().length}/100 حرف
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setMessageTarget(null);
                                        setMessageText('');
                                    }}
                                    disabled={sendTelegramNoteMutation.isPending}
                                    className="flex-1 py-2.5 rounded-2xl text-sm font-black"
                                    style={{
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-heading)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    إغلاق
                                </button>

                                <button
                                    onClick={handleSendTelegramNote}
                                    disabled={sendTelegramNoteMutation.isPending || !messageText.trim()}
                                    className="flex-1 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                                    style={{ background: 'var(--primary)' }}
                                >
                                    {sendTelegramNoteMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {cancelTarget && (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                >
                    <div
                        className="w-full max-w-md rounded-3xl overflow-hidden"
                        style={surfaceCard}
                        dir="rtl"
                    >
                        <div
                            className="px-5 py-4 border-b"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={17} style={{ color: '#dc2626' }} />
                                <div className="text-base font-black" style={text.heading}>إلغاء الطلب</div>
                            </div>
                            <div className="text-xs mt-2 font-semibold" style={text.muted}>
                                {cancelTarget.order_number} — {cancelTarget.customer_name}
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold mb-1.5" style={text.secondary}>
                                    سبب الإلغاء
                                </label>
                                <textarea
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    rows={4}
                                    className="w-full rounded-2xl px-3 py-3 text-sm outline-none resize-none"
                                    style={{
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-body)',
                                        border: '1px solid var(--border)',
                                    }}
                                    placeholder="اكتب سبب الإلغاء..."
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setCancelTarget(null);
                                        setCancelReason('');
                                    }}
                                    className="flex-1 py-2.5 rounded-2xl text-sm font-black"
                                    style={{
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-heading)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    إلغاء
                                </button>

                                <button
                                    onClick={handleConfirmCancel}
                                    disabled={updateStatusMutation.isPending || !cancelReason.trim()}
                                    className="flex-1 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                                    style={{ background: '#dc2626' }}
                                >
                                    {updateStatusMutation.isPending ? 'جارٍ الحفظ...' : 'تأكيد الإلغاء'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function OrderListCard({
    order,
    selected,
    onClick,
}: {
    order: CustomerOrderListItem;
    selected: boolean;
    onClick: () => void;
}) {
    const { fmt } = useCurrency();

    return (
        <button
            onClick={onClick}
            className="w-full text-right px-3.5 py-3 transition-colors hover:opacity-95"
            style={{
                background: selected ? 'color-mix(in srgb, var(--primary) 8%, var(--bg-card))' : 'transparent',
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black truncate" style={text.heading}>
                            {order.customer_name}
                        </span>
                        <StatusBadge status={order.status} />
                        <SourceBadge source={order.source} />
                    </div>

                    <div className="text-[11px] mt-1.5 font-semibold" style={text.muted}>
                        {order.order_number}
                    </div>

                    {(order.recipient_name || order.phone) && (
                        <div className="text-[11px] mt-1.5 font-semibold flex items-center gap-2 flex-wrap" style={text.muted}>
                            {order.recipient_name && (
                                <span className="inline-flex items-center gap-1">
                                    <UserCircle2 size={11} />
                                    {order.recipient_name}
                                </span>
                            )}

                            {order.phone && (
                                <span className="inline-flex items-center gap-1">
                                    <Phone size={11} />
                                    {order.phone}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="text-left flex-shrink-0">
                    <div className="text-sm font-black" style={text.heading}>
                        {fmt(order.total_usd)}
                    </div>
                    <div className="text-[10px] mt-1 font-semibold" style={text.muted}>
                        {getCustomerOrderPaymentLabel(order.payment_method)}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-2">
                <div className="text-[10px] font-semibold" style={text.muted}>
                    البنود: {order.items_count}
                </div>

                <div className="flex items-center gap-2 text-[10px] font-semibold" style={text.muted}>
                    {order.warehouse_name && <span>{order.warehouse_name}</span>}
                    <span>{fmtDate(order.created_at)}</span>
                </div>
            </div>
        </button>
    );
}