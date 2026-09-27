import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { publicAsset } from "@/lib/assets";
import { setHeroPhase, useHeroPhase } from "@/lib/heroIntro";
import "./cinematic-hero.css";

const VIDEO = publicAsset("media/intro/elevator-v2.mp4");
const POSTER = publicAsset("media/intro/elevator-v2-poster.webp");
const FINAL_FRAME = publicAsset("media/intro/elevator-v2-final.webp");

export default function CinematicHero() {
  const phase = useHeroPhase();
  const ready = phase === "HERO_READY";
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (ready) return;
    const video = videoRef.current!;
    const frame = frameRef.current!;
    let disposed = false;
    let finishing = false;
    let watchdog = 0;
    let playbackFallback = 0;
    let animationFrame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    // Mobile Safari decides whether autoplay is allowed as soon as the media is
    // inserted. Keep every required flag both in the markup and on the DOM node,
    // before any asynchronous work can delay the play request.
    video.defaultMuted = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    const release = () => {
      if (disposed) return;
      setHeroPhase("HERO_READY");
    };
    const finish = async () => {
      if (disposed || finishing) return;
      finishing = true;
      window.clearTimeout(watchdog);
      video.pause();
      setHeroPhase("INTRO_ENDING");
      // The decoded final image is already underneath the video. No opacity fade
      // between different poses and no dependency on an ended video staying painted.
      // Bound failed image loading too: even a stalled image must never trap the page.
      let imageTimeout = 0;
      try {
        await Promise.race([
          frame.decode(),
          new Promise<void>((resolve) => { imageTimeout = window.setTimeout(resolve, 1500); }),
        ]);
      } catch { /* Poster remains if the image fails. */ }
      window.clearTimeout(imageTimeout);
      if (disposed) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = requestAnimationFrame(release);
      });
    };
    const armWatchdog = () => {
      window.clearTimeout(watchdog);
      // Failure recovery only: playback progress resets this, never times the reveal.
      watchdog = window.setTimeout(() => { void finish(); }, 10_000);
    };
    const onPlaying = () => {
      if (finishing) { video.pause(); return; }
      window.clearTimeout(playbackFallback);
      setHeroPhase("INTRO_PLAYING");
      armWatchdog();
    };
    const onCanPlay = () => {
      window.clearTimeout(playbackFallback);
      // Give declarative autoplay priority. The delayed play() only recovers
      // browsers that loaded the video but did not honor the attribute.
      playbackFallback = window.setTimeout(() => {
        if (disposed || finishing || reducedMotion.matches || !video.paused) return;
        void video.play().catch(() => { if (!disposed) void finish(); });
      }, 250);
    };
    const onMotionChange = () => { if (reducedMotion.matches) void finish(); };
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", armWatchdog);
    reducedMotion.addEventListener("change", onMotionChange);
    armWatchdog();

    // Warm the final frame in parallel. finish() waits for it before removing the
    // video, while playback starts immediately inside the mobile autoplay window.
    void frame.decode().catch(() => { /* Poster remains if decoding fails. */ });
    if (reducedMotion.matches) {
      void finish();
    }

    return () => {
      disposed = true;
      video.pause();
      window.clearTimeout(watchdog);
      window.clearTimeout(playbackFallback);
      cancelAnimationFrame(animationFrame);
      video.removeEventListener("ended", finish);
      video.removeEventListener("error", finish);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", armWatchdog);
      reducedMotion.removeEventListener("change", onMotionChange);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [ready]);

  return (
    <section className="cinematic-hero" data-testid="cinematic-hero" data-phase={phase} aria-label="MV Multimarcas — Vista sua presença">
      <div className="cinematic-scene" aria-hidden="true">
        <img className="cinematic-media cinematic-poster" src={POSTER} alt="" width="1920" height="1080" fetchPriority="high" />
        <img ref={frameRef} className="cinematic-media cinematic-frame" src={FINAL_FRAME} alt="" width="1920" height="1080" fetchPriority="high" decoding="async"
          onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
        {!ready && <video ref={videoRef} className="cinematic-media cinematic-video" src={VIDEO} poster={POSTER}
          autoPlay muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback" tabIndex={-1} />}
        <div className="cinematic-shade" />
      </div>
      <div className="cinematic-content" inert={!ready} aria-hidden={!ready}>
        <p className="cinematic-eyebrow cinematic-reveal">MV Multimarcas <span /> Streetwear & sport</p>
        <h1 className="cinematic-title cinematic-reveal">Vista sua<br /><span>presença.</span></h1>
        <p className="cinematic-description cinematic-reveal">O estilo chega antes das palavras.<br />Peças para quem se move diferente.</p>
        <div className="cinematic-actions">
          <Link to="/#destaques" data-testid="hero-explore-btn" className="cinematic-primary cinematic-reveal">
            Explorar destaques <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link to="/#colecao" className="cinematic-secondary cinematic-reveal">Ver coleção <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
      <div className="cinematic-caption cinematic-reveal" aria-hidden="true"><span>ATITUDE EM CADA DETALHE</span><span>MV / MULTIMARCAS</span></div>
      <a href="#categorias" className="cinematic-scroll cinematic-reveal" tabIndex={ready ? 0 : -1} aria-hidden={!ready}>
        Descubra a coleção <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
}
