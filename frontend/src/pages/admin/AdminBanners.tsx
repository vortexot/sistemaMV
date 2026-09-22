import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "@/lib/api";
import type { Banner, FileMeta } from "@/lib/types";
import { INDOOR } from "@/lib/indoor";
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
import EmptyState from "@/components/shop/EmptyState";

interface BannerForm {
  order: number;
  link: string;
  alt_text: string;
  title: string;
  subtitle: string;
  active: boolean;
  image_file_id: string | null;
}

const EMPTY_FORM: BannerForm = { order: 0, link: "", alt_text: "", title: "", subtitle: "", active: true, image_file_id: null };

export default function AdminBanners() {
  const queryClient = useQueryClient();
  const bannersQuery = useQuery({
    queryKey: ["admin", "banners"],
    queryFn: () => apiGet<Banner[]>("/admin/banners"),
    retry: false,
  });
  const banners = bannersQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);

  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin", "banners"] }), queryClient.invalidateQueries({ queryKey: ["admin", "indoor"] })]);
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0) throw new Error("Use JPG, PNG, WEBP ou GIF de até 8 MB.");
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
        ...form,
        title: form.title.trim(),
        subtitle: form.subtitle,
        active: form.active,
        image_file_id: form.image_file_id || null,
      };
      return editing
        ? apiPatch<Banner>(`/admin/banners/${editing.id}`, payload)
        : apiPost<Banner>("/admin/banners", payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Banner atualizado" : "Banner criado");
      setOpen(false);
      await refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const toggleActive = useMutation({
    mutationFn: (banner: Banner) => apiPatch<Banner>(`/admin/banners/${banner.id}`, { active: !banner.active }),
    onSuccess: async () => {
      toast.success("Status atualizado");
      await refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (banner: Banner) => apiDelete(`/admin/banners/${banner.id}`),
    onSuccess: async () => {
      toast.success("Banner excluído");
      await refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="admin-banners-page" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Home</p>
          <h1 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight text-white">
            Mídia Indoor
          </h1>
          <p className="mt-1 text-sm text-[#BDBDBD]">
            Promoções para a TV da loja física, com acesso pelo Admin. Menor ordem aparece primeiro.
          </p>
        </div>
        <Button
          type="button"
          data-testid="admin-new-banner-button"
          onClick={() => {
            setEditing(null);
            setForm(EMPTY_FORM);
            setOpen(true);
          }}
          className="gap-2 bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
        >
          <Plus className="h-4 w-4" /> Novo banner
        </Button>
      </div>

      <a href="/admin/midia-indoor/tv" className="inline-flex rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">Exibir na TV / Expandir mídia</a>
      {bannersQuery.isError ? <p role="alert">{apiErrorMessage(bannersQuery.error)} <Button onClick={() => bannersQuery.refetch()}>Tentar novamente</Button></p> : bannersQuery.isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl bg-[#151515]" />
          ))}
        </div>
      ) : banners.length === 0 ? (
        <EmptyState
          testId="admin-banners-empty"
          icon={Megaphone}
          title="Nenhum banner cadastrado"
          description="Cadastre imagens e ative as promoções para exibi-las na TV da loja física."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setForm(EMPTY_FORM);
                setOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Novo banner
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {banners.map((banner) => (
            <div
              key={banner.id}
              data-testid={`admin-banner-card-${banner.id}`}
              className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]"
            >
              <div className="relative h-40 bg-[#0B0B0B]">
                {banner.image_file_id ? (
                  <img
                    src={`/api/files/${banner.image_file_id}`}
                    alt={banner.alt_text || banner.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest text-[#BDBDBD]">
                    Sem imagem
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] via-transparent to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <p className="font-heading text-lg font-extrabold uppercase text-white">{banner.title}</p>
                  <p className="text-xs text-[#BDBDBD]">{banner.subtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Badge className={banner.active ? "bg-emerald-500/15 text-emerald-400" : "bg-[#242424] text-[#BDBDBD]"}>
                  {banner.active ? "Ativo" : "Inativo"}
                </Badge>
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm">Ordem: {banner.order}</span>
                  <Button variant="outline" size="sm" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(banner)}>{banner.active ? "Desativar" : "Ativar"}</Button>
                  <Button
                    type="button"
                    data-testid={`admin-banner-edit-${banner.id}`}
                    onClick={() => {
                      setEditing(banner);
                      setForm({
                        order: banner.order, link: banner.link, alt_text: banner.alt_text,
                        title: banner.title,
                        subtitle: banner.subtitle,
                        active: banner.active,
                        image_file_id: banner.image_file_id,
                      });
                      setOpen(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    type="button"
                    data-testid={`admin-banner-delete-${banner.id}`}
                    disabled={remove.isPending}
                    onClick={() => { if (window.confirm(`Excluir a promoção “${banner.title}”?`)) remove.mutate(banner); }}
                    variant="outline"
                    size="icon-sm"
                    aria-label="Excluir banner"
                    className="hover:border-[#DC2626] hover:text-[#DC2626]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => { if (!upload.isPending && !save.isPending) setOpen(next); }}>
        <DialogContent className="border-[#242424] bg-[#151515] sm:max-w-lg max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold text-white">
              {editing ? `Editar banner — ${editing.title}` : "Novo banner"}
            </DialogTitle>
          </DialogHeader>
          <form
            data-testid="banner-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (form.title.trim().length < 2 || !form.image_file_id) {
                toast.error("Informe um título com pelo menos 2 caracteres e envie uma imagem.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="banner-title">Título</Label>
              <Input
                id="banner-title"
                required minLength={2} maxLength={120}
                data-testid="banner-title-input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Coleção Velocity"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banner-subtitle">Subtítulo</Label>
              <Input
                id="banner-subtitle"
                maxLength={500}
                data-testid="banner-subtitle-input"
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="Descrição opcional da promoção"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-order">Ordem de exibição (menor primeiro)</Label>
              <Input id="banner-order" type="number" min={0} max={100000} step={1} required value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))} />
              <Label htmlFor="banner-link">Link opcional (https:// ou /caminho)</Label>
              <Input id="banner-link" maxLength={2048} value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
              <Label htmlFor="banner-alt">Texto alternativo: descreva a promoção</Label>
              <Input id="banner-alt" maxLength={300} value={form.alt_text} onChange={(e) => setForm((f) => ({ ...f, alt_text: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-image">Imagem</Label>
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-16 w-24 overflow-hidden rounded-lg border border-[#242424] bg-[#0B0B0B]">
                  {form.image_file_id ? (
                    <img src={`/api/files/${form.image_file_id}`} alt="Pré-visualização" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-[#BDBDBD]">
                      Sem imagem
                    </div>
                  )}
                </div>
                <Input
                  id="banner-image"
                  data-testid="banner-image-input"
                  disabled={upload.isPending || save.isPending}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload.mutate(file);
                    event.target.value = "";
                  }}
                  className="w-56 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-[#DAA520] file:px-3 file:py-1 file:text-xs file:font-bold file:text-[#0B0B0B]"
                />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-[#BDBDBD]">
                <ImagePlus className="h-3.5 w-3.5" /> {upload.isPending ? "Enviando imagem…" : `JPG, PNG, WEBP ou GIF — máx. 8 MB. Recomendado: ${INDOOR.recommendedWidth} × ${INDOOR.recommendedHeight}.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="banner-active"
                data-testid="banner-active-checkbox"
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked === true }))}
              />
              <Label htmlFor="banner-active" className="cursor-pointer">
                Banner ativo
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={upload.isPending || save.isPending} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                data-testid="banner-form-submit"
                disabled={save.isPending || upload.isPending}
                className="bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
              >
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
