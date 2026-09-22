import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ImagePlus, PackageOpen, Pencil, Plus, Star, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPatch, apiPost, apiPostForm } from "@/lib/api";
import { brl } from "@/lib/format";
import { TAG_LABELS, type Category, type FileMeta, type Product } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import EmptyState from "@/components/shop/EmptyState";
import ProductImage from "@/components/shop/ProductImage";

const TAG_STYLES: Record<string, string> = {
  novo: "bg-[#DAA520] text-[#0B0B0B]",
  oferta: "bg-[#DC2626] text-white",
  mais_vendido: "bg-[#A07C1B] text-[#0B0B0B]",
};

interface FormState {
  name: string;
  sku: string;
  brand: string;
  category_id: string;
  price: string;
  promo_price: string;
  stock: string;
  sizes: string;
  colors: string;
  description: string;
  tag: string;
  featured: boolean;
  active: boolean;
  image_file_id: string | null;
}

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  brand: "MV Multimarcas",
  category_id: "",
  price: "",
  promo_price: "",
  stock: "0",
  sizes: "",
  colors: "",
  description: "",
  tag: "none",
  featured: false,
  active: true,
  image_file_id: null,
};

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => apiGet<Product[]>("/admin/products"),
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => apiGet<Category[]>("/admin/categories"),
    retry: false,
  });
  const categories = categoriesQuery.data ?? [];
  const products = productsQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? "" });
    setOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      category_id: product.category_id,
      price: String(product.price),
      promo_price: product.promo_price ? String(product.promo_price) : "",
      stock: String(product.stock),
      sizes: product.sizes.join(", "),
      colors: product.colors.join(", "),
      description: product.description,
      tag: product.tag ?? "none",
      featured: product.featured,
      active: product.active,
      image_file_id: product.image_file_id,
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
      set("image_file_id", meta.id);
      toast.success("Imagem enviada — ela já aparece no card da vitrine");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const save = useMutation({
    mutationFn: () => {
      const price = Number(form.price.replace(",", "."));
      const promo = form.promo_price ? Number(form.promo_price.replace(",", ".")) : null;
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        brand: form.brand.trim(),
        category_id: form.category_id,
        price,
        promo_price: promo,
        stock: Number(form.stock || 0),
        sizes: form.sizes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        colors: form.colors
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        description: form.description,
        tag: form.tag === "none" ? null : form.tag,
        featured: form.featured,
        active: form.active,
        image_file_id: form.image_file_id || null,
      };
      return editing
        ? apiPatch<Product>(`/admin/products/${editing.id}`, payload)
        : apiPost<Product>("/admin/products", payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Produto atualizado — vitrine em sincronia" : "Produto criado — já disponível na vitrine");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: (product: Product) =>
      apiPatch<Product>(`/admin/products/${product.id}`, { archived: !product.archived }),
    onSuccess: async (product) => {
      toast.success(product.archived ? "Produto arquivado" : "Produto reativado na vitrine");
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleSubmit = () => {
    const price = Number(form.price.replace(",", "."));
    if (!form.name.trim() || !form.sku.trim() || !form.brand.trim() || !form.category_id) {
      toast.error("Preencha nome, SKU, marca e categoria.");
      return;
    }
    if (!form.price || Number.isNaN(price) || price < 0) {
      toast.error("Informe um preço válido.");
      return;
    }
    if (form.promo_price) {
      const promo = Number(form.promo_price.replace(",", "."));
      if (Number.isNaN(promo) || promo >= price) {
        toast.error("O preço promocional deve ser menor que o preço.");
        return;
      }
    }
    save.mutate();
  };

  return (
    <div data-testid="admin-products-page" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Catálogo</p>
          <h1 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight text-white">
            Produtos
          </h1>
        </div>
        <Button
          type="button"
          data-testid="admin-new-product-button"
          onClick={openCreate}
          className="gap-2 bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
        >
          <Plus className="h-4 w-4" /> Novo produto
        </Button>
      </div>

      {productsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[#151515]" />
          ))}
        </div>
      ) : productsQuery.isError ? (
        <p className="rounded-xl border border-[#242424] bg-[#151515] p-6 text-sm text-[#BDBDBD]">
          Não foi possível carregar os produtos: {apiErrorMessage(productsQuery.error)}
        </p>
      ) : products.length === 0 ? (
        <EmptyState
          testId="admin-products-empty"
          icon={PackageOpen}
          title="Nenhum produto cadastrado"
          description="Crie o primeiro produto da coleção — ele aparece automaticamente na vitrine pública."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Novo produto
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
          <Table data-testid="admin-products-table">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id} data-testid={`admin-product-row-${product.sku}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md border border-[#242424]">
                        <ProductImage fileId={product.image_file_id} name={product.name} />
                      </div>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-white">
                          {product.name}
                          {product.featured && <Star className="h-3.5 w-3.5 fill-[#DAA520] text-[#DAA520]" />}
                        </p>
                        <p className="text-xs text-[#BDBDBD]">{product.sku} · {product.brand}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[#BDBDBD]">{product.category_name}</TableCell>
                  <TableCell>
                    <span className="font-bold text-[#DAA520]">{brl(product.promo_price ?? product.price)}</span>
                    {product.promo_price && (
                      <span className="block text-xs text-[#BDBDBD] line-through">{brl(product.price)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        product.stock === 0
                          ? "font-bold text-red-400"
                          : product.stock <= 5
                            ? "font-bold text-amber-300"
                            : "text-white"
                      }
                    >
                      {product.stock} un.
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {product.archived ? (
                        <Badge variant="secondary">Arquivado</Badge>
                      ) : product.active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-400">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                      {product.tag && (
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TAG_STYLES[product.tag] ?? "bg-[#242424] text-white"}`}>
                          {TAG_LABELS[product.tag] ?? product.tag}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        data-testid={`admin-product-edit-${product.id}`}
                        onClick={() => openEdit(product)}
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        type="button"
                        data-testid={`admin-product-archive-${product.id}`}
                        onClick={() => archive.mutate(product)}
                        disabled={archive.isPending}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 hover:border-[#DAA520] hover:text-[#DAA520]"
                      >
                        {product.archived ? (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5" /> Reativar
                          </>
                        ) : (
                          <>
                            <Archive className="h-3.5 w-3.5" /> Arquivar
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto border-[#242424] bg-[#151515] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold text-white">
              {editing ? `Editar produto — ${editing.sku}` : "Novo produto"}
            </DialogTitle>
            <p className="text-sm text-[#BDBDBD]">
              Campos obrigatórios: nome, SKU, marca, categoria e preço. A imagem aparece
              automaticamente na vitrine.
            </p>
          </DialogHeader>

          <form
            data-testid="product-form"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Nome</Label>
              <Input
                id="product-name"
                data-testid="product-name-input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Camisa Golden Velocity Pro"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-sku">SKU</Label>
              <Input
                id="product-sku"
                data-testid="product-sku-input"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="GS-CAM-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-brand">Marca</Label>
              <Input
                id="product-brand"
                data-testid="product-brand-input"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-category">Categoria</Label>
              <Select value={form.category_id} onValueChange={(value: string) => set("category_id", value)}>
                <SelectTrigger id="product-category" data-testid="product-category-select">
                  <SelectValue>
                    {(v) => categories.find((c) => c.id === (v as string))?.name ?? "Selecione a categoria"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="border-[#242424] bg-[#151515]">
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-price">Preço (R$)</Label>
              <Input
                id="product-price"
                data-testid="product-price-input"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="189.90"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-promo">Preço promocional (opcional)</Label>
              <Input
                id="product-promo"
                data-testid="product-promo-price-input"
                type="number"
                min="0"
                step="0.01"
                value={form.promo_price}
                onChange={(e) => set("promo_price", e.target.value)}
                placeholder="149.90"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-stock">Estoque</Label>
              <Input
                id="product-stock"
                data-testid="product-stock-input"
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => set("stock", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-tag">Etiqueta</Label>
              <Select value={form.tag || "none"} onValueChange={(value: string) => set("tag", value)}>
                <SelectTrigger id="product-tag" data-testid="product-tag-select">
                  <SelectValue>
                    {(v) => ((v as string) === "none" ? "Sem etiqueta" : (TAG_LABELS[v as string] ?? "Sem etiqueta"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="border-[#242424] bg-[#151515]">
                  <SelectItem value="none">Sem etiqueta</SelectItem>
                  <SelectItem value="novo">NOVO</SelectItem>
                  <SelectItem value="oferta">OFERTA</SelectItem>
                  <SelectItem value="mais_vendido">MAIS VENDIDO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-sizes">Tamanhos (separados por vírgula)</Label>
              <Input
                id="product-sizes"
                data-testid="product-sizes-input"
                value={form.sizes}
                onChange={(e) => set("sizes", e.target.value)}
                placeholder="P, M, G, GG"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-colors">Cores (separadas por vírgula)</Label>
              <Input
                id="product-colors"
                data-testid="product-colors-input"
                value={form.colors}
                onChange={(e) => set("colors", e.target.value)}
                placeholder="Preto, Dourado"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="product-description">Descrição</Label>
              <textarea
                id="product-description"
                data-testid="product-description-input"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                className="flex w-full rounded-lg border border-[#242424] bg-[#0B0B0B] px-3 py-2 text-sm text-white placeholder:text-[#BDBDBD]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DAA520]"
                placeholder="Tecidos, caimento, detalhes dourados…"
              />
            </div>

            <div className="space-y-3 sm:col-span-2">
              <Label htmlFor="product-image">Imagem principal (JPG, PNG, WEBP ou GIF — máx. 8 MB)</Label>
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-24 w-20 overflow-hidden rounded-lg border border-[#242424] bg-[#0B0B0B]">
                  {form.image_file_id ? (
                    <img
                      src={`/api/files/${form.image_file_id}`}
                      alt="Pré-visualização da imagem"
                      className="h-full w-full object-cover"
                      data-testid="product-image-preview"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-[#BDBDBD]">
                      Sem imagem
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    id="product-image"
                    data-testid="product-image-input"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) upload.mutate(file);
                    }}
                    className="w-64 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-[#DAA520] file:px-3 file:py-1 file:text-xs file:font-bold file:text-[#0B0B0B]"
                  />
                  <p className="text-xs text-[#BDBDBD]">
                    <ImagePlus className="mr-1 inline h-3.5 w-3.5" />
                    Enviado via object storage do backend, servido em /api/files/&#123;file_id&#125;
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:col-span-1">
              <Checkbox
                id="product-featured"
                data-testid="product-featured-checkbox"
                checked={form.featured}
                onCheckedChange={(checked) => set("featured", checked === true)}
              />
              <Label htmlFor="product-featured" className="cursor-pointer">
                Produto em destaque
              </Label>
            </div>
            <div className="flex items-center gap-2 sm:col-span-1">
              <Checkbox
                id="product-active"
                data-testid="product-active-checkbox"
                checked={form.active}
                onCheckedChange={(checked) => set("active", checked === true)}
              />
              <Label htmlFor="product-active" className="cursor-pointer">
                Produto ativo na vitrine
              </Label>
            </div>

            <DialogFooter className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="product-form-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                data-testid="product-form-submit"
                disabled={save.isPending || upload.isPending}
                className="bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
              >
                {save.isPending ? "Salvando…" : editing ? "Salvar alterações" : "Criar produto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}