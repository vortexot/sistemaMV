import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, ShoppingBag } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { brl } from "@/lib/format";
import type { Order } from "@/lib/types";

interface ConfirmationState {
  order?: Order;
}

export default function OrderConfirmation() {
  const location = useLocation();
  const order = (location.state as ConfirmationState | null)?.order;

  return (
    <div data-testid="order-confirmation-page" className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-8">
      <div className="rounded-2xl border border-[#DAA520]/30 bg-[#151515] p-6 text-center sm:p-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1E1A08]">
          {order ? <CheckCircle2 className="h-8 w-8 text-[#DAA520]" /> : <ShoppingBag className="h-8 w-8 text-[#DAA520]" />}
        </span>
        <h1 className="mt-6 font-heading text-2xl font-black uppercase tracking-tight text-white">
          {order ? "Pagamento aprovado" : "Pedido confirmado"}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#BDBDBD]" role="status">
          {order
            ? <>Pedido <span className="font-bold text-[#DAA520]">{order.number}</span> confirmado — {brl(order.total)}. Acompanhe o status na sua conta.</>
            : "Acesse sua conta para acompanhar o status dos pedidos confirmados."}
        </p>
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
