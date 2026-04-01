import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stockTransfersApi, type StockTransfer } from '../api/stockTransfers.ts';
import { warehousesApi, type Warehouse } from '../api/warehouses.ts';
import { settingsApi } from '../api/settings.ts';
import { apiClient } from '../api/client.ts';
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
  Package,
  Plus,
  RefreshCw,
  Search,
  Warehouse as WarehouseIcon,
  X,
  FileText,
  Eye,
  AlertTriangle,
} from 'lucide-react';

type ProductLite = {
  id: number;
  name: string;
  stock_quantity?: number | string;
};

type CreateTransferItem = {
  product_id: number;
  quantity: string;
};

type CreateTransferForm = {
  from_warehouse_id: string;
  to_warehouse_id: string;
  notes: string;
  items: CreateTransferItem[];
};

const emptyForm: CreateTransferForm = {
  from_warehouse_id: '',
  to_warehouse_id: '',
  notes: '',
  items: [{ product_id: '' } as unknown as CreateTransferItem, { quantity: '' } as unknown as CreateTransferItem].slice(0, 1),
};

function fmtQty(value: number | string) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function getStatusBadge(status: StockTransfer['status']) {
  switch (status) {
    case 'pending':
      return {
        label: 'قيد الانتظار',
        style: {
          background: 'rgba(245,158,11,0.10)',
          color: '#b45309',
          border: '1px solid rgba(245,158,11,0.25)',
        } as React.CSSProperties,
      };
    case 'approved':
      return {
        label: 'معتمد',
        style: {
          background: 'rgba(59,130,246,0.10)',
          color: '#2563eb',
          border: '1px solid rgba(59,130,246,0.25)',
        } as React.CSSProperties,
      };
    case 'received':
      return {
        label: 'مستلم',
        style: {
          background: 'rgba(16,185,129,0.10)',
          color: '#059669',
          border: '1px solid rgba(16,185,129,0.25)',
        } as React.CSSProperties,
      };
    case 'cancelled':
      return {
        label: 'ملغي',
        style: {
          background: 'rgba(239,68,68,0.10)',
          color: '#dc2626',
          border: '1px solid rgba(239,68,68,0.25)',
        } as React.CSSProperties,
      };
    default:
      return {
        label: status,
        style: {
          background: 'var(--bg-subtle)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
        } as React.CSSProperties,
      };
  }
}

