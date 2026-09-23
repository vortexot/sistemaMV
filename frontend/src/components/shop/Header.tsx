import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import BrandMark from "./BrandMark";

const NAV_LINKS = [
  { to: "/#colecao", label: "Coleção" },
  { to: "/#categorias", label: "Categorias" },
  { to: "/#destaques", label: "Destaques" },
];

export default function Header() {
  const { user } = useSession();
  const { count } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [term, setTerm] = useState(searchParams.get("q") ?? "");

  // Keep the field in sync when the URL changes (filter cleared on the page, back/forward…).
  useEffect(() => {
    setTerm(searchParams.get("q") ?? "");
  }, [searchParams]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = term.trim();
    navigate(value ? `/?q=${encodeURIComponent(value)}#colecao` : "/#colecao");
    setMenuOpen(false);
    setMobileSearchOpen(false);
  };

  const searchField = (id: string, testId: string, autoFocus = false) => (
    <form onSubmit={submitSearch} role="search" className="relative w-full" data-testid={`${testId}-form`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#BDBDBD]" />
      <input
        id={id}
        data-testid={testId}
        type="search"
        value={term}
        autoFocus={autoFocus}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Buscar peças, marcas…"
        aria-label="Buscar peças"
        className="h-12 w-full rounded-lg border border-[#242424] bg-[#151515] pl-10 pr-24 text-base text-white placeholder:text-[#BDBDBD]/70 transition-colors focus:border-[#DAA520] focus:outline-none md:text-sm"
      />
      {term && (
        <button
          type="button"
          data-testid={`${testId}-clear`}
          aria-label="Limpar busca"
          onClick={() => {
            setTerm("");
            navigate("/#colecao");
          }}
          className="absolute right-[5.25rem] top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#BDBDBD] transition-colors hover:text-[#DAA520]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="submit"
        data-testid={`${testId}-submit`}
        className="absolute right-1 top-1 h-10 rounded-md bg-[#DAA520] px-3 text-xs font-bold uppercase tracking-wide text-[#0B0B0B] transition-colors hover:bg-[#A07C1B]"
      >
        Buscar
      </button>
    </form>
  );

  const cartBadge = (
    <Link
      to="/carrinho"
      data-testid="shop-cart-link"
      aria-label="Abrir carrinho"
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#242424] bg-[#151515] text-white transition-colors hover:border-[#DAA520] hover:text-[#DAA520]"
    >
      <ShoppingBag className="h-5 w-5" />
      {count > 0 && (
        <span
          data-testid="shop-cart-count"
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#DAA520] px-1 text-[11px] font-bold text-[#0B0B0B]"
        >
          {count}
        </span>
      )}
    </Link>
  );

  const accountLink = user ? (
    <Link
      to="/dashboard"
      data-testid="header-user-link"
      className="flex items-center gap-2 rounded-lg border border-[#242424] bg-[#151515] py-1.5 pl-1.5 pr-3 transition-colors hover:border-[#DAA520]"
    >
      {user.picture ? (
        <img src={user.picture} alt={user.name} width={56} height={56} decoding="async" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#DAA520] text-xs font-bold text-[#0B0B0B]">
          {user.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden text-sm font-semibold text-white sm:block">{user.name.split(" ")[0]}</span>
    </Link>
  ) : (
    <Link
      to="/login"
      data-testid="header-login-link"
      className="flex h-11 items-center gap-2 rounded-lg bg-[#DAA520] px-4 text-sm font-bold uppercase tracking-wide text-[#0B0B0B] transition-colors hover:bg-[#A07C1B]"
    >
      <LogIn className="h-4 w-4" /> Entrar
    </Link>
  );

  return (
    <header
      data-testid="shop-header"
      className="fixed inset-x-0 top-0 z-50 border-b border-[#242424] bg-[#0B0B0B]/98 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(255,255,255,0.02)]"
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-4 sm:px-8">
        <BrandMark testId="header-logo" className="shrink-0 max-[359px]:gap-0 max-[359px]:[&_[data-slot=brand-wordmark]]:hidden" />

        <nav className="ml-2 hidden items-center gap-7 xl:flex" data-testid="header-nav-desktop">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm font-medium uppercase tracking-wider text-[#BDBDBD] transition-colors hover:text-[#DAA520]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* busca — sempre visível a partir de md */}
        <div className="mx-auto hidden min-w-0 w-full max-w-sm md:block">
          {searchField("header-search", "shop-search-input")}
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 md:ml-0 sm:gap-3">
          <button
            type="button"
            data-testid="shop-search-toggle"
            aria-label="Buscar peças"
            onClick={() => setMobileSearchOpen((v) => !v)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#242424] bg-[#151515] text-white transition-colors hover:border-[#DAA520] hover:text-[#DAA520] md:hidden"
          >
            <Search className="h-5 w-5" />
          </button>
          {cartBadge}
          <div className="hidden lg:block">{accountLink}</div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <button
                  aria-label="Abrir menu"
                  data-testid="header-mobile-menu"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#242424] bg-[#151515] text-white xl:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>
              }
            />
            <SheetContent side="right" className="border-[#242424] bg-[#0B0B0B] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
              <SheetTitle className="font-heading text-lg font-extrabold uppercase tracking-[0.2em] text-white">
                Menu
              </SheetTitle>
              <div className="mt-5">{searchField("menu-search", "menu-search-input")}</div>
              <nav className="mt-5 flex flex-col gap-2" data-testid="header-nav-mobile">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-semibold uppercase tracking-wider text-[#BDBDBD] transition-colors hover:bg-[#151515] hover:text-[#DAA520]"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 space-y-3 border-t border-[#242424] pt-6">
                {user ? (
                  <Link
                    to="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg bg-[#151515] px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    <UserRound className="h-4 w-4 text-[#DAA520]" />
                    {user.name}
                    <span className="ml-auto text-xs text-[#BDBDBD]">{ROLE_LABELS[user.role]}</span>
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    data-testid="header-mobile-login"
                    className="flex items-center justify-center gap-2 rounded-lg bg-[#DAA520] px-3 py-2.5 text-sm font-bold uppercase text-[#0B0B0B]"
                  >
                    <LogIn className="h-4 w-4" /> Entrar
                  </Link>
                )}
                <Link
                  to="/carrinho"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[#242424] px-3 py-2.5 text-sm font-semibold text-white"
                >
                  <ShoppingBag className="h-4 w-4 text-[#DAA520]" /> Carrinho
                  {count > 0 && <span className="text-[#DAA520]">({count})</span>}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* busca expandida no mobile */}
      {mobileSearchOpen && (
        <div className="border-t border-[#242424] px-4 pb-3 pt-3 md:hidden" data-testid="shop-search-mobile">
          {searchField("mobile-search", "mobile-search-input", true)}
        </div>
      )}
    </header>
  );
}
