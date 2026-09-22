import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import EmptyState from "@/components/shop/EmptyState";
import ProductImage from "@/components/shop/ProductImage";
import { cartTotals, cartUnitPrice, useCart } from "@/lib/cart";

export default function CartPage() {
  const { items, setQty, remove } = useCart();
  const { subtotal, descontos, total } = cartTotals(items);

  return (
    <div data-testid="cart-page" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-8">
      <nav aria-label="Navegação estrutural" className="mb-5 text-xs text-[#BDBDBD]">
        <Link to="/" className="hover:text-[#DAA520]">Loja</Link>
        <span aria-hidden="true" className="px-2">/</span>
        <span aria-current="page" className="text-white">Carrinho</span>
      </nav>
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-3xl font-black uppercase tracking-tight text-white">
          Carrinho
        </h1>
        {items.length > 0 && (
          <span
            data-testid="cart-item-count"
            className="rounded-full bg-[#DAA520] px-3 py-0.5 text-xs font-bold text-[#0B0B0B]"
          >
            {items.reduce((sum, i) => sum + i.qty, 0)} item(ns)
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            testId="cart-empty"
            icon={ShoppingBag}
            title="Seu carrinho está vazio"
            description="Explore a coleção MV Multimarcas e encontre as peças que combinam com o seu movimento."
            action={
              <Link to="/" data-testid="cart-continue-link" className={buttonVariants()}>
                <ArrowLeft className="h-4 w-4" /> Continuar comprando
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {items.map((item) => (
              <motion.div
                key={item.product_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                data-testid={`cart-item-${item.product_id}`}
                className="flex gap-4 rounded-xl border border-[#242424] bg-[#151515] p-4"
              >
                <Link
                  to="/"
                  className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-[#242424]"
                >
                  <ProductImage fileId={item.image_file_id} name={item.name} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDBDBD]">
                        {item.brand}
                      </p>
                      <h3 className="truncate font-heading font-bold text-white">{item.name}</h3>
                      <p className="text-xs text-[#BDBDBD]">SKU {item.sku}</p>
                    </div>
                    <button
                      type="button"
                      data-testid={`cart-remove-${item.product_id}`}
                      onClick={() => remove(item.product_id)}
                      aria-label={`Remover ${item.name}`}
                      className="rounded-lg p-2 text-[#BDBDBD] transition-colors hover:bg-[#242424] hover:text-[#DC2626]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                    <div className="flex items-center gap-3 rounded-full border border-[#242424] bg-[#0B0B0B] px-2 py-1">
                      <button
                        type="button"
                        data-testid={`cart-qty-minus-${item.product_id}`}
                        onClick={() => setQty(item.product_id, item.qty - 1)}
                        aria-label="Diminuir quantidade"
                        className="rounded-full p-1.5 text-white transition-colors hover:text-[#DAA520]"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span data-testid={`cart-qty-${item.product_id}`} className="min-w-5 text-center text-sm font-bold text-white">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        data-testid={`cart-qty-plus-${item.product_id}`}
                        onClick={() => setQty(item.product_id, item.qty + 1)}
                        aria-label="Aumentar quantidade"
                        className="rounded-full p-1.5 text-white transition-colors hover:text-[#DAA520]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-[#DAA520]">
                        {(cartUnitPrice(item) * item.qty).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                      {item.promo_price && (
                        <p className="text-xs text-[#BDBDBD] line-through">
                          {(item.price * item.qty).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <aside className="h-fit rounded-xl border border-[#242424] bg-[#151515] p-6 lg:sticky lg:top-24">
            <h2 className="font-heading text-xl font-bold text-white">Resumo do pedido</h2>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between text-[#BDBDBD]">
                <span>Subtotal</span>
                <span data-testid="cart-subtotal" className="text-white">
                  {subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              {descontos > 0 && (
                <div className="flex justify-between text-[#BDBDBD]">
                  <span>Descontos</span>
                  <span data-testid="cart-discounts" className="text-[#DAA520]">
                    −{descontos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[#BDBDBD]">
                <span>Frete</span>
                <span>Calculado no checkout</span>
              </div>
              <div className="border-t border-[#242424] pt-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span data-testid="cart-total" className="text-[#DAA520]">
                    {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              </div>
            </div>
            <Link
              to="/checkout"
              data-testid="cart-checkout-button"
              className={`${buttonVariants()} mt-6 w-full animate-glow-pulse justify-center`}
            >
              Finalizar compra
            </Link>
            <Link
              to="/"
              data-testid="cart-continue-link"
              className={`${buttonVariants({ variant: "outline" })} mt-3 w-full justify-center`}
            >
              <ArrowLeft className="h-4 w-4" /> Continuar comprando
            </Link>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-[#BDBDBD]">
              <ShoppingBag className="h-3.5 w-3.5 text-[#DAA520]" />
              Carrinho salvo neste navegador
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
