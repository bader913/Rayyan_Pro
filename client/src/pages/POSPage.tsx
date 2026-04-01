import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search, X, Plus, Minus, ShoppingCart, User,
  Printer, Check, AlertCircle, Scale, DollarSign, Clock,
  RefreshCw, Bookmark, BookOpen, Trash2,
} from 'lucide-react';
import { usePosStore } from '../store/posStore.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useTerminals, useCurrentShift, useOpenShift, useCloseShift,
  useCreateSale, useCustomerSearch, useCreateCustomer,
  calcCartItem, reCalcItem, resolveProductPrice,
  type CartItem, type Customer, type Shift, type ShiftSummary, type Sale,
} from '../api/pos.ts';
import { useProducts, type Product } from '../api/products.ts';
import { printInvoice } from '../utils/print.ts';
import { useCurrency } from '../hooks/useCurrency.ts';
import { settingsApi } from '../api/settings.ts';
import { apiClient } from '../api/client.ts';
// ─── Parked Invoices ──────────────────────────────────────────────────────────
const PARKED_KEY = 'rayyan_parked_invoices';

interface ParkedInvoice {
  id: string;
  created_at: string;
  customer: Customer | null;
  cart: CartItem[];
  saleType: 'retail' | 'wholesale';
  saleDiscount: number;
  useCustomerBonus?: boolean;
  warehouseId?: number | '';
  notes: string;
}

function loadParked(): ParkedInvoice[] {
  try { return JSON.parse(localStorage.getItem(PARKED_KEY) ?? '[]'); }
  catch { return []; }
}
function saveParked(list: ParkedInvoice[]) {
  localStorage.setItem(PARKED_KEY, JSON.stringify(list));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقداً', card: 'شام كاش', credit: 'آجل', mixed: 'مختلط',
};

const VIEW_MIN_HEIGHT = '100%';

const ui = {
  surface: {
    background: 'color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle))',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-card)',
  } as React.CSSProperties,

  subtle: {
    background: 'color-mix(in srgb, var(--bg-subtle) 88%, var(--bg-card))',
    border: '1px solid var(--border)',
  } as React.CSSProperties,

  input: {
    background: 'color-mix(in srgb, var(--bg-subtle) 82%, var(--bg-card))',
    border: '1px solid var(--border)',
    color: 'var(--text-color)',
  } as React.CSSProperties,

  heading: {
    color: 'var(--text-heading)',
  } as React.CSSProperties,

  body: {
    color: 'var(--text-color)',
  } as React.CSSProperties,

  secondary: {
    color: 'var(--text-secondary)',
  } as React.CSSProperties,

  muted: {
    color: 'var(--text-muted)',
  } as React.CSSProperties,

  accent: {
    color: 'var(--primary)',
  } as React.CSSProperties,

  accentSoft: {
    background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
    border: '1px solid color-mix(in srgb, var(--primary) 26%, var(--border))',
    color: 'var(--primary)',
  } as React.CSSProperties,

  overlay: {
    background: 'rgba(2, 6, 23, 0.48)',
  } as React.CSSProperties,

  alertError: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.18)',
    color: '#dc2626',
  } as React.CSSProperties,

  alertSuccess: {
    background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
    border: '1px solid color-mix(in srgb, var(--primary) 22%, var(--border))',
    color: 'var(--primary)',
  } as React.CSSProperties,
};

