import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Heart, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { cartUnitPrice, useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { useSession } from "@/lib/session";
import { TAG_LABELS, type CatalogProduct } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ProductImage from "./ProductImage";
import ProductQuickView from "./ProductQuickView";

const TAG_STYLES: Record<string, string> = {
  novo: "bg-[#DAA520] text-[#0B0B0B]",
  oferta: "bg-[#DC2626] text-white",
  mais_vendido: "bg-[#A07C1B] text-[#0B0B0B]",
};

type ProductCardVariant = "catalog" | "feature-main" | "feature-side";

interface ProductCardProps {
  product: CatalogProduct;
  index?: number;
  variant?: ProductCardVariant;
  className?: string;
}

export default function ProductCard({ product, index = 0, variant = "catalog", className }: ProductCardProps) {
  const { add } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  const favoritesQuery = useQuery({
    queryKey: ["favorites"],
    queryFn: () => apiGet<CatalogProduct[]>("/favorites"),
    enabled: !!user,
    retry: false,
  });
  const isFavorite = !!user && (favoritesQuery.data ?? []).some((p) => p.id === product.id);

  const favoriteToggle = useMutation({
    mutationFn: () => apiPost<{ favorited: boolean }>(`/favorites/${product.id}/toggle`),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(data.favorited ? "Adicionado aos favoritos" : "Removido dos favoritos");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleFavorite = () => {
    if (!user) {
      toast("Entre na sua conta para salvar favoritos.");
      navigate("/login");
      return;
    }
    favoriteToggle.mutate();
  };

  const handleAdd = () => {
    add({
      product_id: product.id,
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      price: product.price,
      promo_price: product.promo_price,
      image_file_id: product.image_file_id,
    });
    toast.success(`${product.name} adicionado ao carrinho.`);
  };

  const featured = variant !== "catalog";
  const featureMain = variant === "feature-main";
  const featureSide = variant === "feature-side";

  return (
    <article
      style={{ animationDelay: `${(index % 4) * 55}ms` }}
      data-testid={`product-card-${product.id}`}
      className={cn(
        "card-fade group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#2A2824] bg-[#151515] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-[#E0A018]/60 hover:shadow-[0_18px_44px_rgba(0,0,0,0.32)]",
        featureMain && "h-full rounded-none border-[#E0A018]/20 bg-[#11110f]",
        featureSide && "rounded-none border-[#E0A018]/15 bg-[#181713] lg:grid lg:grid-cols-[0.9fr_1.1fr]",
        className,
      )}
    >
      <div className={cn(
        "brand-product-media relative overflow-hidden",
        variant === "catalog" && "aspect-[4/4.65] sm:aspect-[4/5]",
        featureMain && "aspect-[16/11] min-h-0 lg:flex-1 lg:aspect-auto",
        featureSide && "aspect-[16/11] lg:h-full lg:aspect-auto",
      )}>
        <ProductImage
          fileId={product.image_file_id}
          name={product.name}
          productId={product.id}
          className="bg-[#E8E2D6] saturate-[.92] contrast-[1.03] transition-[filter,transform] duration-700 group-hover:scale-[1.035] group-hover:saturate-100"
        />
        {product.tag && (
          <span
            data-testid={`product-tag-${product.id}`}
            className={`absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.11em] sm:left-3 sm:top-3 sm:px-3 sm:text-[11px] ${
              TAG_STYLES[product.tag] ?? "bg-[#242424] text-white"
            }`}
          >
            {TAG_LABELS[product.tag] ?? product.tag}
          </span>
        )}
        <button
          type="button"
          data-testid={`favorite-product-${product.id}`}
          onClick={handleFavorite}
          aria-label={isFavorite ? `Remover ${product.name} dos favoritos` : `Adicionar ${product.name} aos favoritos`}
          aria-pressed={isFavorite}
          disabled={favoriteToggle.isPending}
          className="absolute right-2.5 top-2.5 flex h-10 w-10 items-center justify-center rounded-full border border-[#E0A018]/20 bg-[#080604]/90 transition-colors hover:text-[#E7B84B] sm:right-3 sm:top-3 sm:h-11 sm:w-11"
        >
          <Heart className={isFavorite ? "h-4 w-4 fill-[#DAA520] text-[#DAA520]" : "h-4 w-4 text-white"} />
        </button>
        <button
          type="button"
          data-testid={`quick-view-product-${product.id}`}
          onClick={() => setQuickViewOpen(true)}
          aria-label={`Ver detalhes de ${product.name}`}
          className="brand-gold-hover absolute inset-x-2.5 bottom-2.5 flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-[#E0A018]/45 bg-[#080604]/92 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-[#E7B84B] transition-all duration-300 sm:inset-x-3 sm:bottom-3 sm:gap-2 sm:text-xs md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100"
        >
          <Eye className="h-3.5 w-3.5" /> Vista rápida
        </button>
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col p-3 sm:p-5", featured && "justify-center lg:p-6", featureMain && "flex-none lg:p-7")}>
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-[#B8B3AA] sm:text-[11px] sm:tracking-[0.16em]">
          {product.brand} · {product.category_name}
        </p>
        <h3
          data-testid={`product-name-${product.id}`}
          className={cn(
            "mt-1 line-clamp-2 font-heading text-sm font-bold leading-tight text-white transition-colors group-hover:text-[#E7B84B] sm:text-lg",
            featureMain && "text-xl sm:text-2xl lg:text-3xl",
            featureSide && "sm:text-xl",
          )}
        >
          {product.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span data-testid={`product-price-${product.id}`} className={cn("text-base font-bold text-[#E7B84B] sm:text-xl", featureMain && "sm:text-2xl")}>
            {brl(cartUnitPrice(product))}
          </span>
          {product.promo_price && (
            <span className="text-[11px] text-[#B8B3AA] line-through sm:text-sm">{brl(product.price)}</span>
          )}
        </div>
        {!product.in_stock && (
          <span className="mt-1 text-xs font-bold uppercase tracking-wider text-[#DC2626]">
            Sem estoque
          </span>
        )}
        <Button
          type="button"
          data-testid={`add-cart-product-${product.id}`}
          onClick={handleAdd}
          disabled={!product.in_stock}
          variant="outline"
          className={cn(
            "brand-gold-hover mt-3 min-h-11 w-full gap-1.5 border-[#302E29] bg-[#181713] px-2 text-[11px] font-bold uppercase tracking-wide text-white sm:mt-4 sm:gap-2 sm:text-sm",
            featured && "lg:mt-5",
          )}
        >
          <ShoppingBag className="h-4 w-4" />
          {!product.in_stock ? "Esgotado" : "Adicionar"}
        </Button>
      </div>
      <ProductQuickView product={product} open={quickViewOpen} onOpenChange={setQuickViewOpen} />
    </article>
  );
}
