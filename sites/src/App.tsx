import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { MotionConfig } from "motion/react";
import { CartProvider } from "@/lib/cart";
import PublicLayout from "@/components/layout/PublicLayout";
import Shop from "@/pages/Shop";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/NotFound";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCategories from "@/pages/admin/AdminCategories";
import IndoorDisplay from "@/pages/admin/IndoorDisplay";
import AdminBanners from "@/pages/admin/AdminBanners";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminStock from "@/pages/admin/AdminStock";
import AdminReports from "@/pages/admin/AdminReports";

function AppShell() {
  const location = useLocation();
  // Google (Emergent) OAuth lands on any route with #session_id=... — the callback
  // must process the fragment BEFORE any session check runs.
  if (location.hash.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/midia-indoor" element={<Navigate to="/admin/midia-indoor/tv" replace />} />
      <Route path="/admin/midia-indoor/tv" element={<IndoorDisplay />} />
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Shop />} />
        <Route path="/carrinho" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="produtos" element={<AdminProducts />} />
        <Route path="categorias" element={<AdminCategories />} />
        <Route path="midia-indoor" element={<AdminBanners />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="pedidos" element={<AdminOrders />} />
        <Route path="clientes" element={<AdminCustomers />} />
        <Route path="estoque" element={<AdminStock />} />
        <Route path="relatorios" element={<AdminReports />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <CartProvider>
      <AppShell />
      <Toaster richColors theme="dark" position="bottom-right" />
    </CartProvider>
    </MotionConfig>
  );
}
