import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/lib/cart";
import PublicLayout from "@/components/layout/PublicLayout";
import Shop from "@/pages/Shop";
import SeoManager from "@/components/SeoManager";
import Analytics from "@/components/Analytics";

const CartPage = lazy(() => import("@/pages/CartPage"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const OrderConfirmation = lazy(() => import("@/pages/OrderConfirmation"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const AccountSecurity = lazy(() => import("@/pages/AccountSecurity"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const AdminRoutes = lazy(() => import("@/admin/AdminRoutes"));

function RouteFallback() {
  return <div role="status" className="flex min-h-[40svh] items-center justify-center bg-background text-sm text-muted-foreground">Carregando página…</div>;
}

function AppShell() {
  return (
    <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/midia-indoor" element={<Navigate to="/admin/midia-indoor/tv" replace />} />
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Shop />} />
            <Route path="/carrinho" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/pedido-confirmado" element={<OrderConfirmation />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/seguranca" element={<AccountSecurity />} />
          </Route>
          <Route path="/admin/*" element={<AdminRoutes />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <CartProvider>
      <SeoManager />
      <Analytics />
      <AppShell />
      <Toaster richColors theme="dark" position="bottom-right" />
    </CartProvider>
  );
}
