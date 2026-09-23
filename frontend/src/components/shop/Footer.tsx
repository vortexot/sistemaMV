import { Link } from "react-router-dom";
import BrandMark from "./BrandMark";
import { businessInfo, hasBusinessInfo } from "@/lib/site";

const SHOP_LINKS = [
  { to: "/#colecao", label: "Coleção" },
  { to: "/#categorias", label: "Categorias" },
  { to: "/#destaques", label: "Destaques" },
  { to: "/carrinho", label: "Carrinho" },
];

const ACCOUNT_LINKS = [
  { to: "/login", label: "Entrar / Criar conta" },
  { to: "/dashboard", label: "Minha conta" },
  { to: "/admin", label: "Painel administrativo" },
];

function FooterLinks({ title, links }: { title: string; links: typeof SHOP_LINKS }) {
  const list = (
    <ul className="mt-2 space-y-0.5 md:mt-4 md:space-y-2.5">
      {links.map((link) => (
        <li key={link.to}>
          <Link
            to={link.to}
            className="flex min-h-10 items-center text-sm text-[#BDBDBD] transition-colors hover:text-[#DAA520]"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <details className="group border-t border-[#242424] py-2 md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[0.25em] text-white marker:content-none">
          {title}
          <span aria-hidden="true" className="text-lg text-[#DAA520] transition-transform group-open:rotate-45">+</span>
        </summary>
        {list}
      </details>
      <div className="hidden md:block">
        <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-white">{title}</h3>
        {list}
      </div>
    </>
  );
}

export default function Footer() {
  const telephoneHref = businessInfo.telephone?.replace(/[^\d+]/g, "");

  return (
    <footer data-testid="shop-footer" className="border-t border-[#242424] bg-[#151515]">
      <div className={`mx-auto grid max-w-7xl gap-7 px-4 py-10 sm:px-8 md:gap-10 md:py-14 ${hasBusinessInfo ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
        <div className="md:col-span-2">
          <BrandMark to="" testId="footer-logo" size="lg" showWordmark={false} />
          <p className="mt-4 font-heading text-lg font-extrabold uppercase tracking-[0.2em] text-white">
            MV <span className="text-[#DAA520]">Multimarcas</span>
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#BDBDBD]">
            Streetwear e roupas esportivas organizados em uma vitrine simples para descobrir,
            salvar e comprar suas peças.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-[#DAA520]">
            Vista sua presença.
          </p>
        </div>
        <FooterLinks title="Loja" links={SHOP_LINKS} />
        {hasBusinessInfo && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-white">Loja física</h3>
            <div className="mt-4 space-y-2.5 text-sm text-[#BDBDBD]">
              {businessInfo.address && <p>{businessInfo.address}</p>}
              {businessInfo.telephone && telephoneHref && (
                <p><a href={`tel:${telephoneHref}`} className="transition-colors hover:text-[#DAA520]">{businessInfo.telephone}</a></p>
              )}
              {businessInfo.openingHours && <p>{businessInfo.openingHours}</p>}
              {businessInfo.mapUrl && (
                <p><a href={businessInfo.mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#DAA520] hover:underline">Ver mapa e rota</a></p>
              )}
            </div>
          </div>
        )}
        <FooterLinks title="Conta" links={ACCOUNT_LINKS} />
      </div>
      <div className="border-t border-[#242424]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-[#BDBDBD] sm:flex-row sm:px-8">
          <span>© 2026 MV Multimarcas — Todos os direitos reservados.</span>
          <span className="uppercase tracking-[0.25em] text-[#DAA520]">MV Multimarcas</span>
        </div>
      </div>
    </footer>
  );
}
