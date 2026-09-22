import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPatch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ROLE_LABELS, type Customer, type Role } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/shop/EmptyState";

const ROLES: Role[] = ["admin", "atendente", "comprador"];

export default function AdminCustomers() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const customersQuery = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: () => apiGet<Customer[]>("/admin/customers"),
    retry: false,
  });
  const customers = customersQuery.data ?? [];
  const isAdmin = user?.role === "admin";

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      apiPatch<Customer>(`/admin/customers/${id}`, { role }),
    onSuccess: async () => {
      toast.success("Perfil atualizado");
      await queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="admin-customers-page" className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Pessoas</p>
        <h1 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight text-white">
          Clientes
        </h1>
        <p className="mt-1 text-sm text-[#BDBDBD]">
          Senhas e hashes nunca são exibidos — apenas dados de conta.
        </p>
      </div>

      {customersQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[#151515]" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          testId="admin-customers-empty"
          icon={Users}
          title="Nenhum cliente cadastrado"
          description="Clientes aparecem aqui após o primeiro cadastro na loja."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
          <Table data-testid="admin-customers-table">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Data de cadastro</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} data-testid={`admin-customer-row-${customer.email}`}>
                  <TableCell className="font-medium text-white">{customer.name}</TableCell>
                  <TableCell className="text-sm text-[#BDBDBD]">{customer.email}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={customer.role}
                        onValueChange={(value: string) =>
                          roleMutation.mutate({ id: customer.id, role: value as Role })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          data-testid={`customer-role-select-${customer.id}`}
                          className="w-40"
                        >
                          <SelectValue>{(v) => ROLE_LABELS[v as string] ?? v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="border-[#242424] bg-[#151515]">
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABELS[customer.role]}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-[#BDBDBD]">{formatDate(customer.created_at)}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        customer.status === "ativo"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }
                    >
                      {customer.status === "ativo" ? "Ativo" : "Bloqueado"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}