import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { setHeroPhase, useHeroPhase } from "@/lib/heroIntro";
import Header from "@/components/shop/Header";
import Footer from "@/components/shop/Footer";
import PageTransition from "@/components/layout/PageTransition";

export default function PublicLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const isHome = pathname === "/";
  const phase = useHeroPhase();
  const introducing = isHome && phase !== "HERO_READY";
  useEffect(() => {
    if (!isHome) setHeroPhase("HERO_READY");
  }, [isHome]);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [pathname]);
  return (
    <div className={`flex min-h-svh flex-col bg-background ${isHome ? "cinematic-home" : ""}`}>
      <a
        href="#conteudo-principal"
        className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-[#DAA520] px-4 py-3 text-sm font-bold text-[#0B0B0B] focus:not-sr-only"
      >
        Ir para o conteúdo principal
      </a>
      <div className="cinematic-navigation" inert={introducing} aria-hidden={introducing}>
        <Header />
      </div>
      <main ref={mainRef} id="conteudo-principal" className={`flex-1 ${isHome ? "" : "pt-[var(--site-header-height)]"}`} tabIndex={-1}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}
