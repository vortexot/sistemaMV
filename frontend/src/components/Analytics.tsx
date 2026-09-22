import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
const enabled = /^G-[A-Z0-9]+$/.test(measurementId ?? "");

export default function Analytics() {
  const location = useLocation();

  useEffect(() => {
    if (!enabled || !measurementId) return;
    if (!document.querySelector("script[data-mv-analytics]")) {
      const script = document.createElement("script");
      script.async = true;
      script.dataset.mvAnalytics = "true";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer ?? [];
      window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
      window.gtag("js", new Date());
      window.gtag("config", measurementId, { send_page_view: false });
    }

    window.gtag?.("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${location.pathname}${location.search}`,
    });
  }, [location.pathname, location.search]);

  return null;
}
