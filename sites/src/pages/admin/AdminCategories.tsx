import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Pencil, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "@/lib/api";
import type { Category, FileMeta } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/shop/EmptyState";
import ProductImage from "@/components/shop/ProductImage";

interface CategoryForm {
  name: string;
  description: string;
  order: string;
  active: boolean;
  image_file_id: string | null;
}

const EMPTY_FORM: CategoryForm = { name: "", description: "", order: "0", active: true, image_file_id: null };

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => apiGet<Category[]>("/admin/categories"),
    retry: false,
  });
  const categories = categoriesQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    await queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      description: cat.description,
      order: String(cat.order),
      active: cat.active,
      image_file_id: cat.image_file_id,
    });
    setOpen(true);
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiPostForm<FileMeta>("/files/upload", fd);
    },
    onSuccess: (meta) => {
      setForm((prev) => ({ ...prev, image_file_id: meta.id }));
      toast.success("Imagem enviada");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        order: Number(form.order || 0),
        active: form.active,
        image_file_id: form.image_file_id || null,
      };
      return editing
        ? apiPatch<Category>(`/admin/categories/${editing.id}`, payload)
        : apiPost<Category>("/admin/categories", payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Categoria atualizada" : "Categoria criada");
      setOpen(false);
      await refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const toggleActive = useMutation({
    mutationFn: (cat: Category) => apiPatch<Category>(`/admin/categories/${cat.id}`, { active: !cat.active }),
    onSuccess: async () => {
      toast.success("Status atualizado");
      await refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (cat: Category) => apiDelete(`/admin/categories/${cat.id}`),
    onSuccess: async () => {
      toast.success("Categoria excluída");
      await refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="admin-categories-page" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Organização</p>
          <h1 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight text-white">
            Categorias
          </h1>
        </div>
        <Button
          type="button"
          data-testid="admin-new-category-button"
          onClick={openCreate}
          className="gap-2 bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
        >
          <Plus className="h-4 w-4" /> Nova categoria
        </Button>
      </div>

      {categoriesQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[#151515]" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          testId="admin-categories-empty"
          icon={Tags}
          title="Nenhuma categoria cadastrada"
          description="Crie as categorias que organizam a vitrine (Camisas, Moletons, Tênis…)."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Nova categoria
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
          <Table data-testid="admin-categories-table">
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Ordem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id} data-testid={`admin-category-row-${cat.slug}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-14 shrink-0 overflow-hidden rounded-md border border-[#242424]">
                        <ProductImage fileId={cat.image_file_id} name={cat.name} />
                      </div>
                      <div>
                        <p className="font-semibold text-white">{cat.name}</p>
                        <p className="max-w-xs truncate text-xs text-[#BDBDBD]">{cat.description || "—"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#BDBDBD]">{cat.slug}</TableCell>
                  <TableCell className="text-sm text-white">{cat.order}</TableCell>
                  <TableCell>
                    {cat.active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400">Ativa</Badge>
                    ) : (
                      <Badge variant="secondary">Inativa</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        data-testid={`admin-category-edit-${cat.id}`}
                        onClick={() => openEdit(cat)}
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        type="button"
                        data-testid={`admin-category-toggle-${cat.id}`}
                        onClick={() => toggleActive.mutate(cat)}
                        variant="outline"
                        size="sm"
                      >
                        {cat.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        type="button"
                        data-testid={`admin-category-delete-${cat.id}`}
                        onClick={() => remove.mutate(cat)}
                        variant="outline"
                        size="sm"
                        className="hover:border-[#DC2626] hover:text-[#DC2626]"
                      >
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-[#242424] bg-[#151515] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold text-white">
              {editing ? `Editar categoria — ${editing.name}` : "Nova categoria"}
            </DialogTitle>
          </DialogHeader>
          <form
            data-testid="category-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.name.trim()) {
                toast.error("Informe o nome da categoria.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="category-name">Nome</Label>
              <Input
                id="category-name"
                data-testid="category-name-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Camisas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-description">Descrição</Label>
              <Input
                id="category-description"
                data-testid="category-description-input"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Caimento premium e tecidos técnicos"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-order">Ordem de exibição</Label>
              <Input
                id="category-order"
                data-testid="category-order-input"
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-image">Imagem (opcional)</Label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-20 overflow-hidden rounded-lg border border-[#242424] bg-[#0B0B0B]">
                  {form.image_file_id ? (
                    <img src={`/api/files/${form.image_file_id}`} alt="Pré-visualização" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-[#BDBDBD]">
                      Sem imagem
                    </div>
                  )}
                </div>
                <Input
                  id="category-image"
                  data-testid="category-image-input"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload.mutate(file);
                  }}
                  className="w-56 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-[#DAA520] file:px-3 file:py-1 file:text-xs file:font-bold file:text-[#0B0B0B]"
                />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-[#BDBDBD]">
                <ImagePlus className="h-3.5 w-3.5" /> JPG, PNG, WEBP ou GIF — máx. 8 MB
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="category-active"
                data-testid="category-active-checkbox"
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked === true }))}
              />
              <Label htmlFor="category-active" className="cursor-pointer">
                Categoria ativa
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                data-testid="category-form-submit"
                disabled={save.isPending || upload.isPending}
                className="bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
              >
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}