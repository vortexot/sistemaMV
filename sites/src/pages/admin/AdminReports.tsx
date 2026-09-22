import { useQuery } from "@tanstack/react-query";
import { BarChart3, TriangleAlert, TrendingUp, Users } from "lucide-react";

import { apiErrorMessage, apiGet } from "@/lib/api";
import { brl } from "@/lib/format";
import type { ReportData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/shop/EmptyState";

export default function AdminReports() {
  const query = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: () => apiGet<import("@/lib/types").ReportData>("/admin/reports"),
    retry: false,
  });
  const data = query.data;

  const kpis = [
    { label: "Pedidos", value: data ? String(data.pedidos_total) : "—", testId: "report-orders-total" },
    {
      label: "Vendas aprovadas",
      value: data ? brl(data.vendas_total) : "—",
      testId: "report-sales-total",
    },
    {
      label: "Ticket médio",
      value: data ? (data.ticket_medio !== null ? brl(data.ticket_medio) : "—") : "—",
      testId: "report-ticket-average",
    },
    { label: "Clientes cadastrados", value: data ? String(data.clientes_cadastrados) : "—", testId: "report-customers-total" },
  ];

  return (
    <div data-testid="admin-reports-page" className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Inteligência</p>
        <h1 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight text-white">
          Relatórios
        </h1>
        <p className="mt-1 text-sm text-[#BDBDBD]">
          Todos os números vêm de pedidos reais — nada é inventado nesta demonstração.
        </p>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-[#151515]" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="rounded-xl border border-[#242424] bg-[#151515] p-6 text-sm text-[#BDBDBD]">
          Não foi possível carregar os relatórios: {apiErrorMessage(query.error)}
        </p>
      ) : data ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi, index) => (
              <div
                key={kpi.testId}
                data-testid={kpi.testId}
                className="rounded-xl border border-[#242424] bg-[#151515] p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1E1A08]">
                    {index === 0 ? (
                      <BarChart3 className="h-5 w-5 text-[#DAA520]" />
                    ) : index === 1 ? (
                      <TrendingUp className="h-5 w-5 text-[#DAA520]" />
                    ) : index === 2 ? (
                      <BarChart3 className="h-5 w-5 text-[#DAA520]" />
                    ) : (
                      <Users className="h-5 w-5 text-[#DAA520]" />
                    )}
                  </span>
                  <span className="font-heading text-2xl font-black text-white">{kpi.value}</span>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#BDBDBD]">
                  {kpi.label}
                </p>
              </div>
            ))}
          </div>

          {data.pedidos_total === 0 && (
            <EmptyState
              testId="reports-empty"
              icon={BarChart3}
              title="Sem pedidos reais ainda"
              description="Os relatórios de vendas, ticket médio e produtos mais vendidos aparecem assim que os primeiros pedidos reais forem registrados. Enquanto isso, nada é inventado aqui."
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
              <h2 className="border-b border-[#242424] p-4 font-heading text-lg font-bold text-white">
                Produtos mais vendidos
              </h2>
              {data.produtos_mais_vendidos.length === 0 ? (
                <p className="p-4 text-sm text-[#BDBDBD]">
                  Aparece quando os primeiros pedidos forem registrados.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Vendidos</TableHead>
                      <TableHead>Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.produtos_mais_vendidos.map((product) => (
                      <TableRow key={product.product_id}>
                        <TableCell className="text-white">{product.name}</TableCell>
                        <TableCell className="font-bold text-[#DAA520]">{product.qty}</TableCell>
                        <TableCell className="text-white">{brl(product.receita)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
              <h2 className="border-b border-[#242424] p-4 font-heading text-lg font-bold text-white">
                Pedidos por status
              </h2>
              {data.pedidos_por_status.length === 0 ? (
                <p className="p-4 text-sm text-[#BDBDBD]">Nenhum pedido registrado ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-2 p-4">
                  {data.pedidos_por_status.map((entry) => (
                    <Badge key={entry.status} variant="outline">
                      {entry.label}: {entry.count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
            <h2 className="flex items-center gap-2 border-b border-[#242424] p-4 font-heading text-lg font-bold text-white">
              <TriangleAlert className="h-4 w-4 text-[#DAA520]" /> Estoque baixo
            </h2>
            {data.estoque_baixo.length === 0 ? (
              <p className="p-4 text-sm text-[#BDBDBD]">Nenhum produto com estoque baixo.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Estoque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.estoque_baixo.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-white">{item.name}</TableCell>
                      <TableCell className="font-mono text-xs text-[#BDBDBD]">{item.sku}</TableCell>
                      <TableCell
                        className={item.stock === 0 ? "font-bold text-red-400" : "font-bold text-amber-300"}
                      >
                        {item.stock} un.
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}