import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Save } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPatch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { STOCK_STATUS_LABELS, type StockRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/shop/EmptyState";

const STATUS_BADGE: Record<string, string> = {
  em_estoque: "bg-emerald-500/15 text-emerald-400",
  estoque_baixo: "bg-amber-400/15 text-amber-300",
  sem_estoque: "bg-red-500/15 text-red-400",
};

export default function AdminStock() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const stockQuery = useQuery({
    queryKey: ["admin", "stock"],
    queryFn: () => apiGet<StockRow[]>("/admin/stock"),
    retry: false,
  });
  const rows = stockQuery.data ?? [];
  const isAdmin = user?.role === "admin";
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const setStock = useMutation({
    mutationFn: ({ id, stock }: { id: string; stock: number }) =>
      apiPatch<StockRow>(`/admin/stock/${id}`, { stock }),
    onSuccess: async () => {
      toast.success("Estoque atualizado");
      await queryClient.invalidateQueries({ queryKey: ["admin", "stock"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const lowCount = rows.filter((r) => r.status === "estoque_baixo").length;
  const outCount = rows.filter((r) => r.status === "sem_estoque").length;

  return (
    <div data-testid="admin-stock-page" className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Operação</p>
        <h1 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight text-white">
          Estoque
        </h1>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="stock-legend">
          <Badge className="bg-emerald-500/15 text-emerald-400">Em estoque</Badge>
          <Badge className="bg-amber-400/15 text-amber-300">Estoque baixo (≤ 5)</Badge>
          <Badge className="bg-red-500/15 text-red-400">Sem estoque</Badge>
        </div>
      </div>

      {stockQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[#151515]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          testId="stock-empty"
          icon={Boxes}
          title="Nenhum produto no estoque"
          description="Cadastre produtos para acompanhar o inventário aqui."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
          <Table data-testid="admin-stock-table">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Estoque atual</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="text-right">Ajustar</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid={`stock-row-${row.sku}`}>
                  <TableCell>
                    <p className="font-medium text-white">{row.name}</p>
                    {row.archived && <p className="text-xs text-[#BDBDBD]">Arquivado</p>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#BDBDBD]">{row.sku}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Input
                        data-testid={`stock-qty-input-${row.id}`}
                        type="number"
                        min="0"
                        value={drafts[row.id] ?? String(row.stock)}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        className="w-24"
                      />
                    ) : (
                      <span className="font-bold text-white">{row.stock} un.</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[row.status]} data-testid={`stock-status-${row.id}`}>
                      {STOCK_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        data-testid={`stock-save-${row.id}`}
                        size="sm"
                        className="gap-1.5 bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
                        onClick={() => {
                          const value = Number(drafts[row.id] ?? row.stock);
                          if (Number.isNaN(value) || value < 0) {
                            toast.error("Informe um estoque válido.");
                            return;
                          }
                          setStock.mutate({ id: row.id, stock: value });
                        }}
                      >
                        <Save className="h-3.5 w-3.5" /> Salvar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-[#BDBDBD]">
          {lowCount} produto(s) com estoque baixo e {outCount} sem estoque.
        </p>
      )}
    </div>
  );
}