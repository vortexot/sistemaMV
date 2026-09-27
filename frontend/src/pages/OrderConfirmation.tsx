import { Link, Navigate, useLocation } from "react-router-dom";
import { CheckCircle2, Copy, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

import { Button, buttonVariants } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { useSession } from "@/lib/session";
import { FULFILLMENT_METHOD_LABELS, type Order } from "@/lib/types";

interface ConfirmationState {
  order?: Order;
}

export default function OrderConfirmation() {
  const { user, isLoading } = useSession();
  const location = useLocation();
  const state = location.state as ConfirmationState | null;
  const order = state?.order;
  const pendingPix = order?.payment_method === "pix" && order.payment_status !== "pago";

  if (isLoading) {
    return <div role="status" className="flex min-h-[60svh] items-center justify-center text-sm text-[#BDBDBD]">Verificando sua sessão…</div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ returnTo: "/pedido-confirmado" }} />;

  const copyPixPayload = async () => {
    if (!order?.pix_copy_paste) return;
    await navigator.clipboard.writeText(order.pix_copy_paste);
    toast.success("Pix Copia e Cola copiado");
  };

  return (
    <div data-testid="order-confirmation-page" className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-8">
      <div className="rounded-2xl border border-[#DAA520]/30 bg-[#151515] p-6 text-center sm:p-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1E1A08]">
          {order ? <CheckCircle2 className="h-8 w-8 text-[#DAA520]" /> : <ShoppingBag className="h-8 w-8 text-[#DAA520]" />}
        </span>
        <h1 className="mt-6 font-heading text-2xl font-black uppercase tracking-tight text-white">
          {pendingPix ? "Pedido criado" : order ? "Pagamento aprovado" : "Consulte seus pedidos"}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#BDBDBD]" role="status">
          {pendingPix
            ? <>Pedido <span className="font-bold text-[#DAA520]">{order.number}</span> reservado por 60 minutos — transfira exatamente {brl(order.total)} via Pix.</>
            : order
            ? <>Pedido <span className="font-bold text-[#DAA520]">{order.number}</span> confirmado — {brl(order.total)}. Acompanhe o status na sua conta.</>
            : "Não há uma confirmação recente neste navegador. Acesse sua conta para consultar seus pedidos com segurança."}
        </p>
        {pendingPix && order.pix_copy_paste && (
          <div className="mx-auto mt-5 max-w-md rounded-xl border border-[#DAA520]/30 bg-[#0B0B0B] p-4 text-left">
            <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-[#DAA520]">Escaneie para pagar</p>
            <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-3">
              <QRCodeSVG
                value={order.pix_copy_paste}
                size={220}
                level="M"
                marginSize={1}
                title={`QR Code Pix do pedido ${order.number}`}
              />
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-[#DAA520]">Chave Pix — telefone</p>
            <p className="mt-2 break-all font-mono text-base font-bold text-white">{order.pix_key}</p>
            <Button type="button" onClick={copyPixPayload} className="mt-4 w-full">
              <Copy className="h-4 w-4" /> Copiar Pix Copia e Cola
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-[#BDBDBD]">
              Confira o nome do recebedor no aplicativo do banco antes de pagar. O pedido só será preparado depois que a loja confirmar o recebimento.
            </p>
          </div>
        )}
        {order && (
          <p className="mx-auto mt-3 w-fit rounded-full border border-[#DAA520]/30 bg-[#1E1A08] px-4 py-2 text-sm font-bold text-white">
            {FULFILLMENT_METHOD_LABELS[order.fulfillment_method ?? "delivery"]}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/dashboard" className={buttonVariants()}>
            Ver meus pedidos
          </Link>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Continuar comprando
          </Link>
        </div>
      </div>
    </div>
  );
}