function CreateTransferModal({
  warehouses,
  products,
  loading,
  onClose,
  onSubmit,
}: {
  warehouses: Warehouse[];
  products: ProductLite[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    from_warehouse_id: number;
    to_warehouse_id: number;
    notes?: string;
    items: Array<{ product_id: number; quantity: number }>;
  }) => void;
}) {
  const [form, setForm] = useState<CreateTransferForm>({
    ...emptyForm,
    items: [{ product_id: '' as unknown as number, quantity: '' }],
  });
  const [error, setError] = useState('');

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: '' as unknown as number, quantity: '' }],
    }));
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index: number, patch: Partial<CreateTransferItem>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const fromId = Number(form.from_warehouse_id);
    const toId = Number(form.to_warehouse_id);

    if (!fromId) {
      setError('اختر المستودع المصدر');
      return;
    }

    if (!toId) {
      setError('اختر المستودع الوجهة');
      return;
    }

    if (fromId === toId) {
      setError('يجب أن يكون المستودع المصدر مختلفًا عن الوجهة');
      return;
    }

    if (form.items.length === 0) {
      setError('أضف منتجًا واحدًا على الأقل');
      return;
    }

    const normalizedItems = form.items.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
    }));

    if (normalizedItems.some((item) => !item.product_id)) {
      setError('اختر المنتج في كل سطر');
      return;
    }

    if (normalizedItems.some((item) => !item.quantity || Number.isNaN(item.quantity) || item.quantity <= 0)) {
      setError('الكمية يجب أن تكون أكبر من صفر');
      return;
    }

    const uniqueIds = new Set(normalizedItems.map((item) => item.product_id));
    if (uniqueIds.size !== normalizedItems.length) {
      setError('لا يمكن تكرار نفس المنتج في نفس التحويل');
      return;
    }

    setError('');
    onSubmit({
      from_warehouse_id: fromId,
      to_warehouse_id: toId,
      notes: form.notes.trim() || undefined,
      items: normalizedItems,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      dir="rtl"
    >
      <div
        className="w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
              إنشاء تحويل مخزون
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              يتم إنشاء التحويل بحالة قيد الانتظار، ويتغير المخزون فقط بعد الاعتماد
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                المستودع المصدر
              </label>
              <select
                value={form.from_warehouse_id}
                onChange={(e) => setForm((v) => ({ ...v, from_warehouse_id: e.target.value }))}
                className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-heading)',
                  border: '1px solid var(--border)',
                }}
              >
                <option value="">اختر المستودع المصدر</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                المستودع الوجهة
              </label>
              <select
                value={form.to_warehouse_id}
                onChange={(e) => setForm((v) => ({ ...v, to_warehouse_id: e.target.value }))}
                className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-heading)',
                  border: '1px solid var(--border)',
                }}
              >
                <option value="">اختر المستودع الوجهة</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              ملاحظات
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-2xl px-3 py-3 text-sm outline-none resize-none"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
              placeholder="ملاحظات اختيارية حول التحويل"
            />
          </div>

          <div
            className="rounded-3xl border overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
            >
              <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                بنود التحويل
              </div>

              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-black text-white"
                style={{ background: 'var(--primary)' }}
              >
                <Plus size={14} />
                إضافة سطر
              </button>
            </div>

            <div className="p-4 space-y-3">
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-12 md:col-span-7">
                    <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      المنتج
                    </label>
                    <select
                      value={item.product_id || ''}
                      onChange={(e) => updateItem(index, { product_id: Number(e.target.value) as unknown as number })}
                      className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <option value="">اختر المنتج</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-8 md:col-span-3">
                    <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      الكمية
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: e.target.value })}
                      className="w-full rounded-2xl px-3 py-3 text-sm outline-none"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                      placeholder="0"
                    />
                  </div>

                  <div className="col-span-4 md:col-span-2">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={form.items.length === 1}
                      className="w-full py-3 rounded-2xl text-sm font-black disabled:opacity-40"
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        color: '#dc2626',
                        border: '1px solid rgba(239,68,68,0.18)',
                      }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div
              className="rounded-2xl px-4 py-3 text-sm font-bold"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-black"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-2xl text-sm font-black text-white disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              {loading ? 'جارٍ الإنشاء...' : 'إنشاء التحويل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TransferDetailsModal({
  transfer,
  loading,
  onClose,
}: {
  transfer: StockTransfer | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!transfer && !loading) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      dir="rtl"
    >
      <div
        className="w-full max-w-3xl rounded-3xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
              تفاصيل التحويل
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'جارٍ التحميل...' : transfer?.transfer_number}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {loading || !transfer ? (
          <div className="p-8 text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل تفاصيل التحويل...
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {(() => {
              const badge = getStatusBadge(transfer.status);

              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div
                      className="rounded-2xl border p-4"
                      style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                        من مستودع
                      </div>
                      <div className="mt-2 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                        {transfer.from_warehouse_name}
                      </div>
                    </div>

                    <div
                      className="rounded-2xl border p-4"
                      style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                        إلى مستودع
                      </div>
                      <div className="mt-2 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                        {transfer.to_warehouse_name}
                      </div>
                    </div>

                    <div
                      className="rounded-2xl border p-4"
                      style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                        الحالة
                      </div>
                      <div className="mt-2">
                        <span className="inline-flex px-2.5 py-1 rounded-xl text-xs font-black" style={badge.style}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {transfer.notes && (
                    <div
                      className="rounded-2xl border p-4"
                      style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                        ملاحظات
                      </div>
                      <div className="mt-2 text-sm leading-7" style={{ color: 'var(--text-heading)' }}>
                        {transfer.notes}
                      </div>
                    </div>
                  )}

                  <div
                    className="rounded-3xl border overflow-hidden"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div
                      className="grid grid-cols-12 gap-3 px-4 py-3 border-b text-xs font-black"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}
                    >
                      <div className="col-span-8">المنتج</div>
                      <div className="col-span-4">الكمية</div>
                    </div>

                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {(transfer.items ?? []).map((item) => (
                        <div key={item.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center">
                          <div className="col-span-8 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                            {item.product_name}
                          </div>
                          <div className="col-span-4 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                            {fmtQty(item.quantity)}
                          </div>
                        </div>
                      ))}

                      {(transfer.items ?? []).length === 0 && (
                        <div className="px-4 py-8 text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                          لا توجد بنود
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    تم الإنشاء بتاريخ: {fmtDate(transfer.created_at)}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StockTransfersPage() {
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30000,
  });

  const isMultiWarehouseEnabled = settings?.enable_multi_warehouse === 'true';

  const { data: transfersData, isLoading, isFetching } = useQuery({
    queryKey: ['stock-transfers', statusFilter],
    queryFn: () => stockTransfersApi.getAll(statusFilter || undefined).then((r) => r.data.transfers),
    staleTime: 0,
    enabled: isMultiWarehouseEnabled,
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses-active-for-transfer'],
    queryFn: () => warehousesApi.getAll(true).then((r) => r.data.warehouses),
    staleTime: 30000,
    enabled: isMultiWarehouseEnabled,
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-for-transfer'],
    queryFn: async () => {
      const res = await apiClient.get('/products', {
        params: {
          is_active: 'true',
          limit: 500,
        },
      });

      const payload = res.data as any;
      const products = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.products)
          ? payload.products
          : [];

      return products.map((p: any) => ({
        id: Number(p.id),
        name: String(p.name ?? ''),
        stock_quantity: p.stock_quantity,
      })) as ProductLite[];
    },
    staleTime: 30000,
    enabled: isMultiWarehouseEnabled,
  });

  const { data: selectedTransfer, isFetching: isFetchingDetails } = useQuery({
    queryKey: ['stock-transfer-details', selectedTransferId],
    queryFn: () => stockTransfersApi.getById(Number(selectedTransferId)).then((r) => r.data.transfer),
    enabled: isMultiWarehouseEnabled && !!selectedTransferId,
    staleTime: 0,
  });

  const transfers = transfersData ?? [];
  const warehouses = warehousesData ?? [];
  const products = productsData ?? [];

  const filteredTransfers = useMemo(() => {
    const term = q.trim().toLowerCase();

    return transfers.filter((transfer) => {
      if (!term) return true;

      return (
        transfer.transfer_number.toLowerCase().includes(term) ||
        transfer.from_warehouse_name.toLowerCase().includes(term) ||
        transfer.to_warehouse_name.toLowerCase().includes(term) ||
        String(transfer.notes || '').toLowerCase().includes(term)
      );
    });
  }, [transfers, q]);

  const stats = useMemo(() => {
    return {
      total: transfers.length,
      pending: transfers.filter((t) => t.status === 'pending').length,
      approved: transfers.filter((t) => t.status === 'approved').length,
      received: transfers.filter((t) => t.status === 'received').length,
      totalQty: transfers.reduce((sum, t) => sum + Number(t.total_quantity || 0), 0),
    };
  }, [transfers]);

  const createMutation = useMutation({
    mutationFn: (payload: {
      from_warehouse_id: number;
      to_warehouse_id: number;
      notes?: string;
      items: Array<{ product_id: number; quantity: number }>;
    }) => stockTransfersApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      setCreateOpen(false);
      setNotice({ type: 'success', message: 'تم إنشاء تحويل المخزون بحالة قيد الانتظار' });
      setTimeout(() => setNotice(null), 3000);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر إنشاء تحويل المخزون',
      });
      setTimeout(() => setNotice(null), 4000);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (transferId: number) => {
      setApprovingId(transferId);
      return await stockTransfersApi.approve(transferId);
    },
    onSuccess: async (_res, transferId) => {
      await qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      await qc.invalidateQueries({ queryKey: ['stock-transfer-details', transferId] });

      setNotice({ type: 'success', message: 'تم اعتماد التحويل وتنفيذ النقل بنجاح' });
      setTimeout(() => setNotice(null), 3000);
    },
    onError: (error: any) => {
      setNotice({
        type: 'error',
        message: error?.response?.data?.message ?? 'تعذر اعتماد التحويل',
      });
      setTimeout(() => setNotice(null), 4000);
    },
    onSettled: () => {
      setApprovingId(null);
    },
  });

  if (settingsLoading) {
    return (
      <div className="space-y-5" dir="rtl">
        <div
          className="rounded-3xl border p-6 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
            جاري تحميل إعدادات الصفحة...
          </div>
        </div>
      </div>
    );
  }

  if (!isMultiWarehouseEnabled) {
    return (
      <div className="space-y-5" dir="rtl">
        <div
          className="rounded-3xl border p-5 md:p-6"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <ArrowLeftRight size={22} />
            </div>

            <div>
              <div className="text-xl font-black" style={{ color: 'var(--text-heading)' }}>
                تحويلات المخزون
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                هذه الصفحة تعمل فقط عند تفعيل نظام المستودعات المتعددة
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl border p-8 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div
            className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
          >
            <AlertTriangle size={28} />
          </div>

          <div className="text-lg font-black" style={{ color: 'var(--text-heading)' }}>
            ميزة تحويلات المخزون معطلة حاليًا
          </div>

          <div className="text-sm mt-2 max-w-xl mx-auto leading-7" style={{ color: 'var(--text-muted)' }}>
            فعّل خيار المستودعات المتعددة من صفحة الإعدادات حتى تتمكن من إنشاء التحويلات بين المستودعات واعتمادها.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div
        className="rounded-3xl border p-5 md:p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}
            >
              <ArrowLeftRight size={22} />
            </div>

            <div>
              <div className="text-xl font-black" style={{ color: 'var(--text-heading)' }}>
                تحويلات المخزون
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                إنشاء ومراجعة واعتماد تحويلات المخزون بين المستودعات
              </div>
            </div>
          </div>

          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black text-white"
            style={{ background: 'var(--primary)' }}
          >
            <Plus size={16} />
            تحويل جديد
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="rounded-2xl px-4 py-3 text-sm font-bold"
          style={
            notice.type === 'success'
              ? { background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }
              : { background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }
          }
        >
          {notice.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-3xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}>
              <FileText size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>إجمالي التحويلات</div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>{stats.total}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-subtle)', color: '#b45309' }}>
              <Clock3 size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>قيد الانتظار</div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>{stats.pending}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-subtle)', color: '#2563eb' }}>
              <WarehouseIcon size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>معتمد</div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>{stats.approved}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-subtle)', color: '#059669' }}>
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>مستلم</div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>{stats.received}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}>
              <Package size={18} />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>مجموع الكميات</div>
              <div className="text-2xl font-black" style={{ color: 'var(--text-heading)' }}>{fmtQty(stats.totalQty)}</div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-3xl border p-4 md:p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search
              size={16}
              className="absolute top-1/2 -translate-y-1/2 right-3"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث برقم التحويل أو المستودعات..."
              className="w-full rounded-2xl pr-10 pl-3 py-3 text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl px-3 py-3 text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-heading)',
                border: '1px solid var(--border)',
              }}
            >
              <option value="">كل الحالات</option>
              <option value="pending">قيد الانتظار</option>
              <option value="approved">معتمد</option>
              <option value="received">مستلم</option>
              <option value="cancelled">ملغي</option>
            </select>

            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['stock-transfers'] })}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-black"
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
      </div>

      <div
        className="rounded-3xl border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="grid grid-cols-12 gap-3 px-4 py-3 border-b text-xs font-black"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}
        >
          <div className="col-span-12 md:col-span-3">رقم التحويل</div>
          <div className="hidden md:block md:col-span-2">من</div>
          <div className="hidden md:block md:col-span-2">إلى</div>
          <div className="col-span-4 md:col-span-1">الحالة</div>
          <div className="col-span-4 md:col-span-1">البنود</div>
          <div className="col-span-4 md:col-span-1">الكمية</div>
          <div className="hidden md:block md:col-span-2 text-left">إجراء</div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل التحويلات...
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-base font-black" style={{ color: 'var(--text-heading)' }}>
              لا توجد تحويلات بعد
            </div>
            <div className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
              يمكنك إنشاء أول تحويل مخزون بحالة قيد الانتظار
            </div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filteredTransfers.map((transfer) => {
              const badge = getStatusBadge(transfer.status);

              return (
                <div key={transfer.id} className="grid grid-cols-12 gap-3 px-4 py-4 items-center">
                  <div className="col-span-12 md:col-span-3">
                    <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                      {transfer.transfer_number}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(transfer.created_at)}
                    </div>
                    <div className="text-[11px] mt-1 md:hidden" style={{ color: 'var(--text-muted)' }}>
                      {transfer.from_warehouse_name} ← {transfer.to_warehouse_name}
                    </div>
                  </div>

                  <div className="hidden md:block md:col-span-2 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                    {transfer.from_warehouse_name}
                  </div>

                  <div className="hidden md:block md:col-span-2 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                    {transfer.to_warehouse_name}
                  </div>

                  <div className="col-span-4 md:col-span-1">
                    <span className="inline-flex px-2.5 py-1 rounded-xl text-xs font-black" style={badge.style}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="col-span-4 md:col-span-1 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                    {transfer.items_count}
                  </div>

                  <div className="col-span-4 md:col-span-1 text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                    {fmtQty(transfer.total_quantity)}
                  </div>

                  <div className="col-span-12 md:col-span-2 flex md:justify-end gap-2 flex-wrap">
                    {transfer.status === 'pending' && (
                      <button
                        onClick={() => approveMutation.mutate(transfer.id)}
                        disabled={approvingId === transfer.id}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                        style={{ background: 'var(--primary)' }}
                      >
                        <CheckCircle2 size={15} />
                        {approvingId === transfer.id ? 'جارٍ الاعتماد...' : 'اعتماد'}
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedTransferId(transfer.id)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-black"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-heading)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Eye size={15} />
                      عرض
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateTransferModal
          warehouses={warehouses}
          products={products}
          loading={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      )}

      {selectedTransferId && (
        <TransferDetailsModal
          transfer={selectedTransfer ?? null}
          loading={isFetchingDetails}
          onClose={() => setSelectedTransferId(null)}
        />
      )}
    </div>
  );
}