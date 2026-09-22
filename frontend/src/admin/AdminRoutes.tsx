import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("@/pages/admin/AdminProducts"));
const AdminCategories = lazy(() => import("@/pages/admin/AdminCategories"));
const IndoorDisplay = lazy(() => import("@/pages/admin/IndoorDisplay"));
const AdminBanners = lazy(() => import("@/pages/admin/AdminBanners"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminCustomers = lazy(() => import("@/pages/admin/AdminCustomers"));
const AdminStock = lazy(() => import("@/pages/admin/AdminStock"));
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="midia-indoor/tv" element={<IndoorDisplay />} />
      <Route element={<AdminLayout />}>
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
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
