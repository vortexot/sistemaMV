import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageOpen, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPatch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type Order } from "@/lib/types";
import { brl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/shop/EmptyState";

const STATUS_BADGE: Record<string, string> = {
  aguardando_pagamento: "bg-amber-400/15 text-amber-300",
  aprovado: "bg-emerald-500/15 text-emerald-400",
  preparando: "bg-sky-500/15 text-sky-400",
  enviado: "bg-sky-500/15 text-sky-400",
  em_transito: "bg-sky-500/15 text-sky-400",
  entregue: "bg-emerald-500/15 text-emerald-400",
  cancelado: "bg-red-500/15 text-red-400",
};

export default function AdminOrders() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => apiGet<Order[]>("/admin/orders"),
    retry: false,
  });
  const orders = ordersQuery.data ?? [];
  const isAdmin = user?.role === "admin";

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<Order>(`/admin/orders/${id}`, { status }),
    onSuccess: async () => {
      toast.success("Status do pedido atualizado");
      await queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="admin-orders-page" className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Operação</p>
        <h1 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight text-white">
          Pedidos
        </h1>
        <p className="mt-1 text-sm text-[#BDBDBD]">
          Pedidos reais criados somente após aprovação de pagamento — nada é simulado.
        </p>
      </div>

      {ordersQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[#151515]" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          testId="orders-empty"
          icon={PackageOpen}
          title="Nenhum pedido ainda"
          description="Quando um pagamento real for aprovado, o pedido aparece aqui com número, cliente, valor, status, data, forma de pagamento e produtos."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
          <Table data-testid="admin-orders-table">
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Produtos</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id} data-testid={`admin-order-row-${order.number}`}>
                  <TableCell className="font-bold text-white">{order.number}</TableCell>
                  <TableCell>
                    <p className="font-medium text-white">{order.customer_name}</p>
                    <p className="text-xs text-[#BDBDBD]">{order.customer_email}</p>
                  </TableCell>
                  <TableCell className="font-bold text-[#DAA520]">{brl(order.total)}</TableCell>
                  <TableCell className="text-sm text-[#BDBDBD]">{formatDateTime(order.created_at)}</TableCell>
                  <TableCell className="text-sm text-[#BDBDBD]">
                    {order.payment_method ? `PayPal (${order.payment_status})` : "—"}
                  </TableCell>
                  <TableCell className="max-w-52">
                    <p className="truncate text-sm text-[#BDBDBD]" title={order.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}>
                      {order.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                    </p>
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={order.status}
                        onValueChange={(value: string) => statusMutation.mutate({ id: order.id, status: value })}
                      >
                        <SelectTrigger
                          size="sm"
                          data-testid={`order-status-select-${order.number}`}
                          className="w-44"
                        >
                          <SelectValue>{(v) => ORDER_STATUS_LABELS[v as string] ?? v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="border-[#242424] bg-[#151515]">
                          {ORDER_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {ORDER_STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={STATUS_BADGE[order.status] ?? "bg-[#242424] text-white"}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap gap-2" data-testid="orders-status-legend">
        {ORDER_STATUSES.map((status) => (
          <span
            key={status}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${STATUS_BADGE[status] ?? "bg-[#242424] text-white"}`}
          >
            {ORDER_STATUS_LABELS[status]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 rounded-full bg-[#242424] px-3 py-1 text-[11px] text-[#BDBDBD]">
          <ShoppingBag className="h-3 w-3" /> Fluxo completo de fulfillment
        </span>
      </div>
    </div>
  );
}