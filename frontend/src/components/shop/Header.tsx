import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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

const MOBILE_CATEGORIES = [
  ["Camisas", "camisas"],
  ["Moletons", "moletons"],
  ["Tênis", "tenis"],
  ["Calças", "calcas"],
  ["Shorts", "shorts"],
  ["Acessórios", "acessorios"],
] as const;

export default function Header() {
  const { user } = useSession();
  const { count } = useCart();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  const [heroScrollProgress, setHeroScrollProgress] = useState(pathname === "/" ? 0 : 1);
  const isHome = pathname === "/";

  useEffect(() => {
    if (!isHome) {
      setHeroScrollProgress(1);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      setHeroScrollProgress(Math.min(1, window.scrollY / Math.max(window.innerHeight * 0.72, 1)));
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, [isHome]);

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
        className="brand-gold-surface absolute right-1 top-1 h-10 rounded-md px-3 text-xs font-bold uppercase tracking-wide transition-all"
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
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#242424] bg-[#151515] text-white transition-colors hover:border-[#DAA520] hover:text-[#DAA520] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0D9A8]"
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
      className="brand-gold-surface flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold uppercase tracking-wide transition-all"
    >
      <LogIn className="h-4 w-4" /> Entrar
    </Link>
  );

  return (
    <header
      data-testid="shop-header"
      data-scroll-state={!isHome || heroScrollProgress >= 0.98 ? "solid" : heroScrollProgress <= 0.02 ? "top" : "transition"}
      className="fixed inset-x-0 top-0 z-50 border-b pt-[env(safe-area-inset-top)] transition-[background-color,border-color,box-shadow,backdrop-filter] duration-150 ease-linear"
      style={{
        backgroundColor: `rgba(11, 11, 11, ${0.18 + heroScrollProgress * 0.74})`,
        borderBottomColor: `rgba(218, 165, 32, ${0.04 + heroScrollProgress * 0.16})`,
        boxShadow: `0 1px 0 rgba(0, 0, 0, ${heroScrollProgress * 0.16})`,
        backdropFilter: `blur(${2 + heroScrollProgress * 6}px)`,
        WebkitBackdropFilter: `blur(${2 + heroScrollProgress * 6}px)`,
      }}
    >
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center gap-2 px-3 sm:px-6 md:h-20 md:gap-4 md:px-8">
        <BrandMark testId="header-logo" className="shrink-0 gap-2 [&_img]:h-9 [&_img]:w-9 md:gap-3 md:[&_img]:h-11 md:[&_img]:w-11 max-[359px]:gap-0 max-[359px]:[&_[data-slot=brand-wordmark]]:hidden" />

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
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-header-search"
            onClick={() => setMobileSearchOpen((v) => !v)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#242424] bg-[#151515] text-white transition-colors hover:border-[#DAA520] hover:text-[#DAA520] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0D9A8] md:hidden"
          >
            <Search className="h-5 w-5" />
          </button>
          {cartBadge}
          <div className="hidden lg:block">{accountLink}</div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen} modal={true}>
            <SheetTrigger
              render={
                <button
                  aria-label="Abrir menu"
                  data-testid="header-mobile-menu"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#242424] bg-[#151515] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0D9A8] xl:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>
              }
            />
            <SheetContent
              side="right"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-menu-title"
              data-testid="mobile-menu-dialog"
              className="border-[#3A352A] bg-[radial-gradient(circle_at_100%_0%,#30291b_0%,#11110f_34%,#0B0B0B_68%)] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] data-[side=right]:w-[calc(100vw-1rem)] data-[side=right]:max-w-[28rem] [&_[data-slot=sheet-close]]:h-11 [&_[data-slot=sheet-close]]:w-11 sm:px-7"
            >
              <div className="pr-12">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#E7B84B]">MV / Navegação</p>
                <SheetTitle id="mobile-menu-title" className="mt-2 font-heading text-3xl font-semibold uppercase tracking-[-0.035em] text-white">
                  Encontre sua direção.
                </SheetTitle>
              </div>
              <div className="mt-5">{searchField("menu-search", "menu-search-input")}</div>
              <nav className="mt-4 border-y border-[#2A2824] py-2" data-testid="header-nav-mobile">
                {NAV_LINKS.map((link, index) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className="group flex min-h-12 items-center gap-4 border-b border-[#242424]/70 px-1 py-2.5 last:border-0"
                  >
                    <span className="text-[9px] tracking-[0.2em] text-[#726C61]">0{index + 1}</span>
                    <span className="font-heading text-lg font-semibold uppercase tracking-wide text-[#EDE8DE] transition-colors group-hover:text-[#E7B84B]">{link.label}</span>
                  </Link>
                ))}
              </nav>
              <div className="mt-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#7E796F]">Categorias</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {MOBILE_CATEGORIES.map(([label, slug]) => (
                    <Link key={slug} to={`/?cat=${slug}#colecao`} onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center justify-between border border-[#2A2824] bg-[#151513]/80 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#BDB8AF] transition-colors hover:border-[#E0A018] hover:text-[#E7B84B]">
                      {label}<span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#2A2824] pt-4">
                {user ? (
                  <Link
                    to="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="col-span-2 flex min-h-11 items-center gap-2 bg-[#151515] px-3 py-2.5 text-sm font-semibold text-white"
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
                    className="brand-gold-surface flex min-h-11 items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold uppercase"
                  >
                    <LogIn className="h-4 w-4" /> Entrar
                  </Link>
                )}
                <Link
                  to="/carrinho"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center justify-center gap-2 border border-[#3A352A] px-3 py-2.5 text-xs font-semibold text-white"
                >
                  <ShoppingBag className="h-4 w-4 text-[#DAA520]" /> Carrinho
                  {count > 0 && <span className="text-[#DAA520]">({count})</span>}
                </Link>
              </div>
              <p className="mt-auto pt-5 text-[9px] uppercase tracking-[0.24em] text-[#6F6A61]">Vista sua presença. MV Multimarcas.</p>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* busca expandida no mobile */}
      {mobileSearchOpen && (
        <div id="mobile-header-search" className="border-t border-[#242424] px-3 pb-3 pt-3 sm:px-4 md:hidden" data-testid="shop-search-mobile">
          {searchField("mobile-search", "mobile-search-input", true)}
        </div>
      )}
    </header>
  );
}
