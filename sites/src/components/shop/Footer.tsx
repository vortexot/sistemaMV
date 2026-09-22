import { Link } from "react-router-dom";
import BrandMark from "./BrandMark";

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

export default function Footer() {
  return (
    <footer data-testid="shop-footer" className="border-t border-[#242424] bg-[#151515]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-8 md:grid-cols-4">
        <div className="md:col-span-2">
          <BrandMark to="" testId="footer-logo" size="lg" showWordmark={false} />
          <p className="mt-4 font-heading text-lg font-extrabold uppercase tracking-[0.2em] text-white">
            MV <span className="text-[#DAA520]">Multimarcas</span>
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#BDBDBD]">
            Performance, atitude e acabamento premium para quem se move diferente. Streetwear
            e roupas esportivas das melhores marcas, com curadoria própria.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-[#DAA520]">
            Vista sua presença.
          </p>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-white">Loja</h3>
          <ul className="mt-4 space-y-2.5">
            {SHOP_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-sm text-[#BDBDBD] transition-colors hover:text-[#DAA520]">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-white">Conta</h3>
          <ul className="mt-4 space-y-2.5">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-sm text-[#BDBDBD] transition-colors hover:text-[#DAA520]">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-[#242424]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-[#BDBDBD] sm:flex-row sm:px-8">
          <span>© 2026 MV Multimarcas — Todos os direitos reservados.</span>
          <span className="uppercase tracking-[0.25em] text-[#DAA520]">Seleção premium</span>
        </div>
      </div>
    </footer>
  );
}