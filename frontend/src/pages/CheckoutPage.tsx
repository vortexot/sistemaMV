import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Lock, ShieldCheck, ShoppingBag, Store, Truck } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { publicAsset } from "@/lib/assets";
import { useCart, cartTotals } from "@/lib/cart";
import { useSession } from "@/lib/session";
import { brl } from "@/lib/format";
import { businessInfo } from "@/lib/site";
import type {
  FulfillmentMethod,
  Order,
  PaymentStatus,
  PaypalApproval,
  ShippingAddressInput,
  ShippingQuote,
} from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import EmptyState from "@/components/shop/EmptyState";
import ProductImage from "@/components/shop/ProductImage";

export default function CheckoutPage() {
  const { items, clear } = useCart();
  const { user, isLoading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { subtotal, descontos, total } = cartTotals(items);
  const returnHandled = useRef(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>(() =>
    sessionStorage.getItem("mv-fulfillment-method") === "pickup" ? "pickup" : "delivery",
  );
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressInput>({
    postal_code: "",
    number: "",
    complement: "",
  });
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);

  useEffect(() => {
    sessionStorage.setItem("mv-fulfillment-method", fulfillmentMethod);
  }, [fulfillmentMethod]);

  const paymentsQuery = useQuery({
    queryKey: ["payments", "status"],
    queryFn: () => apiGet<PaymentStatus>("/payments/status"),
    retry: false,
  });
  const paypalConfigured = paymentsQuery.data?.paypal_configured === true;
  const paypalMode = paymentsQuery.data?.paypal_mode ?? null;
  const pixConfigured = paymentsQuery.data?.pix_configured === true;
  const shippingFee = fulfillmentMethod === "delivery" && shippingQuote?.available ? shippingQuote.fee ?? 0 : 0;
  const checkoutTotal = total + shippingFee;
  const deliveryReady = fulfillmentMethod === "pickup" || (shippingQuote?.available === true && !!shippingAddress.number);

  const shippingMutation = useMutation({
    mutationFn: () => apiPost<ShippingQuote>("/shipping/quote", {
      postal_code: shippingAddress.postal_code,
      quantity: items.reduce((sum, item) => sum + item.qty, 0),
    }),
    onSuccess: setShippingQuote,
    onError: (error) => {
      setShippingQuote(null);
      toast.error(apiErrorMessage(error));
    },
  });

  const updateShippingAddress = (field: keyof ShippingAddressInput, value: string) => {
    setShippingAddress((current) => ({ ...current, [field]: value }));
    if (field === "postal_code") setShippingQuote(null);
  };

  const createStoreOrder = async (paymentMethod: "paypal" | "pix") => {
      const fingerprint = JSON.stringify([
        user?.id,
        paymentMethod,
        fulfillmentMethod,
        fulfillmentMethod === "delivery" ? shippingAddress : null,
        items.map(i => [i.product_id, i.qty]).sort(),
      ]);
      const stored = sessionStorage.getItem("mv-checkout");
      let attempt: {fingerprint: string; key: string} | null = null;
      try { attempt = stored ? JSON.parse(stored) : null; } catch { /* discard invalid browser state */ }
      if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: crypto.randomUUID() };
      sessionStorage.setItem("mv-checkout", JSON.stringify(attempt));
      const order = await apiPost<Order>("/orders", {
        idempotency_key: attempt.key,
        payment_method: paymentMethod,
        fulfillment_method: fulfillmentMethod,
        shipping_address: fulfillmentMethod === "delivery" ? shippingAddress : null,
        items: items.map((item) => ({ product_id: item.product_id, qty: item.qty })),
      });
      return order;
  };

  const paypalFlow = useMutation({
    mutationFn: async () => {
      // 1) our order is created first (status "Pagamento pendente", stock reserved)
      const order = await createStoreOrder("paypal");
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
      // 3) the shopper approves the payment on PayPal itself
      window.location.href = approval.approval_url;
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const pixFlow = useMutation({
    mutationFn: () => createStoreOrder("pix"),
    onSuccess: async (order) => {
      sessionStorage.removeItem("mv-checkout");
      sessionStorage.removeItem("mv-fulfillment-method");
      clear();
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate("/pedido-confirmado", { replace: true, state: { order } });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const captureMutation = useMutation({
    mutationFn: (orderId: string) => apiPost<Order>("/payments/paypal/capture", { order_id: orderId }),
    onSuccess: async (order) => {
      sessionStorage.removeItem("mv-checkout");
      sessionStorage.removeItem("mv-fulfillment-method");
      clear();
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Pagamento aprovado! Pedido ${order.number} confirmado.`);
      navigate("/pedido-confirmado", { replace: true, state: { order } });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => apiPost<Order>("/payments/paypal/cancel", { order_id: orderId }),
    onSuccess: () => {
      sessionStorage.removeItem("mv-checkout");
      toast("Pagamento cancelado. Seus itens continuam no carrinho.");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  // Handle the PayPal return/cancel redirect exactly once.
  useEffect(() => {
    const flow = searchParams.get("paypal");
    const orderId = searchParams.get("order_id");
    if (sessionLoading || !user || !flow || !orderId || returnHandled.current) return;
    returnHandled.current = true;
    setSearchParams({}, { replace: true });
    if (flow === "return") captureMutation.mutate(orderId);
    if (flow === "cancel") cancelMutation.mutate(orderId);
  }, [sessionLoading, user, searchParams, setSearchParams, captureMutation, cancelMutation]);

  const startPayment = () => {
    if (!deliveryReady) {
      toast("Calcule o frete e informe o número antes de continuar.");
      return;
    }
    if (!user) {
      toast("Entre na sua conta para concluir a compra.");
      navigate("/login", { state: { returnTo: "/checkout" } });
      return;
    }
    paypalFlow.mutate();
  };
  const paymentButtonLabel = !user
    ? "Entrar para concluir a compra"
    : paypalFlow.isPending
      ? "Redirecionando…"
      : `Pagar ${brl(checkoutTotal)} com PayPal`;

  const startPixPayment = () => {
    if (!deliveryReady) {
      toast("Calcule o frete e informe o número antes de continuar.");
      return;
    }
    pixFlow.mutate();
  };

  if (sessionLoading) {
    return (
      <div role="status" className="flex min-h-[60svh] items-center justify-center text-sm text-[#BDBDBD]">
        Verificando sua sessão…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  }

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
          <fieldset data-testid="fulfillment-method" className="mt-6 border-t border-[#242424] pt-5">
            <legend className="font-heading text-lg font-bold text-white">Como você quer receber?</legend>
            <p className="mt-1 text-sm leading-relaxed text-[#BDBDBD]">
              Escolha a opção antes de pagar online.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label
                data-testid="fulfillment-delivery-option"
                className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  fulfillmentMethod === "delivery"
                    ? "border-[#DAA520] bg-[#1E1A08]/70"
                    : "border-[#343434] bg-[#0B0B0B] hover:border-[#666]"
                }`}
              >
                <input
                  type="radio"
                  name="fulfillment-method"
                  value="delivery"
                  checked={fulfillmentMethod === "delivery"}
                  onChange={() => setFulfillmentMethod("delivery")}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#DAA520]"
                />
                <span>
                  <span className="flex items-center gap-2 font-bold text-white">
                    <Truck className="h-5 w-5 text-[#DAA520]" aria-hidden="true" /> Receber em casa
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#BDBDBD]">
                    Frete e prazo confirmados pela loja.
                  </span>
                </span>
              </label>
              <label
                data-testid="fulfillment-pickup-option"
                className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  fulfillmentMethod === "pickup"
                    ? "border-[#DAA520] bg-[#1E1A08]/70"
                    : "border-[#343434] bg-[#0B0B0B] hover:border-[#666]"
                }`}
              >
                <input
                  type="radio"
                  name="fulfillment-method"
                  value="pickup"
                  checked={fulfillmentMethod === "pickup"}
                  onChange={() => setFulfillmentMethod("pickup")}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#DAA520]"
                />
                <span>
                  <span className="flex items-center gap-2 font-bold text-white">
                    <Store className="h-5 w-5 text-[#DAA520]" aria-hidden="true" /> Retirar na loja
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#BDBDBD]">
                    Sem frete. Pague online e retire após a confirmação.
                  </span>
                </span>
              </label>
            </div>
            <p className="mt-3 text-sm text-[#BDBDBD]" role="status" aria-live="polite">
              {fulfillmentMethod === "pickup"
                ? `Retirada grátis. Aguarde o aviso de pedido pronto antes de ir à loja.${businessInfo.address ? ` Local: ${businessInfo.address}.` : ""}`
                : "A loja confirmará o valor e o prazo do frete antes do envio."}
            </p>
            {fulfillmentMethod === "pickup" && businessInfo.mapUrl && (
              <a
                href={businessInfo.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-11 items-center font-bold text-[#DAA520] hover:underline"
              >
                Ver localização da loja
              </a>
            )}
            {fulfillmentMethod === "delivery" && (
              <div className="mt-5 rounded-xl border border-[#343434] bg-[#0B0B0B] p-4">
                <h3 className="font-bold text-white">Endereço de entrega</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#BDBDBD]">
                  No DF e nos municípios do Entorno, o motoboy custa R$ 9 de saída + R$ 4 por km, limitado a R$ 50. Para outras regiões, calculamos pelos Correios.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="text-sm font-bold text-white">
                    CEP
                    <input
                      value={shippingAddress.postal_code}
                      onChange={(event) => updateShippingAddress("postal_code", event.target.value)}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      className="mt-1 min-h-11 w-full rounded-lg border border-[#343434] bg-[#151515] px-3 text-white outline-none focus:border-[#DAA520]"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => shippingMutation.mutate()}
                    disabled={shippingMutation.isPending || shippingAddress.postal_code.replace(/\D/g, "").length !== 8}
                    aria-busy={shippingMutation.isPending}
                    className="self-end"
                  >
                    {shippingMutation.isPending ? "Calculando…" : "Calcular frete"}
                  </Button>
                </div>
                {shippingQuote && (
                  <div className="mt-4" role="status" aria-live="polite">
                    <p className="text-sm font-bold text-white">
                      {shippingQuote.street}{shippingQuote.neighborhood ? `, ${shippingQuote.neighborhood}` : ""} — {shippingQuote.city}/{shippingQuote.state}
                    </p>
                    {shippingQuote.available && shippingQuote.method === "motoboy" ? (
                      <p data-testid="motoboy-quote" className="mt-1 text-sm text-emerald-400">
                        Motoboy da unidade {shippingQuote.origin_store}: aproximadamente {shippingQuote.distance_km?.toFixed(1)} km · {brl(shippingQuote.fee ?? 0)}
                      </p>
                    ) : shippingQuote.available ? (
                      <p data-testid="correios-quote" className="mt-1 text-sm text-emerald-400">
                        Correios {shippingQuote.service_name}
                        {shippingQuote.delivery_days ? ` · até ${shippingQuote.delivery_days} dias úteis` : ""}
                        {` · ${brl(shippingQuote.fee ?? 0)}`}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-[#DAA520]">
                        Fora da rota regional de motoboy. A cotação dos Correios aguarda as credenciais comerciais da loja.
                      </p>
                    )}
                  </div>
                )}
                {shippingQuote?.available && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-bold text-white">
                      Número
                      <input
                        value={shippingAddress.number}
                        onChange={(event) => updateShippingAddress("number", event.target.value)}
                        autoComplete="address-line2"
                        maxLength={30}
                        className="mt-1 min-h-11 w-full rounded-lg border border-[#343434] bg-[#151515] px-3 text-white outline-none focus:border-[#DAA520]"
                      />
                    </label>
                    <label className="text-sm font-bold text-white">
                      Complemento <span className="font-normal text-[#BDBDBD]">(opcional)</span>
                      <input
                        value={shippingAddress.complement}
                        onChange={(event) => updateShippingAddress("complement", event.target.value)}
                        autoComplete="address-line3"
                        maxLength={120}
                        className="mt-1 min-h-11 w-full rounded-lg border border-[#343434] bg-[#151515] px-3 text-white outline-none focus:border-[#DAA520]"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </fieldset>
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
              <span>
                {fulfillmentMethod === "pickup"
                  ? "Grátis — retirada"
                  : shippingQuote?.available
                    ? brl(shippingFee)
                    : "Calcule pelo CEP"}
              </span>
            </div>
            <div className="flex justify-between border-t border-[#242424] pt-3 text-xl font-bold">
              <span className="text-white">Total</span>
              <span data-testid="checkout-total" className="text-[#DAA520]">
                {brl(checkoutTotal)}
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
            ) : (
              <div className="mt-5 space-y-5">
                {pixConfigured && (
                  <div className="space-y-3" data-testid="pix-available-area">
                    <p className="text-sm text-emerald-400">
                      Pix disponível — o pedido será reservado por 60 minutos para você realizar a transferência.
                    </p>
                    <Button
                      type="button"
                      data-testid="pix-payment-button"
                      disabled={pixFlow.isPending || !deliveryReady}
                      onClick={startPixPayment}
                      aria-busy={pixFlow.isPending}
                      className="w-full bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
                    >
                      {pixFlow.isPending ? "Criando pedido…" : `Pagar ${brl(checkoutTotal)} via Pix`}
                    </Button>
                    <p className="text-xs leading-relaxed text-[#BDBDBD]">
                      Após criar o pedido, mostraremos a chave Pix. A loja confirmará o recebimento antes de preparar ou enviar a compra.
                    </p>
                  </div>
                )}

                {paypalConfigured && (
                  <div className="space-y-3 border-t border-[#343434] pt-5" data-testid="paypal-available-area">
                    <p data-testid="paypal-available-message" className="text-sm text-emerald-400">
                      PayPal conectado{paypalMode === "sandbox" ? " (ambiente de testes)" : ""} — aprovação segura no PayPal.
                    </p>
                    <Button
                      type="button"
                      data-testid="paypal-payment-button"
                      disabled={paypalFlow.isPending || !deliveryReady}
                      onClick={startPayment}
                      aria-busy={paypalFlow.isPending}
                      variant="outline"
                      className="w-full font-bold uppercase tracking-wide"
                    >
                      {paymentButtonLabel}
                    </Button>
                  </div>
                )}

                {!pixConfigured && !paypalConfigured && (
                  <div className="space-y-3" data-testid="payments-blocked-area">
                    <p className="flex items-center gap-2 text-sm font-bold text-[#DAA520]">
                      <Lock className="h-4 w-4" /> Pagamento indisponível no momento
                    </p>
                    <p className="text-sm leading-relaxed text-[#BDBDBD]">
                      {paymentsQuery.isError
                        ? "Não foi possível consultar o serviço de pagamento. Verifique sua conexão e tente novamente."
                        : "Nenhuma forma de pagamento está configurada. Tente novamente mais tarde."}
                    </p>
                  </div>
                )}
                {paymentsQuery.isError && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => paymentsQuery.refetch()}
                    disabled={paymentsQuery.isFetching}
                    aria-busy={paymentsQuery.isFetching}
                    className="w-full"
                  >
                    {paymentsQuery.isFetching ? "Verificando…" : "Tentar verificar novamente"}
                  </Button>
                )}
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
                {brl(checkoutTotal)}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#BDBDBD]">
              {items.reduce((sum, i) => sum + i.qty, 0)} {items.reduce((sum, i) => sum + i.qty, 0) === 1 ? "item" : "itens"} · {fulfillmentMethod === "pickup" ? "Retirada na loja" : shippingQuote?.available ? shippingQuote.method === "motoboy" ? "Entrega por motoboy" : `Entrega pelos Correios${shippingQuote.service_name ? ` ${shippingQuote.service_name}` : ""}` : "Informe o CEP"}
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
      {(pixConfigured || paypalConfigured) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#DAA520]/30 bg-[#0B0B0B] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] lg:hidden">
          <Button
            type="button"
            disabled={(pixConfigured ? pixFlow.isPending : paypalFlow.isPending) || !deliveryReady}
            onClick={pixConfigured ? startPixPayment : startPayment}
            aria-busy={pixConfigured ? pixFlow.isPending : paypalFlow.isPending}
            className="mx-auto flex w-full max-w-md bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
          >
            {pixConfigured
              ? pixFlow.isPending ? "Criando pedido…" : `Pagar ${brl(checkoutTotal)} via Pix`
              : paymentButtonLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
