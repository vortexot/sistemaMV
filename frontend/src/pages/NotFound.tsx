import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div
      data-testid="not-found-page"
      className="flex min-h-svh flex-col items-center justify-center bg-[#0B0B0B] px-4 text-center"
    >
      <img
        src="/mv-logo.jpg"
        alt="MV Multimarcas"
        width={150}
        height={150}
        className="h-20 w-20 rounded-2xl border border-[#DAA520]/30 object-cover"
      />
      <h1 className="mt-8 font-heading text-6xl font-black uppercase tracking-tight text-white">
        404
      </h1>
      <p className="mt-3 text-sm text-[#BDBDBD]">
        Esta página não existe — mas a coleção continua de pé.
      </p>
      <Link to="/" className={`${buttonVariants()} mt-8`}>
        Voltar para a loja
      </Link>
    </div>
  );
}
