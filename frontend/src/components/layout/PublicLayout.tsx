import { Outlet } from "react-router-dom";
import Header from "@/components/shop/Header";
import Footer from "@/components/shop/Footer";
import PageTransition from "@/components/layout/PageTransition";

export default function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <a
        href="#conteudo-principal"
        className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-[#DAA520] px-4 py-3 text-sm font-bold text-[#0B0B0B] focus:not-sr-only"
      >
        Ir para o conteúdo principal
      </a>
      <Header />
      <main id="conteudo-principal" className="flex-1 pt-20" tabIndex={-1}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}
