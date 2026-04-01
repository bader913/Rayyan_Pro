import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package,
  Users, UserCheck, BarChart2, Settings, LogOut, ChevronLeft,
  Truck, RotateCcw, Contact, Shield, BadgeCheck, AlertTriangle,
  Receipt, FileText, TrendingUp, Barcode, Tag, QrCode, ArrowLeftRight,
  Bell, PackageX, Clock, Play, Square, Plus, Search, ShoppingBag, Lightbulb,
  CircleDollarSign, Repeat, UserCog, Loader2, X, Warehouse as WarehouseIcon, Brain,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore.ts';
import { authApi, apiClient } from '../api/client.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/settings.ts';
import { shiftsApi } from '../api/shifts.ts';
import { useEffect, useMemo, useState, useRef } from 'react';
import { customerOrdersApi } from '../api/customerOrders.ts';
import { usePosStore } from '../store/posStore.ts';
import AIAssistantModal from './AIAssistantModal.tsx';
const ZOOM_STEP = 5;
const ZOOM_MIN = 70;
const ZOOM_MAX = 130;

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  roles: string[];
  ready: boolean;
}

interface QuickActionItem {
  icon: React.ElementType;
  label: string;
  path: string;
  roles: string[];
}

const QUICK_ACTIONS: QuickActionItem[] = [
  { icon: ShoppingCart, label: 'فاتورة بيع جديدة', path: '/pos', roles: ['admin', 'manager', 'cashier'] },
  { icon: RotateCcw, label: 'مرتجع بيع', path: '/returns', roles: ['admin', 'manager', 'cashier'] },
  { icon: Truck, label: 'فاتورة شراء', path: '/purchases', roles: ['admin', 'manager', 'warehouse'] },
  { icon: Package, label: 'إضافة منتج', path: '/products', roles: ['admin', 'manager', 'warehouse'] },
  { icon: UserCheck, label: 'العملاء', path: '/customers', roles: ['admin', 'manager', 'cashier'] },
  { icon: Contact, label: 'الموردون', path: '/suppliers', roles: ['admin', 'manager', 'warehouse'] },
  { icon: Clock, label: 'الورديات', path: '/shifts', roles: ['admin', 'manager', 'cashier', 'warehouse'] },
  { icon: Receipt, label: 'تسجيل مصروف', path: '/expenses', roles: ['admin', 'manager'] },
];

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'لوحة التحكم', path: '/dashboard', roles: ['admin', 'manager', 'cashier', 'warehouse'], ready: true },
  { icon: ShoppingCart, label: 'نقطة البيع', path: '/pos', roles: ['admin', 'manager', 'cashier'], ready: true },
  { icon: ShoppingBag, label: 'الطلبات الواردة', path: '/incoming-orders', roles: ['admin', 'manager', 'cashier'], ready: true },
  { icon: Package, label: 'المنتجات', path: '/products', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: WarehouseIcon, label: 'المستودعات', path: '/warehouses', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: Brain, label: 'المستودعات الذكية', path: '/smart-warehouses', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: ArrowLeftRight, label: 'تحويلات المخزون', path: '/stock-transfers', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: FileText, label: 'فواتير المبيعات', path: '/sellInvoices', roles: ['admin', 'manager', 'cashier'], ready: true },
  { icon: Truck, label: 'المشتريات', path: '/purchases', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: RotateCcw, label: 'المرتجعات', path: '/returns', roles: ['admin', 'manager', 'cashier'], ready: true },
  { icon: Contact, label: 'الموردون', path: '/suppliers', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: UserCheck, label: 'العملاء', path: '/customers', roles: ['admin', 'manager', 'cashier'], ready: true },
  { icon: Users, label: 'المستخدمون', path: '/users', roles: ['admin', 'manager'], ready: true },
  { icon: BarChart2, label: 'التقارير', path: '/reports', roles: ['admin', 'manager'], ready: true },
  { icon: Clock, label: 'الورديات', path: '/shifts', roles: ['admin', 'manager', 'cashier', 'warehouse'], ready: true },
  { icon: Shield, label: 'سجل العمليات', path: '/audit-logs', roles: ['admin', 'manager'], ready: true },
  { icon: Receipt, label: 'المصاريف', path: '/expenses', roles: ['admin', 'manager'], ready: true },
  { icon: FileText, label: 'اصدار فواتير -عروض اسعار', path: '/invoices', roles: ['admin', 'manager'], ready: true },
  { icon: TrendingUp, label: 'حاسبة الربح', path: '/profit-calc', roles: ['admin', 'manager'], ready: true },
  { icon: Barcode, label: 'الباركود', path: '/barcodes', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: Tag, label: 'طباعة الأسعار', path: '/price-tags', roles: ['admin', 'manager', 'warehouse'], ready: true },
  { icon: QrCode, label: 'QR كود', path: '/qr-codes', roles: ['admin', 'manager', 'cashier', 'warehouse'], ready: true },
  { icon: ArrowLeftRight, label: 'محول العملات', path: '/currency-calc', roles: ['admin', 'manager', 'cashier', 'warehouse'], ready: true },
  // { icon: BadgeCheck,      label: 'الاشتراك',     path: '/subscription',   roles: ['admin', 'manager', 'cashier', 'warehouse'],  ready: true },
  { icon: Settings, label: 'الإعدادات', path: '/settings', roles: ['admin'], ready: true },
];
const CURRENCY_OPTIONS = [
  { value: 'SYP', label: 'ليرة سورية (SYP)' },
  { value: 'USD', label: 'دولار أمريكي (USD)' },
  { value: 'TRY', label: 'ليرة تركية (TRY)' },
  { value: 'SAR', label: 'ريال سعودي (SAR)' },
  { value: 'AED', label: 'درهم إماراتي (AED)' },
];

// fonts
const FONT_OPTIONS = [
  { value: 'Cairo', label: 'Cairo' },
  { value: 'Alexandria', label: 'Alexandria' },
  { value: 'Tajawal', label: 'Tajawal' },
  { value: 'Almarai', label: 'Almarai' },
  { value: 'IBM Plex Sans Arabic', label: 'IBM Plex Sans Arabic' },
  { value: 'Readex Pro', label: 'Readex Pro' },
  { value: 'Mada', label: 'Mada' },
  { value: 'Changa', label: 'Changa' },
  { value: 'El Messiri', label: 'El Messiri' },
  { value: 'Reem Kufi', label: 'Reem Kufi' },
];

