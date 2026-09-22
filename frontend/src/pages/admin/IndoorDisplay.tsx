import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import BannerCarousel from "@/components/shop/BannerCarousel";
import { Button } from "@/components/ui/button";

export default function IndoorDisplay() {
  const { user, isLoading } = useSession();
  const display = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const sync = () => setExpanded(document.fullscreenElement === display.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (isLoading) return <p role="status" className="p-8">Verificando acesso…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && user.role !== "atendente") return <Navigate to="/dashboard" replace />;

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (display.current?.requestFullscreen) await display.current.requestFullscreen();
      else toast.error("Este navegador não oferece tela cheia. Use o modo de tela cheia da TV ou F11.");
    } catch {
      toast.error("Não foi possível expandir. Tente o modo de tela cheia do navegador (F11).");
    }
  };

  return <div ref={display} className="indoor-display" data-testid="indoor-display">
    <BannerCarousel fullscreen />
    <div className="indoor-controls">
      <Button variant="outline" onClick={toggleFullscreen}>
        {expanded ? "Sair da tela cheia" : "Expandir mídia"}
      </Button>
      {!expanded && <Link to="/admin" className="rounded-md bg-card px-3 py-2 text-sm text-foreground">Voltar ao Admin</Link>}
    </div>
  </div>;
}
