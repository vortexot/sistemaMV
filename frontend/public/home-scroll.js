(() => {
  const navigationEntry = performance.getEntriesByType?.("navigation")[0];
  const scriptPath = new URL(document.currentScript?.src ?? "/home-scroll.js", window.location.href).pathname;
  const basePath = scriptPath.replace(/\/home-scroll\.js$/, "").replace(/\/+$/, "");
  const currentPath = window.location.pathname.replace(/\/+$/, "");
  const isHome = currentPath === basePath;
  const isHistoryTraversal = navigationEntry?.type === "back_forward";

  // Explicit hashes are intentional deep links. Browser history traversals keep
  // their native restoration; fresh loads and reloads of the plain Home do not.
  if (!isHome || isHistoryTraversal || window.location.hash) return;

  const previousRestoration = window.history.scrollRestoration;
  const scrollToTop = () => window.scrollTo(0, 0);

  window.history.scrollRestoration = "manual";
  scrollToTop();

  window.addEventListener(
    "pageshow",
    () => {
      scrollToTop();
      window.requestAnimationFrame(() => {
        scrollToTop();
        window.history.scrollRestoration = previousRestoration;
      });
    },
    { once: true },
  );
})();
