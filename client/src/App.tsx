import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './store/authStore.ts';
import { authApi } from './api/client.ts';
import Layout from './components/Layout.tsx';
import LoginPage from './pages/LoginPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import ProductsPage from './pages/ProductsPage.tsx';
import POSPage from './pages/POSPage.tsx';
import PurchasesPage from './pages/PurchasesPage.tsx';
import ReturnsPage from './pages/ReturnsPage.tsx';
import SuppliersPage from './pages/SuppliersPage.tsx';
import CustomersPage from './pages/CustomersPage.tsx';
import ReportsPage from './pages/ReportsPage.tsx';
import AuditLogPage from './pages/AuditLogPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import ShiftsPage from './pages/ShiftsPage.tsx';
import ExpensesPage from './pages/ExpensesPage.tsx';
import InvoicesPage from './pages/InvoicesPage.tsx';
import ProfitCalcPage from './pages/ProfitCalcPage.tsx';
import BarcodePage from './pages/BarcodePage.tsx';
import PriceTagsPage from './pages/PriceTagsPage.tsx';
import QrCodePage from './pages/QrCodePage.tsx';
import CurrencyCalcPage from './pages/CurrencyCalcPage.tsx';
import SellInvoicesPage from './pages/sellInvoices';
import WarehousesPage from './pages/WarehousesPage.tsx';
import StockTransfersPage from './pages/StockTransfersPage.tsx';
import SmartWarehousesPage from './pages/SmartWarehousesPage.tsx';
import IncomingOrdersPage from './pages/IncomingOrdersPage.tsx';
import PublicOrderPage from './pages/PublicOrderPage.tsx';
import MorningDecisionsPage from './pages/MorningDecisionsPage.tsx';
function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireGuest() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function RequireRole({ roles }: { roles: string[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [authBootstrapping, setAuthBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      if (!isAuthenticated) {
        if (!cancelled) setAuthBootstrapping(false);
        return;
      }

      if (!refreshToken) {
        clearAuth();
        if (!cancelled) setAuthBootstrapping(false);
        return;
      }

      try {
        const res = await authApi.refresh(refreshToken);
        const nextAccessToken = res.data.access_token;
        setAccessToken(nextAccessToken);
      } catch {
        clearAuth();
      } finally {
        if (!cancelled) setAuthBootstrapping(false);
      }
    };

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, refreshToken, setAccessToken, clearAuth]);

  if (authBootstrapping) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-page)' }}
        dir="rtl"
      >
        <div
          className="rounded-3xl px-6 py-5 text-sm font-black"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-heading)',
            border: '1px solid var(--border)',
          }}
        >
          جاري تهيئة الجلسة...
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route path="/order" element={<PublicOrderPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route element={<RequireRole roles={['admin', 'manager']} />}>
            <Route path="/morning-decisions" element={<MorningDecisionsPage />} />
            <Route path="/users" element={<UsersPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager', 'warehouse']} />}>
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/warehouses" element={<WarehousesPage />} />
            <Route path="/stock-transfers" element={<StockTransfersPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager', 'cashier']} />}>
            <Route path="/pos" element={<POSPage />} />
            <Route path="/incoming-orders" element={<IncomingOrdersPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager', 'warehouse']} />}>
            <Route path="/purchases" element={<PurchasesPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager', 'cashier']} />}>
            <Route path="/returns" element={<ReturnsPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager', 'warehouse']} />}>
            <Route path="/suppliers" element={<SuppliersPage />} />
          </Route>
          <Route element={<RequireRole roles={['admin', 'manager', 'warehouse']} />}>
            <Route path="/sellInvoices" element={<SellInvoicesPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager', 'cashier']} />}>
            <Route path="/customers" element={<CustomersPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager']} />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager']} />}>
            <Route path="/audit-logs" element={<AuditLogPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="/shifts" element={<ShiftsPage />} />

          <Route element={<RequireRole roles={['admin', 'manager']} />}>
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/profit-calc" element={<ProfitCalcPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'manager', 'warehouse']} />}>
            <Route path="/barcodes" element={<BarcodePage />} />
            <Route path="/price-tags" element={<PriceTagsPage />} />
          </Route>
          <Route element={<RequireRole roles={['admin', 'manager', 'warehouse']} />}>
            <Route path="/smart-warehouses" element={<SmartWarehousesPage />} />
          </Route>

          <Route path="/qr-codes" element={<QrCodePage />} />
          <Route path="/currency-calc" element={<CurrencyCalcPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}