const FONT_STACKS: Record<string, string> = {
  Cairo: "'Cairo', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  Alexandria: "'Alexandria', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  Tajawal: "'Tajawal', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  Almarai: "'Almarai', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  'IBM Plex Sans Arabic': "'IBM Plex Sans Arabic', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  'Readex Pro': "'Readex Pro', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  Mada: "'Mada', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  Changa: "'Changa', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  'El Messiri': "'El Messiri', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
  'Reem Kufi': "'Reem Kufi', 'Segoe UI', 'Noto Sans Arabic', 'Arial', sans-serif",
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير عام',
  manager: 'مدير',
  cashier: 'كاشير',
  warehouse: 'مخزن',
};
const MORNING_DECISIONS_READ_KEY_PREFIX = 'morning-decisions:last-opened:';

function formatLicenseRemainingShort(value?: string | null) {
  if (!value) return '';

  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'منتهية';

  const totalMinutes = Math.ceil(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}ي ${hours}س` : `${days}ي`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}س ${minutes}د` : `${hours}س`;
  }

  return `${Math.max(1, minutes)}د`;
}
const getLocalDateKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};


export default function Layout() {
  const { user, refreshToken, clearAuth, setAuth } = useAuthStore();
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getAll().then((r) => r.data.settings),
    staleTime: 0,
  });

  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn: () =>
      apiClient.get('/license/status').then(
        (r) =>
          r.data.license as {
            mode: 'active' | 'trial' | 'read_only';
            writable: boolean;
            reason: string;
            message: string;
            trial_expires_at?: string | null;
            activation_expires_at?: string | null;
            device_fingerprint?: string | null;
            customer_name?: string | null;
          }
      ),
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  /* ── Top bar dropdowns ── */
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [licenseActionLoading, setLicenseActionLoading] = useState(false);
  const [licenseActionMessage, setLicenseActionMessage] = useState('');
  const [licenseActionError, setLicenseActionError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [switchUserOpen, setSwitchUserOpen] = useState(false);
  const [switchUsername, setSwitchUsername] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [switchLoading, setSwitchLoading] = useState(false);

  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyError, setCurrencyError] = useState('');

  const [fontFamily, setFontFamily] = useState<string>(() => localStorage.getItem('ui-font') || 'Cairo');
  const isShiftsEnabled = settings?.enable_shifts === 'true';
  const isMultiWarehouseEnabled = settings?.enable_multi_warehouse === 'true';

  const { data: usersList } = useQuery({
    queryKey: ['layout-users-list'],
    queryFn: () =>
      apiClient
        .get('/users')
        .then((r) => ((r.data?.users ?? r.data) as Array<{ id: number; username: string; full_name: string; role: string }>)),
    enabled: switchUserOpen,
    staleTime: 30000,
  });
  const notifRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const smartRef = useRef<HTMLDivElement>(null);
  const { data: lowStockData } = useQuery({
    queryKey: ['low-stock-notif'],
    queryFn: () => apiClient.get('/products', { params: { low_stock: true, limit: 50 } })
      .then((r) => (r.data as { products: { id: number; name: string; stock_quantity: string; min_stock_level: string; unit: string | null }[] }).products),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const lowStockItems = lowStockData ?? [];
  const canSeeIncomingOrders =
    !!user && ['admin', 'manager', 'cashier'].includes(user.role);

  const { data: incomingOrdersPendingCount = 0 } = useQuery({
    queryKey: ['customer-orders', 'pending-badge'],
    queryFn: () => customerOrdersApi.getPendingCount().then((r) => r.count),
    enabled: canSeeIncomingOrders,
    staleTime: 5000,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const location = useLocation();
  // morning
  const canSeeMorningDecisions =
    !!user && ['admin', 'manager'].includes(user.role);

  const [morningViewedToday, setMorningViewedToday] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setMorningViewedToday(false);
      return;
    }

    const saved = localStorage.getItem(
      `${MORNING_DECISIONS_READ_KEY_PREFIX}${user.id}`
    );

    setMorningViewedToday(saved === getLocalDateKey());
  }, [user?.id, location.pathname]);

  const { data: morningDecisionsSummary } = useQuery({
    queryKey: ['morning-decisions-summary'],
    queryFn: () =>
      apiClient
        .get('/dashboard/morning-decisions')
        .then((r) => r.data.summary as {
          badge_count: number;
          urgent_restock_count: number;
          slow_moving_count: number;
          top_selling_count: number;
          pending_orders_count: number;
          attention_count: number;
          generated_at: string;
        }),
    enabled: canSeeMorningDecisions,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const morningUnread =
    canSeeMorningDecisions &&
    !!morningDecisionsSummary &&
    morningDecisionsSummary.badge_count > 0 &&
    !morningViewedToday;

  const handleOpenMorningDecisions = () => {
    if (user?.id) {
      localStorage.setItem(
        `${MORNING_DECISIONS_READ_KEY_PREFIX}${user.id}`,
        getLocalDateKey()
      );
      setMorningViewedToday(true);
    }

    navigate('/morning-decisions');
  };
  /* ── Current shift (all roles) ── */
  const { data: currentShift } = useQuery({
    queryKey: ['current-shift'],
    queryFn: () => shiftsApi.getCurrent().then((r) => r.data.shift),
    enabled: isShiftsEnabled,
    refetchInterval: isShiftsEnabled ? 60000 : false,
    staleTime: 30000,
  });

  /* Close top bar dropdowns on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;

      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }

      if (quickRef.current && !quickRef.current.contains(target)) {
        setQuickOpen(false);
      }

      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }

      if (todayRef.current && !todayRef.current.contains(target)) {
        setTodayOpen(false);
      }

      if (smartRef.current && !smartRef.current.contains(target)) {
        setSmartOpen(false);
      }
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const color = settings.theme_color || '#059669';
    document.documentElement.style.setProperty('--primary', color);
    if (settings.theme_mode === 'dark') {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [settings]);
  // useEffect fonts
  useEffect(() => {
    const safeFont = FONT_STACKS[fontFamily] ? fontFamily : 'Cairo';
    document.documentElement.style.setProperty('--font-app', FONT_STACKS[safeFont]);
    localStorage.setItem('ui-font', safeFont);

    if (safeFont !== fontFamily) {
      setFontFamily(safeFont);
    }
  }, [fontFamily]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);



  /* ── Cart nav guard ── */

  const cartCount = usePosStore((s) => s.cartCount);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  /* ── Zoom ── */
  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem('ui-zoom');
    return saved ? parseInt(saved, 10) : 100;
  });

  useEffect(() => {
    if (settings && !isShiftsEnabled && location.pathname.startsWith('/shifts')) {
      navigate('/dashboard', { replace: true });
    }
  }, [settings, isShiftsEnabled, location.pathname, navigate]);

  useEffect(() => {
    if (settings && !isMultiWarehouseEnabled && location.pathname.startsWith('/warehouses')) {
      navigate('/dashboard', { replace: true });
    }
  }, [settings, isMultiWarehouseEnabled, location.pathname, navigate]);

  //stock transfers nav guard
  useEffect(() => {
    if (settings && !isMultiWarehouseEnabled && location.pathname.startsWith('/stock-transfers')) {
      navigate('/dashboard', { replace: true });
    }
  }, [settings, isMultiWarehouseEnabled, location.pathname, navigate]);

  useEffect(() => {
    document.documentElement.style.zoom = `${zoom}%`;
    localStorage.setItem('ui-zoom', String(zoom));
  }, [zoom]);
  const zoomIn = () => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN));
  const zoomReset = () => setZoom(100);

  const primary = 'var(--primary)';

  const activeCurrency = String(settings?.currency || 'USD').trim().toUpperCase();


  const visibleUsers = useMemo(() => {
    const list = Array.isArray(usersList) ? usersList : [];
    return list.filter((u) => u.username !== user?.username);
  }, [usersList, user?.username]);

  const handleQuickCurrencyChange = async (nextCurrency: string) => {
    if (!nextCurrency || nextCurrency === activeCurrency) return;

    setCurrencySaving(true);
    setCurrencyError('');

    try {
      await settingsApi.update('currency', nextCurrency);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (e: any) {
      setCurrencyError(e?.response?.data?.message ?? 'تعذر تغيير العملة');
    } finally {
      setCurrencySaving(false);
    }
  };

  const handleSwitchUser = async () => {
    const username = switchUsername.trim();
    const password = switchPassword;

    if (!username || !password) {
      setSwitchError('أدخل اسم المستخدم وكلمة المرور');
      return;
    }

    setSwitchLoading(true);
    setSwitchError('');

    try {
      const res = await authApi.login(username, password);
      const payload = res.data;

      const nextUser = payload.user;
      const nextAccessToken = payload.access_token;
      const nextRefreshToken = payload.refresh_token;

      setAuth(nextUser, nextAccessToken, nextRefreshToken);

      setSwitchUserOpen(false);
      setSwitchUsername('');
      setSwitchPassword('');
      setSwitchError('');

      await queryClient.invalidateQueries();
      navigate('/dashboard');
    } catch (e: any) {
      setSwitchError(e?.response?.data?.message ?? 'فشل تبديل المستخدم');
    } finally {
      setSwitchLoading(false);
    }
  };

  /* Intercept sidebar nav when POS has items in cart */
  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetPath: string,
  ) => {
    if (cartCount > 0 && location.pathname === '/pos' && targetPath !== '/pos') {
      e.preventDefault();
      setPendingPath(targetPath);
    }
  };

  const handleLogout = async () => {
    if (refreshToken) {
      try { await authApi.logout(refreshToken); } catch { }
    }
    clearAuth();
    navigate('/login', { replace: true });
  };

  const visibleItems = NAV_ITEMS.filter((item) =>
    user
      ? item.roles.includes(user.role) &&
      (isShiftsEnabled || item.path !== '/shifts') &&
      (
        isMultiWarehouseEnabled ||
        (
          item.path !== '/warehouses' &&
          item.path !== '/stock-transfers' &&
          item.path !== '/smart-warehouses'
        )
      )
      : false
  );

  const quickActions = QUICK_ACTIONS.filter((item) =>
    user
      ? item.roles.includes(user.role) && (isShiftsEnabled || item.path !== '/shifts')
      : false
  );

  const currentPageTitle =
    location.pathname === '/morning-decisions'
      ? 'قرارات اليوم'
      : visibleItems.find(
        (item) =>
          location.pathname === item.path ||
          location.pathname.startsWith(item.path + '/')
      )?.label ?? 'ريان برو';
  const licenseBadge = useMemo(() => {
    if (!licenseStatus) return null;

    if (licenseStatus.mode === 'trial') {
      const remaining = formatLicenseRemainingShort(licenseStatus.trial_expires_at);
      return {
        label: remaining ? `تجريبية • ${remaining}` : 'تجريبية',
        title: licenseStatus.message,
        style: {
          background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-card))',
          color: '#b45309',
          border: '1px solid color-mix(in srgb, #f59e0b 24%, var(--border))',
        } as React.CSSProperties,
      };
    }

    if (licenseStatus.mode === 'read_only') {
      return {
        label: 'قراءة فقط',
        title: licenseStatus.message,
        style: {
          background: 'color-mix(in srgb, #ef4444 10%, var(--bg-card))',
          color: '#b91c1c',
          border: '1px solid color-mix(in srgb, #ef4444 24%, var(--border))',
        } as React.CSSProperties,
      };
    }

    return {
      label: 'مفعّلة',
      title: licenseStatus.message,
      style: {
        background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))',
        color: 'var(--primary)',
        border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))',
      } as React.CSSProperties,
    };
  }, [licenseStatus]);

  const isPosPage = location.pathname === '/pos';

  const { data: globalSearchData, isFetching: globalSearchLoading } = useQuery({
    queryKey: ['global-search', debouncedSearch],
    queryFn: () =>
      apiClient
        .get('/global-search', {
          params: {
            q: debouncedSearch,
            limit: 8,
          },
        })
        .then((r) => r.data.results as Array<{
          id: number;
          title: string;
          subtitle: string | null;
          route: string;
          kind: 'product' | 'customer' | 'supplier' | 'sale' | 'return' | 'warehouse';
          score: number;
        }>),
    enabled: debouncedSearch.length >= 2,
    staleTime: 10000,
  });

  const globalSearchResults = globalSearchData ?? [];

  const getSearchKindLabel = (
    kind: 'product' | 'customer' | 'supplier' | 'sale' | 'return' | 'warehouse'
  ) => {
    switch (kind) {
      case 'product':
        return 'منتج';
      case 'customer':
        return 'عميل';
      case 'supplier':
        return 'مورد';
      case 'warehouse':
        return 'مستودع';
      case 'sale':
        return 'فاتورة';
      case 'return':
        return 'مرتجع';
      default:
        return 'نتيجة';
    }
  };

  const getSearchKindIcon = (
    kind: 'product' | 'customer' | 'supplier' | 'sale' | 'return' | 'warehouse'
  ) => {
    switch (kind) {
      case 'product':
        return Package;
      case 'customer':
        return UserCheck;
      case 'supplier':
        return Truck;
      case 'warehouse':
        return WarehouseIcon;
      case 'sale':
        return Receipt;
      case 'return':
        return RotateCcw;
      default:
        return Search;
    }
  };
  const { data: todaySummaryData, isFetching: todaySummaryLoading } = useQuery({
    queryKey: ['topbar-today-summary'],
    queryFn: () =>
      apiClient
        .get('/dashboard/today-summary')
        .then((r) => r.data.summary as {
          salesCount: number;
          returnsCount: number;
          salesTotal: number;
          returnsTotal: number;
          netSales: number;
          collectedTotal: number;
          cashRefundsTotal: number;
          netCash: number;
        }),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const todaySummary = todaySummaryData ?? {
    salesCount: 0,
    returnsCount: 0,
    salesTotal: 0,
    returnsTotal: 0,
    netSales: 0,
    collectedTotal: 0,
    cashRefundsTotal: 0,
    netCash: 0,
  };

  const currencyCode = String(settings?.currency || '').trim();

  const formatTodayMoney = (value: number) =>
    new Intl.NumberFormat('ar', {
      minimumFractionDigits: currencyCode === 'SYP' ? 0 : 2,
      maximumFractionDigits: currencyCode === 'SYP' ? 0 : 2,
    }).format(value);

  const { data: smartSuggestionsData, isFetching: smartSuggestionsLoading } = useQuery({
    queryKey: ['topbar-smart-suggestions'],
    queryFn: () =>
      apiClient
        .get('/dashboard/smart-suggestions')
        .then((r) => r.data.suggestions as {
          reorderNow: Array<{
            id: number;
            name: string;
            stock_quantity: number;
            min_stock_level: number;
            net_sold_30: number;
            days_left: number | null;
          }>;
          stockRisk: Array<{
            id: number;
            name: string;
            stock_quantity: number;
            min_stock_level: number;
            net_sold_14: number;
            days_left: number;
          }>;
          slowMoving: Array<{
            id: number;
            name: string;
            stock_quantity: number;
            min_stock_level: number;
            last_sale_at: string | null;
            days_since_last_sale: number | null;
          }>;
          total: number;
        }),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const smartSuggestions = smartSuggestionsData ?? {
    reorderNow: [],
    stockRisk: [],
    slowMoving: [],
    total: 0,
  };

  const formatSuggestionNumber = (value: number) =>
    new Intl.NumberFormat('ar', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
      const formatLicenseDateTime = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;

    return d.toLocaleString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleImportActivation = async () => {
    if (!window.electronAPI?.importActivationFile || licenseActionLoading) return;

    setLicenseActionLoading(true);
    setLicenseActionMessage('');
    setLicenseActionError('');

    try {
      const result = await window.electronAPI.importActivationFile();

      if (result?.canceled) {
        setLicenseActionLoading(false);
        return;
      }

      if (!result?.ok) {
        setLicenseActionError(result?.message || 'فشل استيراد ملف التفعيل');
        setLicenseActionLoading(false);
        return;
      }

      setLicenseActionMessage(result?.message || 'تم استيراد ملف التفعيل بنجاح');
      await queryClient.invalidateQueries({ queryKey: ['license-status'] });
    } catch (error: any) {
      setLicenseActionError(error?.message || 'فشل استيراد ملف التفعيل');
    } finally {
      setLicenseActionLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden flex" dir="rtl" style={{ background: 'var(--bg-page)' }}>
      {/* Sidebar */}
      <aside
        className="w-[248px] h-screen min-h-0 flex flex-col flex-shrink-0 border-l"
        style={{
          background: 'var(--bg-sidebar)',
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          boxShadow: '0 0 0 1px color-mix(in srgb, var(--border) 30%, transparent), var(--shadow-sidebar)',
        }}
      >
        {/* Logo */}
        <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-base flex-shrink-0"
              style={{ background: primary }}
            >
              ر
            </div>
            <div>
              <div className="font-black text-sm leading-tight" style={{ color: 'var(--text-heading)' }}>ريان برو</div>
              <div className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>Rayyan Pro v1.0.0</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2.5 space-y-1 overflow-y-auto">
          {visibleItems.map((item) =>
            item.ready ? (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={(e) => handleNavClick(e, item.path)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-extrabold transition-all group`
                }
                style={({ isActive }) =>
                  isActive
                    ? {
                      background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                      color: 'var(--primary)',
                      border: '1px solid color-mix(in srgb, var(--primary) 28%, var(--border))',
                    }
                    : { color: 'var(--text-secondary)' }
                }
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  if (!el.classList.contains('text-white')) {
                    el.style.background = 'var(--bg-muted)';
                    el.style.color = 'var(--text-heading)';
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if (!el.classList.contains('text-white')) {
                    el.style.background = '';
                    el.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <item.icon size={17} className="flex-shrink-0" />
                <span>{item.label}</span>

                {item.path === '/incoming-orders' && incomingOrdersPendingCount > 0 && (
                  <span
                    className="mr-auto min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-black text-white"
                    style={{ background: 'var(--primary)' }}
                  >
                    {incomingOrdersPendingCount > 99 ? '99+' : incomingOrdersPendingCount}
                  </span>
                )}
              </NavLink>
            ) : (
              <div
                key={item.path}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-extrabold cursor-not-allowed select-none"
                style={{ color: 'var(--text-muted)' }}
              >
                <item.icon size={17} className="flex-shrink-0" />
                <span>{item.label}</span>
                <span className="mr-auto text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider"
                  style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                  قريباً
                </span>
              </div>
            )
          )}
        </nav>

        {/* User + Quick Tools */}
        <div className="p-3 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
          <div
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--bg-subtle) 78%, var(--bg-card))',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs flex-shrink-0"
              style={{ background: primary }}
            >
              {user?.full_name?.[0] || 'م'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-black truncate" style={{ color: 'var(--text-body)' }}>
                {user?.full_name}
              </div>
              <div className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
              </div>
            </div>

            <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
          </div>



          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:scale-[1.03]  rounded-xl text-sm font-extrabold text-rose-500 transition-colors"
            style={{
              border: '2px solid transparent',
            }}
          >
            <LogOut size={15} />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 h-screen overflow-hidden flex flex-col">

        {/* ── Top bar: page title + quick actions + notifications + shift status ── */}
        <div
          className={`sticky top-0 z-30 flex items-center justify-between gap-3 border-b flex-shrink-0 ${isPosPage ? 'px-3 py-2' : 'px-4 py-2.5'
            }`}
          style={{
            background: 'color-mix(in srgb, var(--bg-card) 92%, transparent)',
            borderColor: 'var(--border)',
            minHeight: isPosPage ? '52px' : '58px',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >

          <div className="min-w-0">
            <div
              className="text-base font-extrabold truncate"
              style={{ color: 'var(--text-heading)', letterSpacing: '-0.01em' }}
            >
              {currentPageTitle}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                {isPosPage ? 'واجهة البيع السريعة' : 'أدوات سريعة وتنبيهات مباشرة'}
              </div>

              {licenseBadge && (
                <button
                  type="button"
                  onClick={() => {
                    setLicenseOpen(true);
                    setLicenseActionError('');
                    setLicenseActionMessage('');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap transition-opacity hover:opacity-90"
                  style={licenseBadge.style}
                  title={licenseBadge.title}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: 'currentColor', opacity: 0.9 }}
                  />
                  {licenseBadge.label}
                </button>
              )}
            </div>
          </div>
          {/* Today Summary */}
          {canSeeMorningDecisions && (
            <button
              type="button"
              onClick={handleOpenMorningDecisions}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
              style={{
                background:
                  location.pathname === '/morning-decisions'
                    ? 'var(--bg-muted)'
                    : morningUnread
                      ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                      : 'transparent',
                color:
                  location.pathname === '/morning-decisions' || morningUnread
                    ? 'var(--primary)'
                    : 'var(--text-secondary)',
              }}
              title="قرارات اليوم"
            >
              <Brain size={17} />

              {!!morningDecisionsSummary?.badge_count && (
                <span
                  className="absolute -top-0.5 -left-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-black text-white px-0.5"
                  style={{ background: 'var(--primary)' }}
                >
                  {morningDecisionsSummary.badge_count > 99
                    ? '99+'
                    : morningDecisionsSummary.badge_count}
                </span>
              )}

              {morningUnread && (
                <span
                  className="absolute top-[2px] right-[2px] w-2 h-2 rounded-full animate-pulse"
                  style={{ background: 'var(--primary)' }}
                />
              )}
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-1 p-1 rounded-[18px]"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                className="flex items-center gap-1.5 px-2.5 h-11 rounded-xl min-w-[96px]"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
                title="العملة الحالية"
              >
                <CircleDollarSign size={14} style={{ color: 'var(--text-muted)' }} />

                <select
                  value={activeCurrency}
                  onChange={(e) => handleQuickCurrencyChange(e.target.value)}
                  disabled={currencySaving}
                  className="flex-1 bg-transparent outline-none text-xs font-black"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value}
                    </option>
                  ))}
                </select>

                {currencySaving && (
                  <Loader2 size={13} className="animate-spin" style={{ color: 'var(--primary)' }} />
                )}
              </div>
              <div
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl min-w-[118px]"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
                title="خط التطبيق"
              >
                <span
                  className="text-[11px] font-black whitespace-nowrap"
                  style={{ color: 'var(--text-muted)' }}
                >
                  خط
                </span>

                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-xs font-black"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setSwitchUserOpen(true)}
                className="flex items-center gap-1.5 px-3 h-11 rounded-xl text-xs font-extrabold transition-colors"
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  minWidth: '92px',
                  justifyContent: 'center',
                }}
                title="تبديل المستخدم"
              >
                <Repeat size={13} />
                <span>تبديل</span>
              </button>
              <div ref={todayRef} className="relative">
                <button
                  onClick={() => {
                    setTodayOpen((o) => !o);
                    setQuickOpen(false);
                    setNotifOpen(false);
                    setSearchOpen(false);
                    setSmartOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-extrabold transition-colors"
                  style={{
                    background: todayOpen ? 'var(--bg-muted)' : 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                  title="ملخص اليوم"
                >
                  <BarChart2 size={15} />
                  <span>ملخص اليوم</span>
                </button>

                {todayOpen && (
                  <div
                    className="absolute top-full left-0 mt-2 w-[340px] rounded-2xl shadow-2xl z-50 overflow-hidden"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  >
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                      <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                        ملخص اليوم
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        أرقام سريعة ومباشرة لليوم الحالي
                      </div>
                    </div>

                    {todaySummaryLoading ? (
                      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        جارٍ تحميل الملخص...
                      </div>
                    ) : (
                      <div className="p-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTodayOpen(false);
                            navigate('/sellInvoices');
                          }}
                          className="rounded-xl p-3 text-right transition-all hover:scale-[1.01]"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                        >
                          <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                            صافي المبيعات
                          </div>
                          <div className="mt-1 text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                            {formatTodayMoney(todaySummary.netSales)} {currencyCode}
                          </div>
                          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            بعد خصم المرتجعات
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTodayOpen(false);
                            navigate('/sellInvoices');
                          }}
                          className="rounded-xl p-3 text-right transition-all hover:scale-[1.01]"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                        >
                          <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                            عدد الفواتير
                          </div>
                          <div className="mt-1 text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
                            {todaySummary.salesCount}
                          </div>
                          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            مبيعات اليوم
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTodayOpen(false);
                            navigate('/returns');
                          }}
                          className="rounded-xl p-3 text-right transition-all hover:scale-[1.01]"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                        >
                          <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                            المرتجعات
                          </div>
                          <div className="mt-1 text-sm font-black" style={{ color: '#ef4444' }}>
                            {formatTodayMoney(todaySummary.returnsTotal)} {currencyCode}
                          </div>
                          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            عددها: {todaySummary.returnsCount}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTodayOpen(false);
                            navigate('/reports');
                          }}
                          className="rounded-xl p-3 text-right transition-all hover:scale-[1.01]"
                          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                        >
                          <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                            الصافي النقدي
                          </div>
                          <div className="mt-1 text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                            {formatTodayMoney(todaySummary.netCash)} {currencyCode}
                          </div>
                          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            المقبوض - الرد النقدي
                          </div>
                        </button>
                      </div>
                    )}

                    <div className="px-3 pb-3">
                      <NavLink
                        to="/dashboard"
                        onClick={() => setTodayOpen(false)}
                        className="block text-center text-xs font-black py-2 rounded-xl transition-colors"
                        style={{ background: 'var(--primary)', color: '#fff' }}
                      >
                        فتح لوحة التحكم
                      </NavLink>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Smart Suggestions */}
            <div ref={smartRef} className="relative">
              <button
                onClick={() => {
                  setSmartOpen((o) => !o);
                  setQuickOpen(false);
                  setNotifOpen(false);
                  setSearchOpen(false);
                  setTodayOpen(false);
                }}
                className="flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-extrabold transition-colors"
                style={{
                  background: smartOpen ? 'var(--bg-muted)' : 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
                title="اقتراحات ذكية"
              >
                <Lightbulb size={15} />
                <span>اقتراحات ذكية</span>

                {smartSuggestions.total > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-black text-white px-1"
                    style={{ background: 'var(--primary)' }}
                  >
                    {smartSuggestions.total > 9 ? '9+' : smartSuggestions.total}
                  </span>
                )}
              </button>

              {smartOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-[390px] rounded-2xl shadow-2xl z-50 overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                      اقتراحات ذكية
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      توصيات عملية مبنية على حركة البيع والمخزون
                    </div>
                  </div>

                  {smartSuggestionsLoading ? (
                    <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      جارٍ تحليل البيانات...
                    </div>
                  ) : smartSuggestions.total === 0 ? (
                    <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      لا توجد اقتراحات مهمة الآن
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto p-2 space-y-3">
                      {smartSuggestions.reorderNow.length > 0 && (
                        <div>
                          <div className="px-2 pb-1 text-[11px] font-black" style={{ color: '#b45309' }}>
                            لازم ينطلب الآن
                          </div>

                          <div className="space-y-1">
                            {smartSuggestions.reorderNow.map((item) => (
                              <button
                                key={`reorder-${item.id}`}
                                onClick={() => {
                                  setSmartOpen(false);
                                  navigate('/purchases');
                                }}
                                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right transition-colors"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-subtle)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '';
                                }}
                              >
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ background: 'rgba(245,158,11,0.12)' }}
                                >
                                  <Package size={16} style={{ color: '#d97706' }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black truncate" style={{ color: 'var(--text-color)' }}>
                                      {item.name}
                                    </span>
                                    <span
                                      className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                                      style={{
                                        background: 'rgba(245,158,11,0.12)',
                                        color: '#b45309',
                                        border: '1px solid rgba(245,158,11,0.25)',
                                      }}
                                    >
                                      اطلب الآن
                                    </span>
                                  </div>

                                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                    المتبقي: {formatSuggestionNumber(item.stock_quantity)} • الحد الأدنى: {formatSuggestionNumber(item.min_stock_level)}
                                  </div>

                                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                    صافي بيع 30 يوم: {formatSuggestionNumber(item.net_sold_30)}
                                    {item.days_left !== null ? ` • يكفي تقريبًا ${formatSuggestionNumber(item.days_left)} يوم` : ''}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {smartSuggestions.stockRisk.length > 0 && (
                        <div>
                          <div className="px-2 pb-1 text-[11px] font-black" style={{ color: '#dc2626' }}>
                            خطر نفاد قريب
                          </div>

                          <div className="space-y-1">
                            {smartSuggestions.stockRisk.map((item) => (
                              <button
                                key={`risk-${item.id}`}
                                onClick={() => {
                                  setSmartOpen(false);
                                  navigate('/products');
                                }}
                                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right transition-colors"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-subtle)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '';
                                }}
                              >
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ background: 'rgba(239,68,68,0.12)' }}
                                >
                                  <AlertTriangle size={16} style={{ color: '#dc2626' }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black truncate" style={{ color: 'var(--text-color)' }}>
                                      {item.name}
                                    </span>
                                    <span
                                      className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                                      style={{
                                        background: 'rgba(239,68,68,0.12)',
                                        color: '#dc2626',
                                        border: '1px solid rgba(239,68,68,0.25)',
                                      }}
                                    >
                                      خطر قريب
                                    </span>
                                  </div>

                                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                    المتبقي: {formatSuggestionNumber(item.stock_quantity)} • الحد الأدنى: {formatSuggestionNumber(item.min_stock_level)}
                                  </div>

                                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                    صافي بيع 14 يوم: {formatSuggestionNumber(item.net_sold_14)} • يكفي تقريبًا {formatSuggestionNumber(item.days_left)} يوم
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {smartSuggestions.slowMoving.length > 0 && (
                        <div>
                          <div className="px-2 pb-1 text-[11px] font-black" style={{ color: '#6b7280' }}>
                            منتجات راكدة
                          </div>

                          <div className="space-y-1">
                            {smartSuggestions.slowMoving.map((item) => (
                              <button
                                key={`slow-${item.id}`}
                                onClick={() => {
                                  setSmartOpen(false);
                                  navigate('/products');
                                }}
                                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right transition-colors"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-subtle)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '';
                                }}
                              >
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ background: 'rgba(107,114,128,0.12)' }}
                                >
                                  <Clock size={16} style={{ color: '#6b7280' }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black truncate" style={{ color: 'var(--text-color)' }}>
                                      {item.name}
                                    </span>
                                    <span
                                      className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                                      style={{
                                        background: 'rgba(107,114,128,0.12)',
                                        color: '#6b7280',
                                        border: '1px solid rgba(107,114,128,0.2)',
                                      }}
                                    >
                                      راكد
                                    </span>
                                  </div>

                                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                    المخزون الحالي: {formatSuggestionNumber(item.stock_quantity)}
                                  </div>

                                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                    {item.days_since_last_sale === null
                                      ? 'لم يُبع سابقًا'
                                      : `آخر بيع منذ ${formatSuggestionNumber(item.days_since_last_sale)} يوم`}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    <NavLink
                      to="/products"
                      onClick={() => setSmartOpen(false)}
                      className="block text-center text-xs font-black py-2 rounded-xl transition-colors"
                      style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                      فتح المنتجات
                    </NavLink>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAssistantOpen(true);
                setQuickOpen(false);
                setNotifOpen(false);
                setSearchOpen(false);
                setTodayOpen(false);
                setSmartOpen(false);
              }}
              className="flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-extrabold transition-colors"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              title="مساعد الريان"
            >
              <UserCog size={15} />
              <span>مساعد الريان</span>
            </button>
            {/* Global Search */}
            <div ref={searchRef} className="relative w-[320px] max-w-[34vw]">
              <div
                className="flex items-center gap-2.5 rounded-2xl px-3.5 h-11 border"
                style={{
                  background: 'var(--bg-subtle)',
                  borderColor: searchOpen ? 'var(--primary)' : 'var(--border-color)',
                }}
              >
                <Search size={16} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
                <input
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSearchOpen(true);
                    setQuickOpen(false);
                    setNotifOpen(false);
                    setTodayOpen(false);
                    setSmartOpen(false);
                  }}
                  onFocus={() => {
                    setSearchOpen(true);
                    setQuickOpen(false);
                    setNotifOpen(false);
                    setTodayOpen(false);
                    setSmartOpen(false);
                  }}
                  placeholder={
                    isMultiWarehouseEnabled
                      ? 'ابحث عن منتج، عميل، مورد، مستودع، فاتورة...'
                      : 'ابحث عن منتج، عميل، مورد، فاتورة...'
                  }
                  className="w-full bg-transparent outline-none text-sm font-medium placeholder:opacity-100"
                  style={{ color: 'var(--text-color)' }}
                />

              </div>


              {searchOpen && (searchTerm.trim().length > 0) && (
                <div
                  className="absolute top-full left-0 mt-2 w-full rounded-2xl shadow-2xl z-50 overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                      البحث العام
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      {isMultiWarehouseEnabled
                        ? 'ابحث في المنتجات والعملاء والموردين والمستودعات والفواتير والمرتجعات'
                        : 'ابحث في المنتجات والعملاء والموردين والفواتير والمرتجعات'}
                    </div>
                  </div>

                  {searchTerm.trim().length < 2 ? (
                    <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      اكتب حرفين على الأقل
                    </div>
                  ) : globalSearchLoading ? (
                    <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      جارٍ البحث...
                    </div>
                  ) : globalSearchResults.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      لا توجد نتائج مطابقة
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                      {globalSearchResults.map((item) => {
                        const ItemIcon = getSearchKindIcon(item.kind);

                        return (
                          <button
                            key={`${item.kind}-${item.id}`}
                            onClick={() => {
                              setSearchOpen(false);
                              setSearchTerm('');
                              navigate(item.route);
                            }}
                            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right transition-colors"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--bg-subtle)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '';
                            }}
                          >
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: 'var(--bg-subtle)' }}
                            >
                              <ItemIcon size={16} style={{ color: 'var(--primary)' }} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black truncate" style={{ color: 'var(--text-color)' }}>
                                  {item.title}
                                </span>
                                <span
                                  className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                                  style={{
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-muted)',
                                    border: '1px solid var(--border-color)',
                                  }}
                                >
                                  {getSearchKindLabel(item.kind)}
                                </span>
                              </div>

                              {item.subtitle ? (
                                <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                                  {item.subtitle}
                                </div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Quick actions */}
            <div ref={quickRef} className="relative">
              <button
                onClick={() => {
                  setQuickOpen((o) => !o);
                  setNotifOpen(false);
                  setSearchOpen(false);
                  setTodayOpen(false);
                  setSmartOpen(false);
                }}
                className="flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-extrabold transition-colors"
                style={{
                  background: quickOpen ? 'var(--bg-muted)' : 'var(--primary)',
                  color: quickOpen ? 'var(--text-primary)' : '#fff',
                  border: quickOpen ? '1px solid var(--border)' : '1px solid transparent',
                }}
                title="إجراءات سريعة"
              >
                <Plus size={15} />
                <span>اجراء سريع</span>
              </button>

              {quickOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-72 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                      إجراءات سريعة
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      وصول أسرع لأكثر العمليات استخدامًا
                    </div>
                  </div>

                  <div className="p-2 space-y-1">
                    {quickActions.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => {
                          setQuickOpen(false);
                          navigate(item.path);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-muted)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '';
                        }}
                      >
                        <item.icon size={16} className="flex-shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Zoom Controls */}
            <div
              className="flex items-center gap-1 rounded-xl px-1.5 h-11"
              style={{
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
              }}
            >
              <button
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
                title="تصغير"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base font-black transition-colors disabled:opacity-30"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                −
              </button>

              <button
                onClick={zoomReset}
                title="إعادة تعيين الحجم"
                className="min-w-[48px] h-8 px-2 rounded-lg text-xs font-black tabular-nums transition-colors"
                style={{
                  color: zoom === 100 ? 'var(--text-muted)' : 'var(--primary)',
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {zoom}%
              </button>

              <button
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
                title="تكبير"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base font-black transition-colors disabled:opacity-30"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                +
              </button>
            </div>

            {/* Shift status pill */}
            {isShiftsEnabled && (
              <NavLink
                to="/shifts"
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black transition-colors"
                style={currentShift
                  ? { background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }
                  : { background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                {currentShift ? <><Clock size={12} /> وردية مفتوحة</> : <><Play size={12} /> لا توجد وردية</>}
              </NavLink>
            )}

            {/* Notifications bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setQuickOpen(false);
                  setSearchOpen(false);
                  setTodayOpen(false);
                  setSmartOpen(false);
                }}
                className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
                style={{ background: notifOpen ? 'var(--bg-muted)' : 'transparent', color: 'var(--text-secondary)' }}
                title="إشعارات المخزون"
              >
                <Bell size={17} />
                {lowStockItems.length > 0 && (
                  <span
                    className="absolute -top-0.5 -left-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-black text-white px-0.5"
                    style={{ background: '#ef4444' }}
                  >
                    {lowStockItems.length > 99 ? '99+' : lowStockItems.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <PackageX size={15} className="text-orange-500" />
                      <span className="text-sm font-black" style={{ color: 'var(--text-heading)' }}>
                        مخزون منخفض
                      </span>
                    </div>
                    {lowStockItems.length > 0 && (
                      <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#ef4444' }}>
                        {lowStockItems.length}
                      </span>
                    )}
                  </div>

                  {lowStockItems.length === 0 ? (
                    <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      ✓ جميع المنتجات مستوى مخزونها كافٍ
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                      {lowStockItems.map((p) => {
                        const qty = parseFloat(p.stock_quantity);
                        const min = parseFloat(p.min_stock_level);
                        const pct = min > 0 ? Math.min(100, (qty / min) * 100) : 0;
                        const isEmpty = qty <= 0;

                        return (
                          <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: isEmpty ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }}
                            >
                              <PackageX size={14} style={{ color: isEmpty ? '#ef4444' : '#f59e0b' }} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                                {p.name}
                              </div>

                              <div className="flex items-center gap-2 mt-0.5">
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, background: isEmpty ? '#ef4444' : '#f59e0b' }}
                                  />
                                </div>

                                <span
                                  className="text-[10px] font-black flex-shrink-0"
                                  style={{ color: isEmpty ? '#ef4444' : '#f59e0b' }}
                                >
                                  {qty.toLocaleString()} {p.unit ?? ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <NavLink
                      to="/products"
                      onClick={() => setNotifOpen(false)}
                      className="block text-center text-xs font-black py-2 rounded-xl transition-colors"
                      style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                      إدارة المخزون
                    </NavLink>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Read-only banner when license expired */}

        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            className={
              isPosPage
                ? 'h-full min-h-0 p-3 md:p-4 flex flex-col'
                : 'h-full min-h-0 px-4 py-4 md:px-5 md:py-5 overflow-auto'
            }
          >
            <Outlet />
          </div>
        </div>
      </main>

      {/* ─── Cart Guard Dialog ───────────────────────────────────────────────── */}
      {pendingPath && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="w-[340px] rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)' }}
              >
                <AlertTriangle size={28} className="text-red-500" />
              </div>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                السلة تحتوي على منتجات
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                لديك{' '}
                <span className="font-black text-red-500">{cartCount}</span>
                {' '}منتج في السلة.
                <br />
                إذا غادرت الآن ستُمسح السلة بالكامل.
                <br />
                هل أنت متأكد؟
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  const path = pendingPath;
                  setPendingPath(null);
                  navigate(path);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ background: '#ef4444' }}
              >
                نعم، امسح وانتقل
              </button>
              <button
                onClick={() => setPendingPath(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-black transition-colors"
                style={{
                  background: 'var(--bg-muted)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
            {licenseOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <div className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                  حالة الترخيص
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  معلومات النسخة الحالية والتفعيل
                </div>
              </div>

              <button
                onClick={() => {
                  setLicenseOpen(false);
                  setLicenseActionError('');
                  setLicenseActionMessage('');
                }}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-black" style={{ color: 'var(--text-muted)' }}>
                    الحالة
                  </div>

                  {licenseBadge ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black whitespace-nowrap"
                      style={licenseBadge.style}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: 'currentColor', opacity: 0.9 }}
                      />
                      {licenseBadge.label}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 text-sm leading-6" style={{ color: 'var(--text-primary)' }}>
                  {licenseStatus?.message || '—'}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  <div className="text-[11px] font-black mb-1" style={{ color: 'var(--text-muted)' }}>
                    نوع الوضع
                  </div>
                  <div className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                    {licenseStatus?.mode === 'trial'
                      ? 'نسخة تجريبية'
                      : licenseStatus?.mode === 'read_only'
                        ? 'قراءة فقط'
                        : 'نسخة مفعّلة'}
                  </div>
                </div>

                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  <div className="text-[11px] font-black mb-1" style={{ color: 'var(--text-muted)' }}>
                    انتهاء التجربة
                  </div>
                  <div className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                    {formatLicenseDateTime(licenseStatus?.trial_expires_at)}
                  </div>
                </div>

                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  <div className="text-[11px] font-black mb-1" style={{ color: 'var(--text-muted)' }}>
                    انتهاء التفعيل
                  </div>
                  <div className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                    {formatLicenseDateTime(licenseStatus?.activation_expires_at)}
                  </div>
                </div>

                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  <div className="text-[11px] font-black mb-1" style={{ color: 'var(--text-muted)' }}>
                    بصمة الجهاز
                  </div>
                  <div
                    className="text-xs font-black break-all leading-6"
                    style={{ color: 'var(--text-primary)' }}
                    title={licenseStatus?.device_fingerprint || ''}
                  >
                    {licenseStatus?.device_fingerprint || '—'}
                  </div>
                </div>
              </div>

              {licenseActionError && (
                <div
                  className="rounded-xl px-3 py-2 text-xs font-bold"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}
                >
                  {licenseActionError}
                </div>
              )}

              {licenseActionMessage && (
                <div
                  className="rounded-xl px-3 py-2 text-xs font-bold"
                  style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}
                >
                  {licenseActionMessage}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleImportActivation}
                  disabled={licenseActionLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'var(--primary)' }}
                >
                  {licenseActionLoading ? 'جارٍ الاستيراد...' : 'استيراد ملف التفعيل'}
                </button>

                <button
                  onClick={() => {
                    setLicenseOpen(false);
                    setLicenseActionError('');
                    setLicenseActionMessage('');
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black transition-colors"
                  style={{
                    background: 'var(--bg-muted)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {switchUserOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <div className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                  تبديل المستخدم
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  دخول سريع بدون تسجيل خروج يدوي
                </div>
              </div>

              <button
                onClick={() => {
                  setSwitchUserOpen(false);
                  setSwitchUsername('');
                  setSwitchPassword('');
                  setSwitchError('');
                }}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {visibleUsers.length > 0 && (
                <div>
                  <div className="text-xs font-black mb-2" style={{ color: 'var(--text-muted)' }}>
                    مستخدمون سريعون
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {visibleUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSwitchUsername(u.username);
                          setSwitchError('');
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                        style={{
                          background: switchUsername === u.username ? 'var(--primary)' : 'var(--bg-subtle)',
                          color: switchUsername === u.username ? '#fff' : 'var(--text-primary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {u.full_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  اسم المستخدم
                </label>
                <input
                  value={switchUsername}
                  onChange={(e) => {
                    setSwitchUsername(e.target.value);
                    setSwitchError('');
                  }}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                  placeholder="أدخل اسم المستخدم"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  كلمة المرور
                </label>
                <input
                  type="password"
                  value={switchPassword}
                  onChange={(e) => {
                    setSwitchPassword(e.target.value);
                    setSwitchError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !switchLoading) {
                      handleSwitchUser();
                    }
                  }}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                  placeholder="أدخل كلمة المرور"
                />
              </div>

              {switchError && (
                <div
                  className="rounded-xl px-3 py-2 text-xs font-bold"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}
                >
                  {switchError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSwitchUser}
                  disabled={switchLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'var(--primary)' }}
                >
                  {switchLoading ? 'جارٍ التبديل...' : 'تبديل المستخدم'}
                </button>

                <button
                  onClick={() => {
                    setSwitchUserOpen(false);
                    setSwitchUsername('');
                    setSwitchPassword('');
                    setSwitchError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black transition-colors"
                  style={{
                    background: 'var(--bg-muted)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <AIAssistantModal
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
      />
    </div>
  );
}
