import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Lock, ShieldCheck, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { publicAsset } from "@/lib/assets";
import { useCart, cartTotals } from "@/lib/cart";
import { useSession } from "@/lib/session";
import { brl } from "@/lib/format";
import type { Order, PaymentStatus, PaypalApproval } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import EmptyState from "@/components/shop/EmptyState";
import ProductImage from "@/components/shop/ProductImage";

export default function CheckoutPage() {
  const { items, clear } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { subtotal, descontos, total } = cartTotals(items);
  const returnHandled = useRef(false);

  const paymentsQuery = useQuery({
    queryKey: ["payments", "status"],
    queryFn: () => apiGet<PaymentStatus>("/payments/status"),
    retry: false,
  });
  const paypalConfigured = paymentsQuery.data?.paypal_configured === true;
  const paypalMode = paymentsQuery.data?.paypal_mode ?? null;

  const paypalFlow = useMutation({
    mutationFn: async () => {
      // 1) our order is created first (status "Pagamento pendente", stock reserved)
      const fingerprint = JSON.stringify([user?.id, items.map(i => [i.product_id, i.qty]).sort()]);
      const stored = sessionStorage.getItem("mv-checkout");
      let attempt: {fingerprint: string; key: string} | null = null;
      try { attempt = stored ? JSON.parse(stored) : null; } catch { /* discard invalid browser state */ }
      if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: crypto.randomUUID() };
      sessionStorage.setItem("mv-checkout", JSON.stringify(attempt));
      const order = await apiPost<Order>("/orders", {
        idempotency_key: attempt.key,
        items: items.map((item) => ({ product_id: item.product_id, qty: item.qty })),
      });
      // 2) the PayPal order is created server-side; credentials never touch the browser
      const origin = window.location.origin;
      const approval = await apiPost<PaypalApproval>("/payments/paypal/create", {
        order_id: order.id,
        return_url: `${origin}/checkout?paypal=return&order_id=${order.id}`,
        cancel_url: `${origin}/checkout?paypal=cancel&order_id=${order.id}`,
      });
      return approval;
    },
    onSuccess: (approval) => {
      clear();
      // 3) the shopper approves the payment on PayPal itself
      window.location.href = approval.approval_url;
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const captureMutation = useMutation({
    mutationFn: (orderId: string) => apiPost<Order>("/payments/paypal/capture", { order_id: orderId }),
    onSuccess: async (order) => {
      sessionStorage.removeItem("mv-checkout");
      clear();
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Pagamento aprovado! Pedido ${order.number} confirmado.`);
      navigate("/pedido-confirmado", { replace: true, state: { order } });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => apiPost<Order>("/payments/paypal/cancel", { order_id: orderId }),
    onSuccess: () => { sessionStorage.removeItem("mv-checkout"); toast("Pedido cancelado."); },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  // Handle the PayPal return/cancel redirect exactly once.
  useEffect(() => {
    const flow = searchParams.get("paypal");
    const orderId = searchParams.get("order_id");
    if (!flow || !orderId || returnHandled.current) return;
    returnHandled.current = true;
    setSearchParams({}, { replace: true });
    if (flow === "return") captureMutation.mutate(orderId);
    if (flow === "cancel") cancelMutation.mutate(orderId);
  }, [searchParams, setSearchParams, captureMutation, cancelMutation]);

  const startPayment = () => {
    if (!user) {
      toast("Entre na sua conta para concluir a compra.");
      navigate("/login");
      return;
    }
    paypalFlow.mutate();
  };

  if (captureMutation.isPending) {
    return (
      <div data-testid="checkout-page" className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-8">
        <img
          src={publicAsset("mv-logo.jpg")}
          alt="MV Multimarcas"
          width={150}
          height={150}
          className="mx-auto h-16 w-16 animate-glow-pulse rounded-xl border border-[#DAA520]/30 object-cover"
        />
        <p data-testid="checkout-capturing" className="mt-6 text-sm uppercase tracking-[0.3em] text-[#BDBDBD]">
          Confirmando seu pagamento…
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div data-testid="checkout-page" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-8">
        <h1 className="font-heading text-3xl font-black uppercase tracking-tight text-white">
          Checkout
        </h1>
        <div className="mt-10">
          <EmptyState
            testId="checkout-empty"
            icon={ShoppingBag}
            title="Seu carrinho está vazio"
            description="Adicione produtos à sacola para seguir para o pagamento."
            action={
              <Link to="/" className={buttonVariants()}>
                <ArrowLeft className="h-4 w-4" /> Continuar comprando
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="checkout-page" className="mx-auto w-full max-w-7xl px-4 py-8 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-12 lg:pb-12">
      <nav aria-label="Navegação estrutural" className="mb-5 text-xs text-[#BDBDBD]">
        <Link to="/" className="hover:text-[#DAA520]">Loja</Link>
        <span aria-hidden="true" className="px-2">/</span>
        <Link to="/carrinho" className="hover:text-[#DAA520]">Carrinho</Link>
        <span aria-hidden="true" className="px-2">/</span>
        <span aria-current="page" className="text-white">Checkout</span>
      </nav>
      <h1 className="font-heading text-3xl font-black uppercase tracking-tight text-white">
        Checkout
      </h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* resumo */}
        <section className="min-w-0 rounded-xl border border-[#242424] bg-[#151515] p-5 sm:p-6">
          <h2 className="font-heading text-xl font-bold text-white">Resumo do pedido</h2>
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <div
                key={item.product_id}
                data-testid={`checkout-item-${item.product_id}`}
                className="flex items-center gap-4 border-b border-[#242424] pb-4 last:border-0"
              >
                <div className="h-16 w-14 shrink-0 overflow-hidden rounded-lg border border-[#242424]">
                  <ProductImage fileId={item.image_file_id} name={item.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{item.name}</p>
                  <p className="text-xs text-[#BDBDBD]">
                    {item.brand} · Qtd {item.qty}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#DAA520]">
                    {brl((item.promo_price ?? item.price) * item.qty)}
                  </p>
                  {item.promo_price && (
                    <p className="text-xs text-[#BDBDBD] line-through">{brl(item.price * item.qty)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between text-[#BDBDBD]">
              <span>Subtotal</span>
              <span className="text-white">{brl(subtotal)}</span>
            </div>
            {descontos > 0 && (
              <div className="flex justify-between text-[#BDBDBD]">
                <span>Descontos</span>
                <span className="text-[#DAA520]">−{brl(descontos)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#BDBDBD]">
              <span>Frete</span>
              <span>Calculado no checkout</span>
            </div>
            <div className="flex justify-between border-t border-[#242424] pt-3 text-xl font-bold">
              <span className="text-white">Total</span>
              <span data-testid="checkout-total" className="text-[#DAA520]">
                {brl(total)}
              </span>
            </div>
          </div>
        </section>

        {/* pagamento */}
        <aside className="h-fit min-w-0 space-y-4 lg:sticky lg:top-24">
          <div className="min-w-0 rounded-xl border border-[#DAA520]/30 bg-[#1E1A08]/50 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#DAA520]/15">
                <ShieldCheck className="h-5 w-5 text-[#DAA520]" />
              </span>
              <h2 className="font-heading text-lg font-bold text-white">Área de pagamento</h2>
            </div>

            {paymentsQuery.isLoading ? (
              <div className="mt-5 space-y-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-[#242424]" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-[#242424]" />
                <div className="h-11 w-full animate-pulse rounded-lg bg-[#242424]" />
              </div>
            ) : paypalConfigured ? (
              <div className="mt-5 space-y-3" data-testid="paypal-available-area">
                <p data-testid="paypal-available-message" className="text-sm text-emerald-400">
                  PayPal conectado{paypalMode === "sandbox" ? " (ambiente de testes)" : ""} — você
                  será levado ao PayPal para aprovar o pagamento com segurança.
                </p>
                {!user && (
                  <p className="text-sm text-[#BDBDBD]">
                    <Link to="/login" className="font-bold text-[#DAA520] hover:underline">
                      Entre na sua conta
                    </Link>{" "}
                    para concluir a compra.
                  </p>
                )}
                <Button
                  type="button"
                  data-testid="paypal-payment-button"
                  disabled={paypalFlow.isPending}
                  onClick={startPayment}
                  className="w-full animate-glow-pulse bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
                >
                  {paypalFlow.isPending ? "Redirecionando…" : `Pagar ${brl(total)} com PayPal`}
                </Button>
                <p className="text-xs text-[#BDBDBD]">
                  A cobrança é processada pelo PayPal. Seus dados de pagamento nunca passam por esta loja.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3" data-testid="paypal-blocked-area">
                <p className="flex items-center gap-2 text-sm font-bold text-[#DAA520]" data-testid="paypal-unavailable-message">
                  <Lock className="h-4 w-4" /> PayPal indisponível no momento
                </p>
                <p className="text-sm leading-relaxed text-[#BDBDBD]" data-testid="paypal-no-charge-message">
                  O pagamento está temporariamente indisponível. Tente novamente mais tarde.
                </p>
                <Button
                  type="button"
                  data-testid="paypal-payment-button"
                  disabled
                  className="w-full cursor-not-allowed bg-[#242424] font-bold uppercase tracking-wide text-[#BDBDBD]"
                >
                  Pagar com PayPal
                </Button>
                <p className="flex items-start gap-2 text-xs text-[#BDBDBD]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DAA520]" />
                  Entre em contato com a loja se precisar de ajuda para concluir seu pedido.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#242424] bg-[#151515] p-5">
            <div className="flex justify-between text-lg font-bold">
              <span className="text-white">Total</span>
              <span data-testid="checkout-summary-total" className="text-[#DAA520]">
                {brl(total)}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#BDBDBD]">
              {items.reduce((sum, i) => sum + i.qty, 0)} item(ns) · Entrega calculada no checkout
            </p>
          </div>

          <Link
            to="/carrinho"
            className={`${buttonVariants({ variant: "outline" })} w-full justify-center`}
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao carrinho
          </Link>
        </aside>
      </div>
      {paypalConfigured && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#DAA520]/30 bg-[#0B0B0B] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] lg:hidden">
          <Button
            type="button"
            disabled={paypalFlow.isPending}
            onClick={startPayment}
            className="mx-auto flex w-full max-w-md bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
          >
            {paypalFlow.isPending ? "Redirecionando…" : `Pagar ${brl(total)} com PayPal`}
          </Button>
        </div>
      )}
    </div>
  );
}