// ─── POS Page ─────────────────────────────────────────────────────────────────
export default function POSPage() {
  const { fmt, rate, symbol } = useCurrency();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'loading' | 'open-shift' | 'pos' | 'close-shift' | 'receipt'>('loading');

  // ── App Settings ──────────────────────────────────────────────────────────
  const { data: appSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 30_000,
  });
  const shiftsEnabled = appSettings?.enable_shifts === 'true';
  const customerBonusEnabled = appSettings?.customer_bonus_enabled === 'true';
  const isMultiWarehouseEnabled = appSettings?.enable_multi_warehouse === 'true';

  const { data: warehouses = [] } = useQuery({
    queryKey: ['active-warehouses-pos'],
    queryFn: async () => {
      const res = await apiClient.get<{
        success: boolean;
        warehouses: Array<{
          id: number;
          name: string;
          code: string | null;
          is_active: boolean;
        }>;
      }>('/warehouses', {
        params: { active: 'true' },
      });
      return res.data.warehouses ?? [];
    },
    enabled: true,
    staleTime: 30_000,
  });

  // ── Parked Invoices ───────────────────────────────────────────────────────
  const [parkedList, setParkedList] = useState<ParkedInvoice[]>(loadParked);
  const [showParked, setShowParked] = useState(false);

  // ── Shift state ──────────────────────────────────────────────────────────
  const { data: currentShift, isLoading: shiftLoading, refetch: refetchShift } = useCurrentShift();
  const { data: terminals = [] } = useTerminals();
  const openShiftMut = useOpenShift();
  const closeShiftMut = useCloseShift();

  const saleSubmitLockRef = useRef(false);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [openForm, setOpenForm] = useState({ terminal_id: '', opening_balance: '0', opening_note: '' });
  const [closeForm, setCloseForm] = useState({ closing_cash_counted: '', closing_note: '' });
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [shiftError, setShiftError] = useState('');

  // ── Cart state ───────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [saleType, setSaleType] = useState<'retail' | 'wholesale'>('retail');
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'credit' | 'mixed'>('cash');
  const [paidAmount, setPaidAmount] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [useCustomerBonus, setUseCustomerBonus] = useState(false);
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [sourceOrderId, setSourceOrderId] = useState<number | null>(null);

  const location = useLocation();
  const [isLoadingPendingOrder, setIsLoadingPendingOrder] = useState(false);
  const [loadedOrderMeta, setLoadedOrderMeta] = useState<{
    order_id: number;
    order_number: string;
    customer_name: string;
    recipient_name: string | null;
    phone: string | null;
  } | null>(null);

  // ── Sync cart count to global store (for Layout nav guard) ───────────────
  const setCartCount = usePosStore((s) => s.setCartCount);
  const pendingOrderExecution = usePosStore((s) => s.pendingOrderExecution);
  const clearPendingOrderExecution = usePosStore((s) => s.clearPendingOrderExecution);

  useEffect(() => {
    if (view === 'pos') setCartCount(cart.length);
    return () => setCartCount(0);
  }, [cart.length, view, setCartCount]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const completeSaleRef = useRef<() => void>(() => { });
  useEffect(() => { completeSaleRef.current = completeSale; });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (view !== 'pos') return;
      if (e.key === 'F1') { e.preventDefault(); completeSaleRef.current(); }
      if (e.key === 'F8') { e.preventDefault(); setCart([]); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view]);

  // ── Product search ────────────────────────────────────────────────────────
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const scanAutoAddLockRef = useRef(false);
  const lastScannedBarcodeRef = useRef('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  const { data: productResults } = useProducts({
    q: debouncedQ,
    is_active: 'true',
    limit: 12,
  });
  const visibleProducts = productResults?.products ?? [];
    const stockLookupProducts = useMemo<Parameters<typeof calcCartItem>[0][]>(() => {
    const map = new Map<string, Parameters<typeof calcCartItem>[0]>();

    visibleProducts.forEach((product) => {
      map.set(String(product.id), product);
    });

    cart.forEach((item) => {
      if (item?.product?.id != null) {
        map.set(String(item.product.id), item.product);
      }
    });

    return Array.from(map.values());
  }, [visibleProducts, cart]);

  const configuredDefaultSalesWarehouseId = (() => {
    const raw = String(appSettings?.default_sales_warehouse_id ?? '').trim();
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();

  const singleModeWarehouse =
    (!isMultiWarehouseEnabled
      ? (
        (configuredDefaultSalesWarehouseId
          ? warehouses.find((w) => w.id === configuredDefaultSalesWarehouseId && w.is_active)
          : null) ??
        warehouses.find((w) => w.code === 'MAIN' && w.is_active) ??
        warehouses.find((w) => w.is_active)
      )
      : null) ?? null;

  const singleModeSalesWarehouseId = singleModeWarehouse?.id ?? null;
  const singleModeSalesWarehouseLabel = singleModeWarehouse
    ? `${singleModeWarehouse.name}${singleModeWarehouse.code ? ` (${singleModeWarehouse.code})` : ''}`
    : 'المستودع الرئيسي';

  const {
    data: singleModeWarehouseStockMap = {},
    isLoading: singleModeWarehouseStockLoading,
  } = useQuery<Record<string, { availableQty: number; otherWarehouseLabel: string | null }>>({
    queryKey: [
      'pos-single-warehouse-stock',
      singleModeSalesWarehouseId,
      stockLookupProducts.map((p) => p.id).join(','),
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        stockLookupProducts.map(async (product) => {
          try {
            const res = await apiClient.get<{
              success: boolean;
              warehouses: Array<{
                id: number;
                name: string;
                code: string | null;
                is_active: boolean;
                quantity: string;
              }>;
            }>(`/products/${product.id}/warehouse-stock`);

            const rows = res.data.warehouses ?? [];

            const currentRow = rows.find(
              (w) => Number(w.id) === Number(singleModeSalesWarehouseId)
            );

            const otherRow = rows.find(
              (w) =>
                Number(w.id) !== Number(singleModeSalesWarehouseId) &&
                w.is_active &&
                Number(w.quantity ?? 0) > 0
            );

            return [
              String(product.id),
              {
                availableQty: Number(currentRow?.quantity ?? 0),
                otherWarehouseLabel: otherRow
                  ? `${otherRow.name}${otherRow.code ? ` (${otherRow.code})` : ''}`
                  : null,
              },
            ] as const;
          } catch {
            return [
              String(product.id),
              { availableQty: 0, otherWarehouseLabel: null },
            ] as const;
          }
        })
      );

      return Object.fromEntries(entries) as Record<
        string,
        { availableQty: number; otherWarehouseLabel: string | null }
      >;
    },
    enabled: !isMultiWarehouseEnabled && !!singleModeSalesWarehouseId && stockLookupProducts.length > 0,
    staleTime: 10_000,
  });
  useEffect(() => {
    if (view !== 'pos') return;
    if (!pendingOrderExecution) return;

    let cancelled = false;

    const loadOrderIntoCart = async () => {
      if (cart.length > 0) {
        setSaleError('لا يمكن تحميل طلب وارد إلى سلة غير فارغة');
        return;
      }

      setIsLoadingPendingOrder(true);
      setSaleError('');

      try {
        const uniqueProductIds = Array.from(
          new Set(
            pendingOrderExecution.items
              .map((item) => Number(item.product_id))
              .filter((id) => id > 0)
          )
        );

        const results = await Promise.allSettled(
          uniqueProductIds.map(async (productId) => {
            const res = await apiClient.get<{ success: boolean; product: Product }>(`/products/${productId}`);
            return res.data.product;
          })
        );

        if (cancelled) return;

        const productMap = new Map<number, Product>();
        const missingIds: number[] = [];

        results.forEach((result, index) => {
          const productId = uniqueProductIds[index];

          if (result.status === 'fulfilled' && result.value) {
            productMap.set(productId, result.value);
          } else {
            missingIds.push(productId);
          }
        });

        if (missingIds.length > 0) {
          throw new Error(`تعذر تحميل بعض أصناف الطلب إلى الكاشير: ${missingIds.join(', ')}`);
        }

        const nextCart: CartItem[] = pendingOrderExecution.items.map((item) => {
          const product = productMap.get(Number(item.product_id));

          if (!product) {
            throw new Error(`الصنف رقم ${item.product_id} لم يعد متوفرًا`);
          }

          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price_usd || 0);

          return reCalcItem({
            _id: crypto.randomUUID(),
            product,
            quantity,
            unit_price: unitPrice,
            price_type: 'custom',
            item_discount: 0,
            total: quantity * unitPrice,
          });
        });

        const orderNoteParts = [
          `طلب وارد ${pendingOrderExecution.order_number}`,
          `صاحب الطلب: ${pendingOrderExecution.customer_name}`,
          pendingOrderExecution.recipient_name ? `المستلم: ${pendingOrderExecution.recipient_name}` : null,
          pendingOrderExecution.phone ? `الهاتف: ${pendingOrderExecution.phone}` : null,
          pendingOrderExecution.notes?.trim() ? `ملاحظات الطلب: ${pendingOrderExecution.notes.trim()}` : null,
        ].filter(Boolean);

        const nextPaymentMethod =
          pendingOrderExecution.payment_method === 'sham_cash' ? 'card' : 'cash';

        setCart(nextCart);
        setCustomer(null);
        setSaleType('retail');
        setSaleDiscount(0);
        setPaymentMethod(nextPaymentMethod);
        setPaidAmount(Number(pendingOrderExecution.total_usd || 0));
        setUseCustomerBonus(false);
        setSaleNotes(orderNoteParts.join(' | '));
        setWarehouseId(
          isMultiWarehouseEnabled
            ? (pendingOrderExecution.warehouse_id ?? '')
            : ''
        );
        setLoadedOrderMeta({
          order_id: pendingOrderExecution.order_id,
          order_number: pendingOrderExecution.order_number,
          customer_name: pendingOrderExecution.customer_name,
          recipient_name: pendingOrderExecution.recipient_name,
          phone: pendingOrderExecution.phone,
        });
        setSourceOrderId(
          Number(
            pendingOrderExecution.source_order_id ??
            pendingOrderExecution.sourceOrderId ??
            pendingOrderExecution.order_id
          ) || null
        );

        setSearchQ('');
        clearPendingOrderExecution();

        window.setTimeout(() => {
          barcodeRef.current?.focus();
        }, 50);
      } catch (error: any) {
        if (cancelled) return;
        setSaleError(error?.message || 'تعذر تحميل الطلب إلى الكاشير');
      } finally {
        if (!cancelled) {
          setIsLoadingPendingOrder(false);
        }
      }
    };

    void loadOrderIntoCart();

    return () => {
      cancelled = true;
    };
  }, [
    view,
    cart.length,
    pendingOrderExecution,
    clearPendingOrderExecution,
    isMultiWarehouseEnabled,
  ]);
  // ── Customer search ───────────────────────────────────────────────────────
  const [custQ, setCustQ] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const { data: custResults = [] } = useCustomerSearch(custQ);
  const createCustMut = useCreateCustomer();
  const [showNewCustForm, setShowNewCustForm] = useState(false);
  const [newCust, setNewCust] = useState<{ name: string; phone: string; customer_type: 'retail' | 'wholesale' }>({
    name: '',
    phone: '',
    customer_type: 'retail',
  });

  // ── Weighted modal ────────────────────────────────────────────────────────
  const [weightModal, setWeightModal] = useState<{
    product: Parameters<typeof calcCartItem>[0] | null;
    mode: 'weight' | 'amount';
    value: string;
  }>({ product: null, mode: 'weight', value: '' });

  // ── Sale completion ───────────────────────────────────────────────────────
  const createSaleMut = useCreateSale();
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [saleError, setSaleError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const rawId =
      params.get('source_order_id') ??
      (location.state as any)?.sourceOrderId ??
      (location.state as any)?.source_order_id ??
      (location.state as any)?.customerOrderId ??
      null;

    const parsedId =
      typeof rawId === 'number'
        ? rawId
        : rawId !== null && String(rawId).trim() !== ''
          ? parseInt(String(rawId), 10)
          : null;

    if (parsedId && Number.isFinite(parsedId)) {
      setSourceOrderId(parsedId);
    }
  }, [location.search, location.state]);
  // ── Shift view control ────────────────────────────────────────────────────
  useEffect(() => {
    if (settingsLoading || (shiftsEnabled && shiftLoading)) { setView('loading'); return; }
    if (!shiftsEnabled) { setView('pos'); return; }
    if (currentShift?.status === 'open') setView('pos');
    else setView('open-shift');
  }, [currentShift, shiftLoading, shiftsEnabled, settingsLoading]);

  // ── Computed totals ───────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const itemsDiscount = cart.reduce((s, i) => s + i.item_discount, 0);
  const baseTotal = Math.max(0, subtotal - itemsDiscount - saleDiscount);

  const customerBonusBalance = customer ? (parseFloat(String(customer.bonus_balance ?? '0')) || 0) : 0;
  const bonusToUse = useCustomerBonus && customerBonusEnabled
    ? Math.min(customerBonusBalance, baseTotal)
    : 0;

  const total = Math.max(0, baseTotal - bonusToUse);
  const isPaidFull = paymentMethod === 'credit';
  const effectivePaid = isPaidFull ? 0 : paidAmount;
  const change = effectivePaid > total ? effectivePaid - total : 0;
  const due = total - effectivePaid > 0.001 ? total - effectivePaid : 0;

  useEffect(() => {
    if (paymentMethod === 'cash') setPaidAmount(total);
  }, [total, paymentMethod]);

  useEffect(() => {
    if (!customerBonusEnabled || !customer || customerBonusBalance <= 0) {
      setUseCustomerBonus(false);
    }
  }, [customerBonusEnabled, customer, customerBonusBalance]);

  const getProductAvailableQtyForPOS = useCallback(
    (product: Parameters<typeof calcCartItem>[0]) => {
      const globalQty = parseFloat(String(product.stock_quantity ?? 0)) || 0;

      if (isMultiWarehouseEnabled) return globalQty;

      if (!singleModeSalesWarehouseId) return globalQty;

      if (singleModeWarehouseStockLoading) return 0;

      const warehouseInfo = singleModeWarehouseStockMap[String(product.id)];
      const warehouseQty = Number(warehouseInfo?.availableQty ?? 0);
      return Number.isFinite(warehouseQty) ? warehouseQty : 0;
    },
    [
      isMultiWarehouseEnabled,
      singleModeSalesWarehouseId,
      singleModeWarehouseStockLoading,
      singleModeWarehouseStockMap,
    ]
  );
  // ── Add product to cart ───────────────────────────────────────────────────
  const addProduct = useCallback((product: Parameters<typeof calcCartItem>[0]) => {
    if (!isMultiWarehouseEnabled && singleModeWarehouseStockLoading) {
      setSaleError(`جارِ التحقق من رصيد ${singleModeSalesWarehouseLabel}...`);
      return;
    }

    const availableQty = getProductAvailableQtyForPOS(product);
    const alreadyInCartQty = cart
      .filter((i) => String(i.product.id) === String(product.id))
      .reduce((sum, i) => sum + i.quantity, 0);

    if (availableQty <= 0) {
      setSaleError(`المنتج "${product.name}" غير متوفر في ${singleModeSalesWarehouseLabel}`);
      return;
    }

    if (!product.is_weighted && alreadyInCartQty + 1 > availableQty + 0.000001) {
      setSaleError(
        `الكمية غير متوفرة للمنتج "${product.name}" في ${singleModeSalesWarehouseLabel}. المتاح: ${availableQty.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })}`
      );
      return;
    }

    setSaleError('');

    if (product.is_weighted) {
      setWeightModal({ product, mode: 'weight', value: '' });
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id && i.price_type !== 'custom');
      if (existing) {
        return prev.map((i) => {
          if (i._id !== existing._id) return i;
          const newQty = i.quantity + 1;
          const resolved = resolveProductPrice(product, newQty, saleType, customer?.customer_type);
          return reCalcItem({
            ...i,
            quantity: newQty,
            unit_price: resolved.price,
            price_type: resolved.type,
          });
        });
      }

      const item = calcCartItem(product, 1, saleType, customer?.customer_type);
      return [...prev, item];
    });

    setSearchQ('');
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }, [
    cart,
    saleType,
    customer,
    isMultiWarehouseEnabled,
    singleModeWarehouseStockLoading,
    singleModeSalesWarehouseLabel,
    getProductAvailableQtyForPOS,
  ]);
  useEffect(() => {
    const code = String(debouncedQ ?? '').trim();
    const products = productResults?.products ?? [];

    if (!code) return;
    if (scanAutoAddLockRef.current) return;
    if (products.length === 0) return;

    // نعتبره باركود فقط إذا كان بدون فراغات ويشبه قيمة جهاز ماسح
    const looksLikeBarcode = /^[0-9A-Za-z._\-]+$/.test(code) && !code.includes(' ');
    if (!looksLikeBarcode) return;

    const exact = products.find(
      (p) => String(p.barcode ?? '').trim().toLowerCase() === code.toLowerCase()
    );

    if (!exact) return;
    if (lastScannedBarcodeRef.current === code) return;

    scanAutoAddLockRef.current = true;
    lastScannedBarcodeRef.current = code;

    addProduct(exact);

    window.setTimeout(() => {
      scanAutoAddLockRef.current = false;
      if (lastScannedBarcodeRef.current === code) {
        lastScannedBarcodeRef.current = '';
      }
    }, 250);
  }, [debouncedQ, productResults, addProduct]);
  // ── Confirm weighted add ──────────────────────────────────────────────────
  const confirmWeighted = () => {
    const { product, mode, value } = weightModal;
    if (!product || !value) return;

    if (!isMultiWarehouseEnabled && singleModeWarehouseStockLoading) {
      setSaleError(`جارِ التحقق من رصيد ${singleModeSalesWarehouseLabel}...`);
      return;
    }

    const price = parseFloat(product.retail_price);
    let qty: number;

    if (mode === 'weight') {
      qty = parseFloat(value);
      if (isNaN(qty) || qty <= 0) return;
    } else {
      const amount = parseFloat(value);
      if (isNaN(amount) || amount <= 0 || price <= 0) return;
      qty = (amount / rate) / price;
    }

    const availableQty = getProductAvailableQtyForPOS(product);
    const alreadyInCartQty = cart
      .filter((i) => String(i.product.id) === String(product.id))
      .reduce((sum, i) => sum + i.quantity, 0);

    if (availableQty <= 0 || alreadyInCartQty + qty > availableQty + 0.000001) {
      setSaleError(
        `الكمية غير متوفرة للمنتج "${product.name}" في ${singleModeSalesWarehouseLabel}. المتاح: ${availableQty.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })}`
      );
      return;
    }

    setSaleError('');

    const item = calcCartItem(product, qty, saleType, customer?.customer_type);
    setCart((prev) => [...prev, item]);
    setWeightModal({ product: null, mode: 'weight', value: '' });
    setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  // ── Update cart item ──────────────────────────────────────────────────────
  const updateCartItem = (id: string, changes: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((i) => i._id !== id ? i : reCalcItem({ ...i, ...changes }))
    );
  };

  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i._id !== id));

  // ── When saleType or customer changes: re-price non-custom items ──────────
  useEffect(() => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.price_type === 'custom') return item;
        const resolved = resolveProductPrice(
          item.product, item.quantity, saleType, customer?.customer_type
        );
        return reCalcItem({ ...item, unit_price: resolved.price, price_type: resolved.type });
      })
    );
  }, [saleType, customer]);

  // ── Complete sale ─────────────────────────────────────────────────────────
  const cartQtyByProduct = cart.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.product.id);
    acc[key] = (acc[key] ?? 0) + item.quantity;
    return acc;
  }, {});

  const cartStockIssue = cart.find((item) => {
    const available = getProductAvailableQtyForPOS(item.product);
    const requested = cartQtyByProduct[String(item.product.id)] ?? item.quantity;
    return requested > available + 0.000001;
  });

  const cartStockError =
    !isMultiWarehouseEnabled && singleModeWarehouseStockLoading
      ? `جارِ التحقق من رصيد ${singleModeSalesWarehouseLabel}...`
      : cartStockIssue
        ? `الكمية غير متوفرة للمنتج "${cartStockIssue.product.name}" في ${singleModeSalesWarehouseLabel}. المتاح: ${getProductAvailableQtyForPOS(
          cartStockIssue.product
        ).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })}`
        : '';

  const completeSale = async () => {
    if (saleSubmitLockRef.current || isCompletingSale || createSaleMut.isPending) return;

    if (shiftsEnabled && !currentShift) return;
    if (cart.length === 0) {
      setSaleError('السلة فارغة');
      return;
    }
    if (cartStockError) {
      setSaleError(cartStockError);
      return;
    }

    saleSubmitLockRef.current = true;
    setIsCompletingSale(true);
    setSaleError('');

    try {
      const sale = await createSaleMut.mutateAsync({
        shift_id: shiftsEnabled && currentShift ? parseInt(currentShift.id, 10) : null,
        pos_terminal_id: currentShift?.pos_terminal_id ? parseInt(currentShift.pos_terminal_id, 10) : null,
        customer_id: customer ? parseInt(customer.id, 10) : null,
        warehouse_id: isMultiWarehouseEnabled ? (warehouseId || null) : null,
        source_order_id: sourceOrderId ?? null,
        sale_type: saleType,
        items: cart.map((i) => ({
          product_id: parseInt(i.product.id, 10),
          quantity: i.quantity,
          unit_price: i.unit_price,
          price_type: i.price_type,
          item_discount: i.item_discount,
        })),
        sale_discount: saleDiscount,
        payment_method: paymentMethod,
        paid_amount: effectivePaid,
        use_customer_bonus: useCustomerBonus,
        notes: saleNotes || undefined,
      });

      if (sourceOrderId) {
        await queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
        await queryClient.invalidateQueries({ queryKey: ['customer-orders', 'pending-badge'] });
      }

      setLastSale(sale);
      setView('receipt');
      clearCart();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ??
        (e as { message?: string })?.message ??
        'حدث خطأ';
      setSaleError(msg);
    } finally {
      saleSubmitLockRef.current = false;
      setIsCompletingSale(false);
    }
  };

  const clearCart = () => {
    setCart([]);
    setCustomer(null);
    setSaleType('retail');
    setSaleDiscount(0);
    setPaymentMethod('cash');
    setPaidAmount(0);
    setUseCustomerBonus(false);
    setWarehouseId('');
    setSourceOrderId(null);
    setSaleNotes('');
    setSaleError('');
    setLoadedOrderMeta(null);
  };


  const newSale = () => {
    clearCart();
    setLastSale(null);
    setView('pos');
    setTimeout(() => barcodeRef.current?.focus(), 100);
  };

  // ── Park current cart ─────────────────────────────────────────────────────
  const parkCart = () => {
    if (cart.length === 0) return;
    const entry: ParkedInvoice = {
      id: `${Date.now()}`,
      created_at: new Date().toISOString(),
      customer,
      cart: [...cart],
      saleType,
      saleDiscount,
      useCustomerBonus,
      warehouseId,
      notes: saleNotes,
    };
    const updated = [entry, ...parkedList];
    setParkedList(updated);
    saveParked(updated);
    clearCart();
    setTimeout(() => barcodeRef.current?.focus(), 100);
  };

  // ── Restore a parked invoice into the current cart ────────────────────────
  const restoreParked = (id: string) => {
    const entry = parkedList.find((p) => p.id === id);
    if (!entry) return;
    setCart(entry.cart);
    setCustomer(entry.customer);
    setSaleType(entry.saleType);
    setSaleDiscount(entry.saleDiscount);
    setUseCustomerBonus(!!entry.useCustomerBonus);
    setWarehouseId(entry.warehouseId ?? '');
    setSaleNotes(entry.notes);
    setSaleError('');
    const updated = parkedList.filter((p) => p.id !== id);
    setParkedList(updated);
    saveParked(updated);
    setShowParked(false);
    setTimeout(() => barcodeRef.current?.focus(), 100);
  };

  const deleteParked = (id: string) => {
    const updated = parkedList.filter((p) => p.id !== id);
    setParkedList(updated);
    saveParked(updated);
  };

  // ── Open shift ────────────────────────────────────────────────────────────
  const handleOpenShift = async () => {
    setShiftError('');
    try {
      await openShiftMut.mutateAsync({
        terminal_id: openForm.terminal_id ? parseInt(openForm.terminal_id, 10) : null,
        opening_balance: (parseFloat(openForm.opening_balance) || 0) / rate,
        opening_note: openForm.opening_note || undefined,
      });
      refetchShift();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ?? 'فشل في فتح الوردية';
      setShiftError(msg);
    }
  };

  // ── Close shift ───────────────────────────────────────────────────────────
  const handleCloseShift = async () => {
    if (!currentShift) return;
    setShiftError('');
    try {
      const summary = await closeShiftMut.mutateAsync({
        id: parseInt(currentShift.id, 10),
        closing_cash_counted: (parseFloat(closeForm.closing_cash_counted) || 0) / rate,
        closing_note: closeForm.closing_note || undefined,
      });
      setShiftSummary(summary);
      refetchShift();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ?? 'فشل في إغلاق الوردية';
      setShiftError(msg);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // VIEWS
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div
        className="flex items-center justify-center rounded-[30px]"
        style={{
          ...ui.surface,
          minHeight: VIEW_MIN_HEIGHT,
          background: 'var(--bg-subtle)',
        }}
      >
        <div
          className="inline-flex items-center gap-3 px-5 py-4 rounded-2xl"
          style={ui.surface}
        >
          <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-black" style={ui.body}>جارٍ تجهيز نقطة البيع...</span>
        </div>
      </div>
    );
  }

  // ── Open Shift View ───────────────────────────────────────────────────────
  if (view === 'open-shift') {
    return (
      <div className="flex items-center justify-center" dir="rtl" style={{ minHeight: VIEW_MIN_HEIGHT }}>
        <div className="w-full max-w-md rounded-[30px] p-6 md:p-7" style={ui.surface}>
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-[22px] flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--primary)' }}
            >
              <Clock size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight" style={ui.heading}>فتح وردية جديدة</h1>
            <p className="text-sm font-medium mt-1.5" style={ui.secondary}>
              حدد الجهاز والرصيد الافتتاحي للبدء
            </p>
          </div>

          {shiftError && (
            <div className="rounded-2xl p-3 flex gap-2 items-start mb-4" style={ui.alertError}>
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span className="text-sm font-semibold">{shiftError}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-black mb-1.5" style={ui.secondary}>جهاز POS</label>
              <select
                className="w-full rounded-2xl px-4 h-12 text-sm focus:outline-none"
                style={ui.input}
                value={openForm.terminal_id}
                onChange={(e) => setOpenForm((p) => ({ ...p, terminal_id: e.target.value }))}
              >
                <option value="">— اختر الجهاز (اختياري) —</option>
                {terminals.map((t) => (
                  <option key={t.id} value={t.id} disabled={!!t.active_shift_id}>
                    {t.name}{t.active_shift_id ? ' (مشغول)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-black mb-1.5" style={ui.secondary}>الرصيد الافتتاحي ({symbol})</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-2xl px-4 h-12 text-sm font-bold focus:outline-none text-left"
                style={ui.input}
                placeholder="0"
                value={openForm.opening_balance}
                onChange={(e) => setOpenForm((p) => ({ ...p, opening_balance: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-black mb-1.5" style={ui.secondary}>ملاحظة (اختياري)</label>
              <input
                type="text"
                className="w-full rounded-2xl px-4 h-12 text-sm focus:outline-none"
                style={ui.input}
                placeholder="ملاحظة عند فتح الوردية..."
                value={openForm.opening_note}
                onChange={(e) => setOpenForm((p) => ({ ...p, opening_note: e.target.value }))}
              />
            </div>

            <button
              onClick={handleOpenShift}
              disabled={openShiftMut.isPending}
              className="w-full h-12 rounded-2xl text-white font-black text-base transition-opacity disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              {openShiftMut.isPending ? 'جارٍ الفتح...' : 'فتح الوردية والبدء'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Close Shift View ──────────────────────────────────────────────────────
  if (view === 'close-shift') {
    if (shiftSummary) {
      return (
        <div className="flex items-center justify-center" dir="rtl" style={{ minHeight: VIEW_MIN_HEIGHT }}>
          <div className="w-full max-w-md rounded-[30px] p-6 md:p-7" style={ui.surface}>
            <div className="text-center mb-6">
              <div
                className="w-16 h-16 rounded-[22px] flex items-center justify-center mx-auto mb-4"
                style={ui.accentSoft}
              >
                <Check size={28} style={{ color: '#10b981' }} />
              </div>
              <h1 className="text-2xl font-black tracking-tight" style={ui.heading}>تم إغلاق الوردية</h1>
            </div>

            <div className="rounded-[24px] p-4 space-y-2.5 text-sm mb-5" style={ui.subtle}>
              {[
                ['عدد المبيعات', shiftSummary.sales_count],
                ['إجمالي المبيعات', fmt(shiftSummary.sales_total)],
                ['مبيعات نقدية', fmt(shiftSummary.cash_total)],
                ['مبيعات شام كاش', fmt(shiftSummary.card_total)],
                ['مبيعات آجل', fmt(shiftSummary.credit_total)],
                ['الرصيد الافتتاحي', fmt(shiftSummary.opening_balance)],
                ['النقد المتوقع', fmt(shiftSummary.expected_cash)],
                ['النقد الفعلي', fmt(shiftSummary.closing_cash_counted)],
                ['الفرق', fmt(shiftSummary.difference)],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between gap-3">
                  <span className="font-medium" style={ui.secondary}>{label}</span>
                  <span className="font-black" style={ui.heading}>{val}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShiftSummary(null);
                setView('open-shift');
              }}
              className="w-full h-12 rounded-2xl text-white font-black"
              style={{ background: 'var(--primary)' }}
            >
              فتح وردية جديدة
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center" dir="rtl" style={{ minHeight: VIEW_MIN_HEIGHT }}>
        <div className="w-full max-w-md rounded-[30px] p-6 md:p-7" style={ui.surface}>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black tracking-tight" style={ui.heading}>إغلاق الوردية</h1>
            <p className="text-sm font-medium mt-1.5" style={ui.secondary}>أدخل النقد الفعلي في الدرج</p>
          </div>

          {shiftError && (
            <div className="rounded-2xl p-3 flex gap-2 mb-4" style={ui.alertError}>
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span className="text-sm font-semibold">{shiftError}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-black mb-1.5" style={ui.secondary}>النقد الفعلي ({symbol})</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-2xl px-4 h-12 text-lg font-black focus:outline-none text-left"
                style={ui.input}
                placeholder="0"
                value={closeForm.closing_cash_counted}
                onChange={(e) => setCloseForm((p) => ({ ...p, closing_cash_counted: e.target.value }))}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-black mb-1.5" style={ui.secondary}>ملاحظة الإغلاق (اختياري)</label>
              <input
                type="text"
                className="w-full rounded-2xl px-4 h-12 text-sm focus:outline-none"
                style={ui.input}
                placeholder="ملاحظة..."
                value={closeForm.closing_note}
                onChange={(e) => setCloseForm((p) => ({ ...p, closing_note: e.target.value }))}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setView('pos')}
                className="flex-1 h-12 rounded-2xl font-black transition-colors"
                style={ui.subtle}
              >
                <span style={ui.secondary}>إلغاء</span>
              </button>

              <button
                onClick={handleCloseShift}
                disabled={closeShiftMut.isPending}
                className="flex-1 h-12 rounded-2xl text-white font-black disabled:opacity-60"
                style={{ background: '#ef4444' }}
              >
                {closeShiftMut.isPending ? 'جارٍ الإغلاق...' : 'تأكيد الإغلاق'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Receipt View ──────────────────────────────────────────────────────────
  if (view === 'receipt' && lastSale) {
    const saleDue = parseFloat(lastSale.total_amount) - parseFloat(lastSale.paid_amount);
    const saleChange = parseFloat(lastSale.paid_amount) - parseFloat(lastSale.total_amount);

    return (
      <div className="flex items-center justify-center p-4" dir="rtl" style={{ minHeight: VIEW_MIN_HEIGHT }}>
        <div className="w-full max-w-md rounded-[30px] p-6" style={ui.surface}>
          <div className="text-center mb-5">
            <div
              className="w-16 h-16 rounded-[22px] flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(16,185,129,0.12)' }}
            >
              <Check size={30} style={ui.accent} />
            </div>
            <h1 className="text-2xl font-black tracking-tight" style={ui.heading}>تم البيع بنجاح</h1>
            <p className="text-sm font-black mt-1.5" style={{ color: 'var(--primary)' }}>{lastSale.invoice_number}</p>
          </div>

          <div className="rounded-[24px] p-4 space-y-2.5 text-sm mb-5" style={ui.subtle}>
            {lastSale.customer_name && (
              <div className="flex justify-between gap-3">
                <span style={ui.secondary}>العميل</span>
                <span className="font-black" style={ui.heading}>{lastSale.customer_name}</span>
              </div>
            )}

            <div className="flex justify-between gap-3">
              <span style={ui.secondary}>الإجمالي</span>
              <span className="font-black text-lg" style={ui.accent}>{fmt(lastSale.total_amount)}</span>
            </div>

            <div className="flex justify-between gap-3">
              <span style={ui.secondary}>طريقة الدفع</span>
              <span className="font-black" style={ui.heading}>{PAYMENT_LABELS[lastSale.payment_method]}</span>
            </div>
            {parseFloat(lastSale.bonus_used_amount ?? '0') > 0 && (
              <div className="flex justify-between gap-3">
                <span style={ui.secondary}>بونص مستخدم</span>
                <span className="font-black text-emerald-500">
                  - {fmt(lastSale.bonus_used_amount)}
                </span>
              </div>
            )}

            {parseFloat(lastSale.bonus_earned_amount ?? '0') > 0 && (
              <div className="flex justify-between gap-3">
                <span style={ui.secondary}>بونص مكتسب</span>
                <span className="font-black text-blue-500">
                  + {fmt(lastSale.bonus_earned_amount)}
                </span>
              </div>
            )}

            {parseFloat(lastSale.paid_amount) > 0 && (
              <div className="flex justify-between gap-3">
                <span style={ui.secondary}>المدفوع</span>
                <span className="font-black" style={ui.heading}>{fmt(lastSale.paid_amount)}</span>
              </div>
            )}

            {saleChange > 0.001 && (
              <div className="flex justify-between gap-3">
                <span style={ui.secondary}>الباقي للعميل</span>
                <span className="font-black" style={{ color: '#10b981' }}>{fmt(saleChange)}</span>
              </div>
            )}

            {saleDue > 0.001 && (
              <div className="flex justify-between gap-3">
                <span style={ui.secondary}>متبقي آجل</span>
                <span className="font-black" style={{ color: '#ef4444' }}>{fmt(saleDue)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => printInvoice(lastSale, appSettings?.shop_name ?? 'ريان برو', { symbol, rate })}
              className="h-12 px-4 rounded-2xl font-black text-sm transition-colors flex items-center gap-2"
              style={ui.subtle}
            >
              <Printer size={16} />
              <span style={ui.body}>طباعة</span>
            </button>

            <button
              onClick={newSale}
              className="flex-1 h-12 rounded-2xl text-white font-black text-base"
              style={{ background: 'var(--primary)' }}
            >
              بيع جديد
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN POS VIEW ─────────────────────────────────────────────────────────
  const shift = currentShift as Shift | null;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border"
      dir="rtl"
      style={{
        background: 'color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle))',
        borderColor: 'var(--border)',
        height: '100%',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* ─── Top Bar ───────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 border-b flex-shrink-0"
        style={{
          background: 'color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle))',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-2 px-3 h-9 rounded-2xl" style={ui.subtle}>
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-black" style={ui.body}>
            {shiftsEnabled && shift
              ? `${shift.terminal_name ?? 'بلا جهاز'} · ${shift.cashier_name}`
              : 'نقطة البيع'}
          </span>
        </div>

        <div className="hidden lg:flex items-center px-3 h-9 rounded-2xl" style={ui.subtle}>
          <LiveTime />
        </div>

        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={parkCart}
            disabled={cart.length === 0}
            title="احتجاز الفاتورة الحالية"
            className="flex items-center gap-2 px-3 h-9 rounded-2xl text-xs font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={ui.accentSoft}
          >
            <Bookmark size={13} />
            احتجاز
          </button>

          <button
            onClick={() => setShowParked(true)}
            title="الفواتير المحتجزة"
            className="relative flex items-center gap-2 px-3 h-9 rounded-2xl text-xs font-black transition-all"
            style={ui.accentSoft}
          >
            <BookOpen size={13} />
            محتجزة
            {parkedList.length > 0 && (
              <span
                className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center"
                style={{ background: 'var(--primary)' }}
              >
                {parkedList.length}
              </span>
            )}
          </button>

          {shiftsEnabled && (
            <button
              onClick={() => setView('close-shift')}
              className="flex items-center gap-2 px-3 h-9 rounded-2xl text-xs font-black transition-all"
              style={{
                color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.22)',
                background: 'rgba(239,68,68,0.05)',
              }}
            >
              إغلاق الوردية
            </button>
          )}
        </div>
      </div>

      {/* ─── Main Area ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Product Search ─────────────────────────────────────────── */}
        <div
          className="w-[34%] min-w-[300px] max-w-[460px] flex flex-col border-l overflow-hidden"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-card)',
          }}
        >
          {/* Search header */}
          <div
            className="px-3 pt-3 pb-2 border-b flex-shrink-0"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-card)',
            }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h2 className="text-[15px] font-black" style={ui.heading}>المنتجات</h2>
                <p className="text-[11px] mt-0.5" style={ui.muted}>ابحث بالاسم أو امسح الباركود</p>
              </div>

              <div className="px-2.5 h-8 rounded-xl flex items-center text-xs font-black" style={ui.subtle}>
                <span style={ui.secondary}>{(productResults?.products ?? []).length} نتيجة</span>
              </div>
            </div>

            <div className="relative rounded-[18px]" style={ui.input}>
              <Search
                size={15}
                className="absolute top-1/2 -translate-y-1/2 right-3"
                style={{ color: 'var(--text-muted)' }}
              />

              <input
                ref={barcodeRef}
                type="text"
                placeholder="اسم المنتج أو الباركود..."
                className="w-full pl-3 pr-9 h-11 rounded-[18px] text-sm focus:outline-none"
                style={{
                  background: 'transparent',
                  color: 'var(--text-color)',
                }}
                value={searchQ}
                onChange={(e) => {
                  scanAutoAddLockRef.current = false;
                  lastScannedBarcodeRef.current = '';
                  setSearchQ(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;

                  const code = String(searchQ ?? '').trim();
                  if (!code) return;

                  const exact = (productResults?.products ?? []).find(
                    (p) => String(p.barcode ?? '').trim().toLowerCase() === code.toLowerCase()
                  );

                  if (exact) {
                    e.preventDefault();
                    addProduct(exact);
                  }
                }}
                autoFocus
              />

              {searchQ && (
                <button
                  onClick={() => setSearchQ('')}
                  className="absolute top-1/2 -translate-y-1/2 left-3 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Product list */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5" style={{ background: 'var(--bg-card)' }}>
            {(productResults?.products ?? []).length === 0 && debouncedQ && (
              <div className="rounded-[20px] p-5 text-center text-sm font-semibold" style={ui.subtle}>
                <span style={ui.muted}>لا توجد نتائج</span>
              </div>
            )}

            {(productResults?.products ?? []).length === 0 && !debouncedQ && (
              <div className="rounded-[20px] p-5 text-center text-sm font-semibold select-none" style={ui.subtle}>
                <span style={ui.muted}>ابحث عن منتج أو امسح الباركود</span>
              </div>
            )}

            {(productResults?.products ?? []).map((product) => {
              const globalStock = parseFloat(String(product.stock_quantity ?? 0)) || 0;
              const availableQty = getProductAvailableQtyForPOS(product);
              const otherWarehouseLabel =
                singleModeWarehouseStockMap[String(product.id)]?.otherWarehouseLabel ?? null;

              const availabilityPending =
                !isMultiWarehouseEnabled && !!singleModeSalesWarehouseId && singleModeWarehouseStockLoading;

              const noStock = availabilityPending ? true : availableQty <= 0;
              const hiddenInOtherWarehouse =
                !isMultiWarehouseEnabled &&
                !availabilityPending &&
                availableQty <= 0 &&
                globalStock > 0;

              const resolved = resolveProductPrice(product, 1, saleType, customer?.customer_type);

              return (
                <button
                  key={product.id}
                  onClick={() => !noStock && addProduct(product)}
                  disabled={noStock}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[18px] text-right transition-all duration-150 ${noStock ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  style={{
                    ...ui.subtle,
                    background: noStock
                      ? 'color-mix(in srgb, var(--bg-subtle) 96%, var(--bg-card))'
                      : 'color-mix(in srgb, var(--bg-card) 78%, var(--bg-subtle))',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-black truncate" style={ui.body}>
                        {product.name}
                      </span>

                      {product.is_weighted && (
                        <Scale size={11} className="text-violet-500 flex-shrink-0" />
                      )}
                      {hiddenInOtherWarehouse && (
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ color: '#92400e', background: 'rgba(245,158,11,0.12)' }}
                        >
                          {otherWarehouseLabel ?? 'مستودع آخر'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {product.barcode && (
                        <span className="text-[10px] font-mono" style={ui.muted}>
                          {product.barcode}
                        </span>
                      )}

                      <span className="text-[10px]" style={ui.muted}>
                        {availabilityPending
                          ? `جارِ فحص رصيد ${singleModeSalesWarehouseLabel}...`
                          : isMultiWarehouseEnabled
                            ? `مخزون: ${globalStock.toFixed(product.is_weighted ? 3 : 0)} ${product.unit}`
                            : hiddenInOtherWarehouse
                              ? (otherWarehouseLabel
                                ? `متوفر فقط في ${otherWarehouseLabel}`
                                : 'متوفر في مستودع آخر')
                              : `متاح في ${singleModeSalesWarehouseLabel}: ${availableQty.toFixed(product.is_weighted ? 3 : 0)} ${product.unit}`}
                      </span>
                    </div>
                  </div>

                  <div className="text-left flex-shrink-0">
                    <div className="text-[15px] font-black" style={ui.accent}>
                      {fmt(resolved.price)}
                    </div>

                    {resolved.type === 'wholesale' && (
                      <div className="text-[10px] font-black mt-0.5" style={ui.accent}>جملة</div>
                    )}
                  </div>

                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Plus size={14} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Cart ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden" style={{ background: 'var(--bg-card)' }}>

          {loadedOrderMeta && (
            <div className="px-3 pt-3">
              <div
                className="rounded-[20px] px-3.5 py-3 flex items-center justify-between gap-3"
                style={ui.accentSoft}
              >
                <div className="min-w-0">
                  <div className="text-xs font-black" style={ui.body}>
                    طلب محمّل إلى الكاشير: {loadedOrderMeta.order_number}
                  </div>
                  <div className="text-[11px] mt-1 truncate" style={ui.secondary}>
                    {loadedOrderMeta.customer_name}
                    {loadedOrderMeta.recipient_name ? ` • المستلم: ${loadedOrderMeta.recipient_name}` : ''}
                    {loadedOrderMeta.phone ? ` • ${loadedOrderMeta.phone}` : ''}
                  </div>
                </div>

                {isLoadingPendingOrder && (
                  <div className="text-[11px] font-black" style={ui.accent}>
                    جارٍ التحميل...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Customer + Sale Type — fixed header */}
          <div
            className="px-3 py-2.5 border-b flex gap-2.5 items-center flex-shrink-0"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-card)',
            }}
          >
            <div className="flex-1 relative">
              <div className="relative rounded-[18px]" style={ui.input}>
                <User
                  size={13}
                  className="absolute top-1/2 -translate-y-1/2 right-3"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  placeholder="العميل..."
                  className="w-full pr-8 pl-8 h-11 rounded-[18px] text-sm focus:outline-none"
                  style={{
                    background: 'transparent',
                    color: 'var(--text-color)',
                  }}
                  value={customer ? customer.name : custQ}
                  onChange={(e) => {
                    if (customer) setCustomer(null);
                    setCustQ(e.target.value);
                    setShowCustDropdown(true);
                  }}
                  onFocus={() => setShowCustDropdown(true)}
                />
                {customer && (
                  <button
                    onClick={() => { setCustomer(null); setCustQ(''); }}
                    className="absolute top-1/2 -translate-y-1/2 left-3"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {showCustDropdown && !customer && custQ.trim() && (
                <div
                  className="absolute top-full right-0 left-0 rounded-[20px] shadow-2xl z-20 mt-2 max-h-56 overflow-y-auto"
                  style={ui.surface}
                >
                  {custResults.map((c, index) => (
                    <button
                      key={c.id}
                      onClick={() => { setCustomer(c); setCustQ(''); setShowCustDropdown(false); }}
                      className="w-full text-right px-4 py-3 text-sm transition-colors"
                      style={{
                        borderBottom: index !== custResults.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div className="font-black" style={ui.body}>{c.name}</div>
                      <div className="text-xs mt-1" style={ui.muted}>
                        {c.phone} · {c.customer_type === 'wholesale' ? 'جملة' : 'مفرق'}
                        {parseFloat(c.balance) > 0 && (
                          <span className="text-red-500 mr-2 font-black">رصيد: {fmt(parseFloat(c.balance))}</span>
                        )}
                        {(parseFloat(String(c.bonus_balance ?? '0')) || 0) > 0 && (
                          <span className="text-emerald-500 mr-2 font-black">بونص: {fmt(parseFloat(String(c.bonus_balance ?? '0')))}</span>
                        )}
                      </div>
                    </button>
                  ))}

                  <button
                    onClick={() => { setShowCustDropdown(false); setShowNewCustForm(true); }}
                    className="w-full text-right px-4 py-3 text-sm font-black"
                    style={{
                      color: '#10b981',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    + إضافة عميل جديد
                  </button>
                </div>
              )}
            </div>

            {/* Sale type toggle */}
            <div
              className="flex rounded-[18px] overflow-hidden flex-shrink-0"
              style={ui.subtle}
            >
              {(['retail', 'wholesale'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSaleType(t)}
                  className="px-3.5 h-11 text-xs font-black transition-all"
                  style={
                    saleType === t
                      ? { background: 'var(--primary)', color: '#fff' }
                      : { color: 'var(--text-muted)', background: 'transparent' }
                  }
                >
                  {t === 'retail' ? 'مفرق' : 'جملة'}
                </button>
              ))}
            </div>
          </div>

          {/* Cart Items — scrollable, takes all remaining space */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1" style={{ background: 'var(--bg-card)' }}>
            {cart.length === 0 && (
              <div
                className="flex flex-col items-center justify-center h-full rounded-[24px] select-none"
                style={ui.subtle}
              >
                <ShoppingCart size={38} className="mb-2.5 opacity-40" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-semibold" style={ui.muted}>السلة فارغة</span>
              </div>
            )}

            {cart.map((item) => (
              <div
                key={item._id}
                className="rounded-[20px] px-3 py-2.5 transition-colors"
                style={{
                  background: 'color-mix(in srgb, var(--bg-card) 78%, var(--bg-subtle))',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 min-w-0">
                    {/* Product name + badges */}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className="text-[15px] font-black truncate" style={ui.body}>
                        {item.product.name}
                      </span>

                      {item.product.is_weighted && (
                        <Scale size={10} className="text-violet-500" />
                      )}

                      {item.price_type === 'wholesale' && (
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ color: '#06b6d4', background: 'rgba(6,182,212,0.10)' }}
                        >
                          جملة
                        </span>
                      )}

                      {item.price_type === 'custom' && (
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ color: '#8b5cf6', background: 'rgba(139,92,246,0.10)' }}
                        >
                          مخصص
                        </span>
                      )}
                    </div>

                    {/* Controls row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {!item.product.is_weighted ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              item.quantity > 1
                                ? updateCartItem(item._id, { quantity: item.quantity - 1 })
                                : removeItem(item._id)
                            }
                            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                            style={ui.input}
                          >
                            <Minus size={11} />
                          </button>

                          <input
                            type="number"
                            min="0.001"
                            step="1"
                            className="w-12 h-8 text-center text-sm font-black rounded-[10px] focus:outline-none"
                            style={ui.input}
                            value={item.quantity}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (v > 0) updateCartItem(item._id, { quantity: v });
                            }}
                          />

                          <button
                            onClick={() => updateCartItem(item._id, { quantity: item.quantity + 1 })}
                            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                            style={ui.input}
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          className="w-20 h-8 text-center text-sm font-black rounded-[10px] focus:outline-none"
                          style={ui.input}
                          value={item.quantity}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (v > 0) updateCartItem(item._id, { quantity: v });
                          }}
                        />
                      )}

                      <div className="flex items-center gap-1">
                        <div
                          className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                          style={ui.input}
                        >
                          <DollarSign size={11} style={{ color: 'var(--text-muted)' }} />
                        </div>

                        <input
                          type="number"
                          min="0"
                          className="w-24 h-8 text-center text-sm font-bold rounded-[10px] focus:outline-none"
                          style={ui.input}
                          value={item.unit_price}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) updateCartItem(item._id, { unit_price: v, price_type: 'custom' });
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right side: delete + total */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => removeItem(item._id)}
                      className="w-7 h-7 rounded-[10px] flex items-center justify-center"
                      style={ui.subtle}
                    >
                      <X size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>

                    <span className="text-sm font-black" style={ui.body}>
                      {fmt(item.total)}
                    </span>

                    {item.item_discount > 0 && (
                      <span className="text-[10px] font-black text-red-400">
                        خصم: {fmt(item.item_discount)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Totals + Payment — scrollable when needed ─────────────────── */}
          <div
            className="border-t flex-shrink-0 overflow-y-auto"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-card)',
              maxHeight: '52%',
            }}
          >
            <div className="p-3 space-y-2">
              {isMultiWarehouseEnabled && (
                <div className="rounded-[22px] p-3 space-y-1.5" style={ui.subtle}>
                  <label className="block text-xs font-black" style={ui.secondary}>
                    المستودع الذي سيتم البيع منه
                  </label>

                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className="w-full h-10 rounded-xl px-3 text-sm focus:outline-none"
                    style={ui.input}
                  >
                    <option value="">المستودع الرئيسي تلقائيًا</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}{w.code ? ` (${w.code})` : ''}
                      </option>
                    ))}
                  </select>

                  <div className="text-[11px] font-semibold" style={ui.muted}>
                    عند تفعيل المستودعات المتعددة سيتم الخصم من هذا المستودع فقط
                  </div>
                </div>
              )}

              {saleError && (
                <div className="rounded-xl px-3 py-2 flex gap-2 items-start" style={ui.alertError}>
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span className="text-xs font-semibold">{saleError}</span>
                </div>
              )}

              <div className="rounded-[22px] p-3 space-y-2" style={ui.subtle}>
                {/* Subtotal */}
                <div className="flex items-center justify-between text-sm">
                  <span style={ui.secondary}>المجموع</span>
                  <span className="font-black" style={ui.body}>{fmt(subtotal)}</span>
                </div>

                {/* Items discount */}
                {itemsDiscount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={ui.secondary}>خصومات الأصناف</span>
                    <span className="font-black text-red-500">- {fmt(itemsDiscount)}</span>
                  </div>
                )}

                {/* Sale discount */}
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span style={ui.secondary}>خصم الفاتورة</span>

                  <div className="relative w-28">
                    <input
                      type="number"
                      min="0"
                      className="w-full text-left pl-7 pr-3 h-9 rounded-xl text-sm font-black focus:outline-none"
                      style={ui.input}
                      placeholder="0"
                      value={saleDiscount * rate || ''}
                      onChange={(e) => setSaleDiscount((parseFloat(e.target.value) || 0) / rate)}
                    />
                    <span
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs"
                      style={ui.muted}
                    >
                      {symbol}
                    </span>
                  </div>
                </div>

                {/* Customer bonus */}
                {customerBonusEnabled && customer && (
                  <div
                    className="rounded-xl px-3 py-2.5 space-y-2"
                    style={{
                      background: 'color-mix(in srgb, var(--bg-card) 65%, var(--bg-subtle))',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black" style={ui.body}>بونص العميل</div>
                        <div className="text-xs mt-0.5" style={ui.muted}>
                          الرصيد المتاح: {fmt(customerBonusBalance)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => customerBonusBalance > 0 && setUseCustomerBonus((v) => !v)}
                        disabled={customerBonusBalance <= 0}
                        className="px-3 h-9 rounded-xl text-xs font-black border transition-all disabled:opacity-40"
                        style={
                          useCustomerBonus
                            ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                            : { background: 'var(--bg-card)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                        }
                      >
                        {useCustomerBonus ? 'يستخدم البونص' : 'بدون بونص'}
                      </button>
                    </div>

                    {customerBonusBalance > 0 ? (
                      <div className="flex items-center justify-between text-sm">
                        <span style={ui.secondary}>المستخدم من البونص</span>
                        <span className="font-black text-emerald-500">- {fmt(bonusToUse)}</span>
                      </div>
                    ) : (
                      <div className="text-xs font-semibold" style={ui.muted}>
                        لا يوجد رصيد بونص لهذا العميل
                      </div>
                    )}
                  </div>
                )}

                {/* Grand total */}
                <div
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{
                    background: 'color-mix(in srgb, var(--bg-card) 65%, var(--bg-subtle))',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span className="text-base font-black" style={ui.body}>الإجمالي</span>
                  <span className="text-[26px] font-black" style={ui.accent}>{fmt(total)}</span>
                </div>

                {/* Payment methods */}
                <div className="grid grid-cols-4 gap-1.5">
                  {(['cash', 'card', 'credit', 'mixed'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className="h-9 rounded-xl text-xs font-black border transition-all"
                      style={
                        paymentMethod === m
                          ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                          : { background: 'var(--bg-card)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                      }
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>

                {/* Paid amount */}
                {paymentMethod !== 'credit' && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm flex-shrink-0" style={ui.secondary}>مدفوع</span>

                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0"
                        className="w-full text-left pl-7 pr-3 h-9 rounded-xl text-sm font-black focus:outline-none"
                        style={ui.input}
                        value={paidAmount ? Number((paidAmount * rate).toFixed(2)) : ''}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          setPaidAmount(Number.isFinite(raw) ? Number((raw / rate).toFixed(6)) : 0);
                        }}
                      />
                      <span
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs"
                        style={ui.muted}
                      >
                        {symbol}
                      </span>
                    </div>

                    {change > 0.001 && (
                      <div className="flex-shrink-0 text-sm font-black text-emerald-500">
                        باقي: {fmt(change)}
                      </div>
                    )}

                    {due > 0.001 && (
                      <div className="flex-shrink-0 text-sm font-black text-red-500">
                        آجل: {fmt(due)}
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === 'credit' && (
                  <div className="text-sm font-black text-center rounded-xl py-2" style={ui.alertError}>
                    الفاتورة كاملة آجل — {customer ? customer.name : 'يرجى تحديد عميل'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Complete Sale — always pinned at bottom ────────────────────── */}
          <div className="px-3 pb-3 pt-2 space-y-2 flex-shrink-0" style={{ background: 'var(--bg-card)' }}>
            <button
              onClick={completeSale}
              disabled={isCompletingSale || createSaleMut.isPending || isLoadingPendingOrder || cart.length === 0 || !!cartStockError}
              className="w-full h-13 rounded-[20px] text-white font-black text-base transition-opacity disabled:opacity-40 flex items-center justify-center gap-2.5"
              style={{ background: 'var(--primary)', height: '52px' }}
            >
              <span>
                {isCompletingSale || createSaleMut.isPending ? 'جارٍ الحفظ...' : `إتمام البيع · ${fmt(total)}`}
              </span>

              {!isCompletingSale && !createSaleMut.isPending && (
                <span
                  className="text-[10px] font-black px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  F1
                </span>
              )}
            </button>

            <div className="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
              <input
                type="text"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="ملاحظات الفاتورة..."
                className="h-10 rounded-[16px] px-3.5 text-sm font-medium focus:outline-none"
                style={ui.input}
              />

              <div
                className="h-10 px-3 rounded-[16px] flex items-center text-xs font-black whitespace-nowrap"
                style={ui.subtle}
              >
                {cart.length} صنف
              </div>

              <div
                className="h-10 px-3 rounded-[16px] flex items-center text-xs font-black whitespace-nowrap"
                style={ui.subtle}
              >
                {Number(totalQty).toLocaleString('en-US', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 3,
                })} وحدة
              </div>
            </div>

            {cartStockError && (
              <div className="px-3 py-2 rounded-xl text-xs font-bold" style={ui.alertError}>
                {cartStockError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Parked Invoices Modal ────────────────────────────────────────── */}
      {showParked && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          dir="rtl"
          style={ui.overlay}
          onClick={(e) => e.target === e.currentTarget && setShowParked(false)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-[30px] overflow-hidden"
            style={ui.surface}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-sky-600" />
                <h2 className="font-black text-base" style={ui.heading}>الفواتير المحتجزة</h2>
                {parkedList.length > 0 && (
                  <span
                    className="text-xs font-black px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309' }}
                  >
                    {parkedList.length}
                  </span>
                )}
              </div>
              <button onClick={() => setShowParked(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ background: 'var(--bg-card)' }}>
              {parkedList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12" style={ui.muted}>
                  <Bookmark size={36} className="mb-2" />
                  <span className="text-sm font-semibold">لا توجد فواتير محتجزة</span>
                </div>
              )}

              {parkedList.map((p) => {
                const itemCount = p.cart.reduce((s, i) => s + i.quantity, 0);
                const total = p.cart.reduce((s, i) => s + i.total, 0) - p.saleDiscount;
                const time = new Date(p.created_at).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={p.id}
                    className="rounded-[24px] p-4 transition-colors"
                    style={ui.subtle}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-mono" style={ui.muted}>{time}</span>

                          {p.customer ? (
                            <span className="text-[15px] font-black truncate" style={ui.body}>{p.customer.name}</span>
                          ) : (
                            <span className="text-sm" style={ui.muted}>بدون عميل</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <span style={ui.secondary}>{p.cart.length} صنف · {itemCount.toFixed(1)} وحدة</span>
                          <span className="font-black text-sm text-emerald-600">{fmt(total)}</span>
                        </div>

                        <div className="mt-1.5 text-xs truncate" style={ui.muted}>
                          {p.cart.slice(0, 3).map((i) => i.product.name).join(' · ')}
                          {p.cart.length > 3 && ` +${p.cart.length - 3}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => deleteParked(p.id)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                          title="حذف"
                          style={ui.subtle}
                        >
                          <Trash2 size={14} style={{ color: 'var(--text-muted)' }} />
                        </button>

                        <button
                          onClick={() => restoreParked(p.id)}
                          className="h-9 px-3 rounded-xl text-white text-xs font-black transition-colors"
                          style={{ background: 'var(--primary)' }}
                        >
                          استعادة
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Weighted Product Modal ────────────────────────────────────────── */}
      {weightModal.product && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" dir="rtl" style={ui.overlay}>
          <div className="w-full max-w-sm rounded-[30px] p-6" style={ui.surface}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-lg" style={ui.heading}>{weightModal.product.name}</h3>
                <p className="text-xs mt-1" style={ui.muted}>
                  السعر: {fmt(parseFloat(weightModal.product.retail_price))} / {weightModal.product.unit}
                </p>
              </div>
              <button onClick={() => setWeightModal({ product: null, mode: 'weight', value: '' })}>
                <X size={18} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <div className="flex rounded-2xl overflow-hidden mb-4" style={ui.subtle}>
              <button
                onClick={() => setWeightModal((p) => ({ ...p, mode: 'weight', value: '' }))}
                className="flex-1 h-11 text-sm font-black transition-colors"
                style={weightModal.mode === 'weight' ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-muted)' }}
              >
                <Scale size={14} className="inline ml-1" /> بالوزن
              </button>

              <button
                onClick={() => setWeightModal((p) => ({ ...p, mode: 'amount', value: '' }))}
                className="flex-1 h-11 text-sm font-black transition-colors"
                style={weightModal.mode === 'amount' ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-muted)' }}
              >
                <DollarSign size={14} className="inline ml-1" /> بالمبلغ
              </button>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-black mb-1.5" style={ui.secondary}>
                {weightModal.mode === 'weight'
                  ? `الوزن (${weightModal.product.unit})`
                  : `المبلغ المطلوب (${symbol})`}
              </label>
              <input
                type="number"
                min="0.001"
                step={weightModal.mode === 'weight' ? '0.001' : '1'}
                className="w-full rounded-2xl px-4 h-12 text-lg font-black text-left focus:outline-none"
                style={ui.input}
                placeholder={weightModal.mode === 'weight' ? '0.000' : '0'}
                value={weightModal.value}
                onChange={(e) => setWeightModal((p) => ({ ...p, value: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && confirmWeighted()}
                autoFocus
              />
            </div>

            {weightModal.value && parseFloat(weightModal.value) > 0 && (() => {
              const price = parseFloat(weightModal.product!.retail_price);
              let qty = 0, amount = 0;
              if (weightModal.mode === 'weight') {
                qty = parseFloat(weightModal.value);
                amount = qty * price;
              } else {
                amount = parseFloat(weightModal.value) / rate;
                qty = price > 0 ? amount / price : 0;
              }
              return (
                <div className="rounded-2xl p-3 text-sm mb-4 flex justify-between" style={ui.alertSuccess}>
                  <span>{qty.toFixed(3)} {weightModal.product!.unit}</span>
                  <span className="font-black">{fmt(amount)}</span>
                </div>
              );
            })()}

            <button
              onClick={confirmWeighted}
              className="w-full h-12 rounded-2xl text-white font-black"
              style={{ background: 'var(--primary)' }}
            >
              إضافة للسلة
            </button>
          </div>
        </div>
      )}

      {/* ─── New Customer Quick Form ────────────────────────────────────── */}
      {showNewCustForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" dir="rtl" style={ui.overlay}>
          <div className="w-full max-w-sm rounded-[30px] p-6" style={ui.surface}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg" style={ui.heading}>عميل جديد</h3>
              <button onClick={() => setShowNewCustForm(false)}>
                <X size={18} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="الاسم *"
                className="w-full rounded-2xl px-4 h-12 text-sm focus:outline-none"
                style={ui.input}
                value={newCust.name}
                onChange={(e) => setNewCust((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />

              <input
                type="text"
                placeholder="رقم الهاتف"
                className="w-full rounded-2xl px-4 h-12 text-sm focus:outline-none"
                style={ui.input}
                value={newCust.phone}
                onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
              />

              <div className="flex gap-2 rounded-2xl overflow-hidden" style={ui.subtle}>
                {(['retail', 'wholesale'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewCust((p) => ({ ...p, customer_type: t }))}
                    className="flex-1 h-11 text-sm font-black transition-colors"
                    style={newCust.customer_type === t ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-muted)' }}
                  >
                    {t === 'retail' ? 'مفرق' : 'جملة'}
                  </button>
                ))}
              </div>

              <button
                disabled={!newCust.name.trim() || createCustMut.isPending}
                onClick={async () => {
                  const c = await createCustMut.mutateAsync({
                    name: newCust.name,
                    phone: newCust.phone || undefined,
                    customer_type: newCust.customer_type,
                  });
                  setCustomer(c);
                  setShowNewCustForm(false);
                  setNewCust({ name: '', phone: '', customer_type: 'retail' });
                }}
                className="w-full h-12 rounded-2xl text-white font-black disabled:opacity-50"
                style={{ background: 'var(--primary)' }}
              >
                {createCustMut.isPending ? 'جارٍ الحفظ...' : 'حفظ وإضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Time Component ──────────────────────────────────────────────────────
function LiveTime() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-muted)' }}>
      {time}
    </span>
  );
}
