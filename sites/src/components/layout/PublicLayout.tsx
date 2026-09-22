import { Outlet } from "react-router-dom";
import Header from "@/components/shop/Header";
import Footer from "@/components/shop/Footer";
import PageTransition from "@/components/layout/PageTransition";

export default function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header />
      <main className="shop-main flex-1 pt-[88px] sm:pt-28">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}
