import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Boxes, LayoutDashboard, Package, ShoppingBag, TriangleAlert, Users } from "lucide-react";

import { apiErrorMessage, apiGet } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { DashboardData, LowStockItem } from "@/lib/types";
import EmptyState from "@/components/shop/EmptyState";

interface KpiCardProps {
  label: string;
  value: number;
  icon: typeof Package;
  testId: string;
  tone?: "gold" | "plain";
  index: number;
}

function KpiCard({ label, value, icon: Icon, testId, tone = "plain", index }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
      data-testid={testId}
      className="rounded-xl border border-[#242424] bg-[#151515] p-5"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1E1A08]">
          <Icon className="h-5 w-5 text-[#DAA520]" />
        </span>
        <span
          className={`font-heading text-3xl font-black ${tone === "gold" ? "text-[#DAA520]" : "text-white"}`}
          data-testid={`${testId}-value`}
        >
          {value}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#BDBDBD]">{label}</p>
    </motion.div>
  );
}

export default function AdminDashboard() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => apiGet<DashboardData>("/admin/dashboard"),
    retry: false,
  });

  const data = query.data;

  return (
    <div data-testid="admin-dashboard-page" className="min-w-0 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">
          Painel administrativo
        </p>
        <h1
          data-testid="admin-welcome"
          className="mt-2 font-heading text-3xl font-black uppercase tracking-tight text-white"
        >
          {data ? data.welcome : `Bem-vindo, ${user?.name.split(" ")[0] ?? ""}`}
        </h1>
        <p data-testid="admin-resumo" className="mt-2 max-w-3xl text-sm leading-relaxed text-[#BDBDBD]">
          {data ? data.resumo : "Carregando o resumo operacional…"}
        </p>
      </div>

      {query.isError ? (
        <EmptyState
          testId="admin-dashboard-error"
          icon={TriangleAlert}
          title="Não foi possível carregar o painel"
          description={apiErrorMessage(query.error)}
        />
      ) : !data ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-[#151515]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Produtos ativos" value={data.produtos_ativos} icon={Package} testId="kpi-products-active" index={0} tone="gold" />
            <KpiCard label="Clientes" value={data.clientes} icon={Users} testId="kpi-customers" index={1} />
            <KpiCard label="Pedidos" value={data.pedidos} icon={ShoppingBag} testId="kpi-orders" index={2} />
            <KpiCard label="Estoque baixo" value={data.estoque_baixo} icon={TriangleAlert} testId="kpi-low-stock" index={3} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-[#242424] bg-[#151515] p-6">
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-white">
                <Boxes className="h-4 w-4 text-[#DAA520]" /> Reposição sugerida
              </h2>
              {data.low_stock.length === 0 ? (
                <p data-testid="admin-low-stock-empty" className="mt-4 text-sm text-[#BDBDBD]">
                  Nenhum produto com estoque baixo. Operação saudável.
                </p>
              ) : (
                <ul className="mt-4 space-y-2" data-testid="admin-low-stock-list">
                  {data.low_stock.map((item: LowStockItem) => (
                    <li
                      key={item.id}
                      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[#0B0B0B] px-4 py-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-white">{item.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.stock === 0
                            ? "bg-red-500/15 text-red-400"
                            : "bg-amber-400/15 text-amber-300"
                        }`}
                      >
                        {item.stock} un.
                      </span>
                      <span className="order-3 w-full break-all text-xs text-[#BDBDBD] sm:order-none sm:w-auto sm:shrink-0">{item.sku}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-[#242424] bg-[#151515] p-6">
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-white">
                <LayoutDashboard className="h-4 w-4 text-[#DAA520]" /> Resumo operacional
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#BDBDBD]">{data.resumo}</p>
              <p className="mt-4 rounded-lg border border-[#DAA520]/25 bg-[#1E1A08]/50 p-4 text-sm text-[#DAA520]">
                {data.produtos_sem_estoque > 0
                  ? `${data.produtos_sem_estoque} produto(s) sem estoque precisam de atenção imediata.`
                  : "Todo o catálogo ativo tem estoque disponível."}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
