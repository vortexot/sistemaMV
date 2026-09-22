import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ApiError, apiGet } from "@/lib/api";
import type { Banner } from "@/lib/types";
import { INDOOR } from "@/lib/indoor";

function Slides({ banners, fullscreen }: { banners: Banner[]; fullscreen: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const reducedMotion = useReducedMotion();
  const available = banners.filter((banner) => !failed.includes(banner.image_file_id!));
  const current = available[index % available.length];
  const nextId = available[(index + 1) % available.length]?.image_file_id;

  useEffect(() => {
    if (available.length <= 1 || paused || !nextId) return;
    let cancelled = false;
    let ready = false;
    let elapsed = false;
    const advance = () => { if (!cancelled && ready && elapsed) setIndex((i) => i + 1); };
    const preload = new Image();
    preload.onload = () => { ready = true; advance(); };
    preload.onerror = () => { if (!cancelled) setFailed((ids) => [...ids, nextId]); };
    preload.src = `/api/files/${nextId}`;
    const timer = window.setTimeout(() => { elapsed = true; advance(); }, INDOOR.intervalMs);
    return () => { cancelled = true; window.clearTimeout(timer); preload.onload = null; preload.onerror = null; };
  }, [available.length, nextId, index, paused]);

  if (!current) return fullscreen ? <p role="status" className="p-8">Nenhuma imagem disponível.</p> : null;
  const image = <img src={`/api/files/${current.image_file_id}`} alt={current.alt_text || current.title}
    width={1920} height={1080} decoding="async" fetchPriority="high"
    className="h-full w-full object-contain" onError={() => setFailed((ids) => [...ids, current.image_file_id!])} />;
  return <section data-testid="shop-banner-carousel" aria-label="Mídia Indoor — promoções"
    className={fullscreen ? "indoor indoor-fullscreen" : "indoor indoor-store"}>
    <div className="indoor-stage">
      <AnimatePresence initial={false}>
        <motion.div key={current.id} className="absolute inset-0"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion || available.length === 1 ? 0 : INDOOR.transitionMs / 1000, ease: INDOOR.easing }}>
          {current.link ? <a href={current.link} className="block h-full w-full" aria-label={current.title}>{image}</a> : image}
        </motion.div>
      </AnimatePresence>
    </div>
    {available.length > 1 && <button type="button" className="indoor-pause" onClick={() => setPaused((p) => !p)}
      aria-label={paused ? "Continuar apresentação" : "Pausar apresentação"}>{paused ? "Continuar" : "Pausar"}</button>}
  </section>;
}

/** Indoor presentation for authenticated staff, never mounted in the storefront. */
export default function BannerCarousel({ fullscreen = false }: { fullscreen?: boolean }) {
  const query = useQuery({ queryKey: ["admin", "indoor"], queryFn: () => apiGet<Banner[]>("/admin/indoor"),
    staleTime: INDOOR.refreshMs, refetchInterval: INDOOR.refreshMs, refetchIntervalInBackground: true, retry: 1 });
  if (query.error instanceof ApiError && [401, 403].includes(query.error.status)) {
    return <p role="alert" className="p-8">Acesso encerrado. Entre novamente no Admin para continuar.</p>;
  }
  const banners = (query.data ?? []).filter((b) => b.active && b.image_file_id)
    .sort((a, b) => a.order - b.order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (!banners.length) {
    if (!fullscreen) return null;
    return <main className="flex min-h-svh items-center justify-center bg-background p-8 text-foreground">
      <p role="status">{query.isLoading ? "Carregando promoções…" : query.isError ? "Não foi possível carregar. Tentaremos novamente automaticamente." : "Nenhuma promoção ativa."}</p>
    </main>;
  }
  return <Slides key={banners.map((b) => `${b.id}:${b.image_file_id}`).join(",")} banners={banners} fullscreen={fullscreen} />;
}
