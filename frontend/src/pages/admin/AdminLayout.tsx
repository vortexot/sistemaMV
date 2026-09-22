import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingBag,
  Tags,
  Users,
} from "lucide-react";

import { endSession, useSession } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PageTransition from "@/components/layout/PageTransition";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Package;
  key: string;
  roles: Role[];
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, key: "dashboard", roles: ["admin", "atendente"], end: true },
  { to: "/admin/produtos", label: "Produtos", icon: Package, key: "products", roles: ["admin"] },
  { to: "/admin/categorias", label: "Categorias", icon: Tags, key: "categories", roles: ["admin"] },
  { to: "/admin/midia-indoor", label: "Mídia Indoor", icon: ImageIcon, key: "banners", roles: ["admin"] },
  { to: "/admin/midia-indoor/tv", label: "TV da loja", icon: ImageIcon, key: "indoor-tv", roles: ["admin", "atendente"] },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag, key: "orders", roles: ["admin", "atendente"] },
  { to: "/admin/clientes", label: "Clientes", icon: Users, key: "customers", roles: ["admin", "atendente"] },
  { to: "/admin/estoque", label: "Estoque", icon: Boxes, key: "stock", roles: ["admin", "atendente"] },
  { to: "/admin/relatorios", label: "Relatórios", icon: BarChart3, key: "reports", roles: ["admin", "atendente"] },
];

function BrandBlock() {
  return (
    <Link to="/admin" data-testid="admin-logo" className="flex items-center gap-3">
      <img
        src="/mv-logo.jpg"
        alt="MV Multimarcas"
        width={150}
        height={150}
        className="h-11 w-11 shrink-0 rounded-lg border border-[#DAA520]/30 object-cover"
      />
      <span className="flex flex-col leading-none">
        <span className="font-heading text-sm font-extrabold uppercase tracking-[0.2em] text-white">
          MV
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#DAA520]">
          Admin
        </span>
      </span>
    </Link>
  );
}

export default function AdminLayout() {
  const { user, isLoading } = useSession();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div
        data-testid="admin-loading"
        className="flex min-h-svh items-center justify-center bg-[#0B0B0B] text-sm text-[#BDBDBD]"
      >
        Carregando painel…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "comprador") return <Navigate to="/dashboard" replace />;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const handleLogout = async () => {
    await endSession();
    navigate("/login");
  };

  return (
    <div data-testid="admin-page" className="min-h-svh bg-[#0B0B0B] text-white">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col justify-between border-r border-[#1F1F1F] bg-[#0D0D0D] p-4 lg:flex">
        <div>
          <BrandBlock />
          <nav className="mt-8 space-y-1" data-testid="admin-nav">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={`admin-nav-${item.key}`}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "border-l-2 border-[#DAA520] bg-[#1E1A08] text-[#DAA520]"
                      : "text-[#8E8E8E] hover:bg-[#151515] hover:text-white",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="space-y-3 border-t border-[#1F1F1F] pt-4">
          <div className="flex items-center gap-3 rounded-lg bg-[#151515] px-3 py-2.5" data-testid="admin-user-chip">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DAA520] text-sm font-bold text-[#0B0B0B]">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-[#DAA520]">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <Button
            type="button"
            data-testid="admin-logout"
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start gap-2 text-[#8E8E8E] hover:bg-[#242424] hover:text-[#DC2626]"
          >
            <LogOut className="h-4 w-4" /> Sair
          </Button>
          <Link
            to="/"
            className="block px-3 text-xs text-[#BDBDBD] transition-colors hover:text-[#DAA520]"
          >
            ← Ver loja
          </Link>
        </div>
      </aside>

      {/* barra superior mobile com navegação horizontal */}
      <div className="sticky top-0 z-40 border-b border-[#1F1F1F] bg-[#0D0D0D] lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <BrandBlock />
          <Button
            type="button"
            data-testid="admin-logout-mobile"
            onClick={handleLogout}
            variant="ghost"
            size="icon"
            aria-label="Sair"
            className="min-h-10 min-w-10 text-[#8E8E8E]"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3" data-testid="admin-nav-mobile">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`admin-nav-mobile-${item.key}`}
              className={({ isActive }) =>
                cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  isActive
                    ? "border-[#DAA520] bg-[#1E1A08] text-[#DAA520]"
                    : "border-[#242424] bg-[#151515] text-[#8E8E8E]",
                )
              }
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl p-4 sm:p-8">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
    </div>
  );
}
