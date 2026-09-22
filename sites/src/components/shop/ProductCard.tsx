import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Eye, Heart, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { cartUnitPrice, useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { useSession } from "@/lib/session";
import { TAG_LABELS, type Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ProductImage from "./ProductImage";
import ProductQuickView from "./ProductQuickView";

const TAG_STYLES: Record<string, string> = {
  novo: "bg-[#DAA520] text-[#0B0B0B]",
  oferta: "bg-[#DC2626] text-white",
  mais_vendido: "bg-[#A07C1B] text-[#0B0B0B]",
};

export default function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { add } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  const favoritesQuery = useQuery({
    queryKey: ["favorites"],
    queryFn: () => apiGet<Product[]>("/favorites"),
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.65, delay: (index % 4) * 0.09, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      data-testid={`product-card-${product.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[#242424] bg-[#151515] transition-colors duration-300 hover:border-[#DAA520]/60 hover:shadow-[0_16px_40px_rgba(255,210,28,0.08)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <ProductImage
          fileId={product.image_file_id}
          name={product.name}
          productId={product.id}
          className="transition-transform duration-500 group-hover:scale-105"
        />
        {product.tag && (
          <span
            data-testid={`product-tag-${product.id}`}
            className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${
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
          aria-label="Favoritar produto"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#0B0B0B]/70 backdrop-blur transition-colors hover:text-[#DAA520]"
        >
          <Heart className={isFavorite ? "h-4 w-4 fill-[#DAA520] text-[#DAA520]" : "h-4 w-4 text-white"} />
        </button>
        <button
          type="button"
          data-testid={`quick-view-product-${product.id}`}
          onClick={() => setQuickViewOpen(true)}
          className="absolute inset-x-3 bottom-3 flex translate-y-3 items-center justify-center gap-2 rounded-lg border border-[#DAA520]/40 bg-[#0B0B0B]/80 py-2 text-xs font-bold uppercase tracking-wider text-[#DAA520] opacity-0 backdrop-blur transition-all duration-300 hover:bg-[#DAA520] hover:text-[#0B0B0B] group-hover:translate-y-0 group-hover:opacity-100"
        >
          <Eye className="h-3.5 w-3.5" /> Vista rápida
        </button>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#BDBDBD]">
          {product.brand} · {product.category_name}
        </p>
        <h3
          data-testid={`product-name-${product.id}`}
          className="mt-1 font-heading text-lg font-bold text-white transition-colors group-hover:text-[#DAA520]"
        >
          {product.name}
        </h3>
        <div className="mt-2 flex items-baseline gap-2">
          <span data-testid={`product-price-${product.id}`} className="text-xl font-bold text-[#DAA520]">
            {brl(cartUnitPrice(product))}
          </span>
          {product.promo_price && (
            <span className="text-sm text-[#BDBDBD] line-through">{brl(product.price)}</span>
          )}
        </div>
        {product.stock <= 0 && (
          <span className="mt-1 text-xs font-bold uppercase tracking-wider text-[#DC2626]">
            Sem estoque
          </span>
        )}
        <Button
          type="button"
          data-testid={`add-cart-product-${product.id}`}
          onClick={handleAdd}
          disabled={product.stock <= 0}
          variant="outline"
          className="mt-4 w-full gap-2 border-[#242424] bg-[#151515] font-bold uppercase tracking-wide text-white hover:border-[#DAA520] hover:bg-[#DAA520] hover:text-[#0B0B0B]"
        >
          <ShoppingBag className="h-4 w-4" />
          {product.stock <= 0 ? "Esgotado" : "Adicionar"}
        </Button>
      </div>
      <ProductQuickView product={product} open={quickViewOpen} onOpenChange={setQuickViewOpen} />
    </motion.article>
  );
}
