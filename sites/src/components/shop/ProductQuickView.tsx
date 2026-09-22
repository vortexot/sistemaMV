import { useState } from "react";
import { motion } from "motion/react";
import { Minus, Plus, ShoppingBag, ZoomIn } from "lucide-react";
import { toast } from "sonner";

import { cartUnitPrice, useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { TAG_LABELS, type Product } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProductImage from "./ProductImage";

interface Props {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Quick view: image zoom on hover, size/colour picker and add-to-cart without leaving the grid. */
export default function ProductQuickView({ product, open, onOpenChange }: Props) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const handleAdd = () => {
    if (product.sizes.length > 0 && !size) {
      toast.error("Selecione um tamanho para continuar.");
      return;
    }
    add(
      {
        product_id: product.id,
        name: product.name,
        brand: product.brand,
        sku: product.sku,
        price: product.price,
        promo_price: product.promo_price,
        image_file_id: product.image_file_id,
      },
      qty,
    );
    const details = [size, color].filter(Boolean).join(" · ");
    toast.success(`${product.name}${details ? ` (${details})` : ""} adicionado ao carrinho.`);
    onOpenChange(false);
    setQty(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={`quick-view-dialog-${product.id}`}
        className="max-h-[92svh] overflow-y-auto border-[#242424] bg-[#151515] p-0 sm:max-w-3xl"
      >
        <div className="grid gap-0 sm:grid-cols-2">
          {/* image with zoom */}
          <div
            data-testid={`quick-view-image-${product.id}`}
            onMouseEnter={() => setZoomed(true)}
            onMouseLeave={() => setZoomed(false)}
            onClick={() => setZoomed((z) => !z)}
            className="relative aspect-square cursor-zoom-in overflow-hidden bg-[#0B0B0B]"
          >
            <motion.div
              animate={{ scale: zoomed ? 1.35 : 1 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="h-full w-full"
            >
              <ProductImage fileId={product.image_file_id} name={product.name} />
            </motion.div>
            {product.tag && (
              <span className="absolute left-3 top-3 rounded-full bg-[#DAA520] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#0B0B0B]">
                {TAG_LABELS[product.tag] ?? product.tag}
              </span>
            )}
            <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-[#0B0B0B]/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#DAA520] backdrop-blur">
              <ZoomIn className="h-3 w-3" /> {zoomed ? "Zoom ativo" : "Passe o mouse"}
            </span>
          </div>

          {/* details */}
          <div className="flex flex-col p-6">
            <DialogHeader className="space-y-1 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#BDBDBD]">
                {product.brand} · {product.category_name}
              </p>
              <DialogTitle className="font-heading text-2xl font-extrabold uppercase tracking-tight text-white">
                {product.name}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-3 flex items-baseline gap-2">
              <span data-testid={`quick-view-price-${product.id}`} className="text-2xl font-bold text-[#DAA520]">
                {brl(cartUnitPrice(product))}
              </span>
              {product.promo_price && (
                <span className="text-sm text-[#BDBDBD] line-through">{brl(product.price)}</span>
              )}
            </div>

            {product.description && (
              <p className="mt-4 text-sm leading-relaxed text-[#BDBDBD]">{product.description}</p>
            )}

            {product.sizes.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">Tamanho</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.sizes.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-testid={`quick-view-size-${product.id}-${option}`}
                      onClick={() => setSize(option)}
                      className={`min-w-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        size === option
                          ? "border-[#DAA520] bg-[#DAA520] text-[#0B0B0B]"
                          : "border-[#242424] bg-[#0B0B0B] text-white hover:border-[#DAA520] hover:text-[#DAA520]"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {product.colors.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">Cor</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.colors.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-testid={`quick-view-color-${product.id}-${option}`}
                      onClick={() => setColor(option)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        color === option
                          ? "border-[#DAA520] bg-[#1E1A08] text-[#DAA520]"
                          : "border-[#242424] bg-[#0B0B0B] text-[#BDBDBD] hover:border-[#DAA520] hover:text-[#DAA520]"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center gap-3 rounded-full border border-[#242424] bg-[#0B0B0B] px-2 py-1">
                <button
                  type="button"
                  data-testid={`quick-view-qty-minus-${product.id}`}
                  aria-label="Diminuir quantidade"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="rounded-full p-1.5 text-white transition-colors hover:text-[#DAA520]"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span data-testid={`quick-view-qty-${product.id}`} className="min-w-5 text-center text-sm font-bold text-white">
                  {qty}
                </span>
                <button
                  type="button"
                  data-testid={`quick-view-qty-plus-${product.id}`}
                  aria-label="Aumentar quantidade"
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  className="rounded-full p-1.5 text-white transition-colors hover:text-[#DAA520]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <Badge variant="outline" className="text-xs">
                {product.stock > 0 ? `${product.stock} em estoque` : "Sem estoque"}
              </Badge>
            </div>

            <Button
              type="button"
              data-testid={`quick-view-add-${product.id}`}
              onClick={handleAdd}
              disabled={product.stock <= 0}
              className="mt-5 w-full gap-2 bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
            >
              <ShoppingBag className="h-4 w-4" />
              {product.stock <= 0 ? "Esgotado" : "Adicionar ao carrinho"}
            </Button>
            <p className="mt-3 text-center text-xs text-[#BDBDBD]">SKU {product.sku}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}