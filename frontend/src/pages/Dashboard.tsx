import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LogOut, PackageOpen, ShoppingBag, UserRound } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { endSession, useSession } from "@/lib/session";
import { brl, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, ROLE_LABELS, type CatalogProduct, type Order } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import EmptyState from "@/components/shop/EmptyState";
import ProductImage from "@/components/shop/ProductImage";

const STATUS_BADGE: Record<string, string> = {
  aguardando_pagamento: "bg-amber-400/15 text-amber-300",
  aprovado: "bg-emerald-500/15 text-emerald-400",
  preparando: "bg-sky-500/15 text-sky-400",
  enviado: "bg-sky-500/15 text-sky-400",
  em_transito: "bg-sky-500/15 text-sky-400",
  entregue: "bg-emerald-500/15 text-emerald-400",
  cancelado: "bg-red-500/15 text-red-400",
};

export default function Dashboard() {
  const { user, isLoading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ["orders", "mine"],
    queryFn: () => apiGet<Order[]>("/orders/mine"),
    enabled: !!user,
    retry: false,
  });
  const favoritesQuery = useQuery({
    queryKey: ["favorites"],
    queryFn: () => apiGet<CatalogProduct[]>("/favorites"),
    enabled: !!user,
    retry: false,
  });

  const favoriteToggle = useMutation({
    mutationFn: (productId: string) =>
      apiPost<{ favorited: boolean }>(`/favorites/${productId}/toggle`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success("Favoritos atualizados");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  if (isLoading) {
    return (
      <div
        data-testid="dashboard-loading"
        className="flex min-h-[60svh] items-center justify-center text-sm text-[#BDBDBD]"
      >
        Carregando sua conta…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = async () => {
    await endSession();
    navigate("/login");
  };

  const orders = ordersQuery.data ?? [];
  const favorites = favoritesQuery.data ?? [];

  return (
    <div data-testid="dashboard-page" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">
        Minha conta
      </p>
      <h1 className="mt-2 font-heading text-3xl font-black uppercase tracking-tight text-white">
        Olá, {user.name.split(" ")[0]}.
      </h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* perfil */}
        <div className="rounded-xl border border-[#242424] bg-[#151515] p-6" data-testid="dashboard-profile">
          <div className="flex items-center gap-4">
            {user.picture ? (
              <img src={user.picture} alt={user.name} width={56} height={56} decoding="async" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DAA520] text-xl font-black text-[#0B0B0B]">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-bold text-white" data-testid="user-info-name">
                {user.name}
              </p>
              <p className="truncate text-sm text-[#BDBDBD]" data-testid="user-info-email">
                {user.email}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-2 text-sm text-[#BDBDBD]">
            <p className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-[#DAA520]" /> Perfil
              </span>
              <span className="font-semibold text-white" data-testid="user-info-role">
                {ROLE_LABELS[user.role]}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span>Cliente desde</span>
              <span className="text-white">{formatDate(user.created_at)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>Status</span>
              <span className={user.status === "ativo" ? "text-emerald-400" : "text-red-400"}>
                {user.status === "ativo" ? "Ativo" : "Bloqueado"}
              </span>
            </p>
          </div>
          <Button
            type="button"
            data-testid="dashboard-logout-button"
            onClick={handleLogout}
            variant="outline"
            className="mt-6 w-full gap-2 hover:border-[#DC2626] hover:text-[#DC2626]"
          >
            <LogOut className="h-4 w-4" /> Sair da conta
          </Button>
        </div>

        {/* ações rápidas */}
        <div className="rounded-xl border border-[#242424] bg-[#151515] p-6">
          <h2 className="font-heading text-lg font-bold text-white">Atalhos</h2>
          <div className="mt-4 space-y-3">
            <Link
              to="/carrinho"
              data-testid="dashboard-cart-link"
              className={`${buttonVariants({ variant: "outline" })} w-full justify-start gap-2`}
            >
              <ShoppingBag className="h-4 w-4 text-[#DAA520]" /> Abrir carrinho
            </Link>
            <Link
              to="/"
              className={`${buttonVariants({ variant: "outline" })} w-full justify-start gap-2`}
            >
              <Heart className="h-4 w-4 text-[#DAA520]" /> Explorar coleção
            </Link>
            {(user.role === "admin" || user.role === "atendente") && (
              <Link
                to="/admin"
                className={`${buttonVariants({ variant: "outline" })} w-full justify-start gap-2`}
              >
                <UserRound className="h-4 w-4 text-[#DAA520]" /> Painel administrativo
              </Link>
            )}
          </div>
          <div className="mt-5 rounded-lg border border-[#242424] bg-[#0B0B0B] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#BDBDBD]">Favoritos</p>
            <p className="mt-1 font-heading text-2xl font-black text-[#DAA520]" data-testid="dashboard-favorites-count">
              {favorites.length}
            </p>
          </div>
        </div>

        {/* pedidos */}
        <div className="rounded-xl border border-[#242424] bg-[#151515] p-6 lg:col-span-1">
          <h2 className="font-heading text-lg font-bold text-white">Meus pedidos</h2>
          {ordersQuery.isLoading ? (
            <div className="mt-4 space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#242424]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-[#242424]" />
            </div>
          ) : ordersQuery.isError ? (
            <p className="mt-4 text-sm text-[#BDBDBD]">
              Não foi possível carregar os pedidos agora.
            </p>
          ) : orders.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                testId="dashboard-orders-empty"
                icon={PackageOpen}
                title="Você ainda não realizou pedidos"
                description="Quando um pagamento real for aprovado, o histórico completo aparece aqui."
                className="py-8"
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {orders.map((order) => (
                <li
                  key={order.id}
                  data-testid={`dashboard-order-${order.number}`}
                  className="rounded-lg border border-[#242424] bg-[#0B0B0B] p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{order.number}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        STATUS_BADGE[order.status] ?? "bg-[#242424] text-white"
                      }`}
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#BDBDBD]">
                    {order.items.length} item(ns) · {formatDate(order.created_at)}
                  </p>
                  <p className="mt-1 font-bold text-[#DAA520]">{brl(order.total)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* favoritos */}
      <section className="mt-10">
        <h2 className="font-heading text-2xl font-extrabold uppercase tracking-tight text-white">
          Favoritos
        </h2>
        {favorites.length === 0 ? (
          <p className="mt-4 text-sm text-[#BDBDBD]">
            Toque no coração dos produtos na vitrine para salvá-los aqui.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {favorites.map((product) => (
              <div
                key={product.id}
                data-testid={`favorite-item-${product.id}`}
                className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]"
              >
                <div className="aspect-square">
                  <ProductImage fileId={product.image_file_id} name={product.name} />
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-bold text-white">{product.name}</p>
                  <p className="text-sm font-bold text-[#DAA520]">{brl(product.promo_price ?? product.price)}</p>
                  <Button
                    type="button"
                    data-testid={`favorite-remove-${product.id}`}
                    onClick={() => favoriteToggle.mutate(product.id)}
                    variant="outline"
                    size="xs"
                    className="w-full gap-1.5"
                  >
                    <Heart className="h-3 w-3 fill-[#DAA520] text-[#DAA520]" /> Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
