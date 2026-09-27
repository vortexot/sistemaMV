import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => new URL(route.request().url()).pathname === "/api/auth/me"
    ? route.fulfill({ status: 401, json: { detail: "Não autenticado" } })
    : route.fulfill({ json: [] }));
});

test("real intro ends on matching still; scroll, resize and route return never replay", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const evidence = { plays: 0, ended: 0, frameDifference: -1 };
    Object.assign(window, { heroEvidence: evidence });
    document.addEventListener("play", event => {
      if ((event.target as HTMLElement).classList?.contains("cinematic-video")) evidence.plays++;
    }, true);
    document.addEventListener("ended", event => {
      const video = event.target as HTMLVideoElement;
      if (!video.classList?.contains("cinematic-video")) return;
      evidence.ended++;
      const img = document.querySelector<HTMLImageElement>(".cinematic-frame")!;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0);
      const finalVideo = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.drawImage(img, 0, 0);
      const still = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let difference = 0;
      for (let i = 0; i < still.length; i += 4) {
        difference += Math.abs(still[i] - finalVideo[i]) + Math.abs(still[i + 1] - finalVideo[i + 1]) + Math.abs(still[i + 2] - finalVideo[i + 2]);
      }
      evidence.frameDifference = difference / (canvas.width * canvas.height * 3);
    }, true);
  });
  await page.goto("/");
  const hero = page.getByTestId("cinematic-hero");
  await expect(hero).toHaveAttribute("data-phase", "INTRO_PLAYING", { timeout: 15_000 });
  const video = page.locator(".cinematic-video");
  expect(await video.evaluate((v: HTMLVideoElement) => ({
    loop: v.loop,
    muted: v.muted,
    defaultMuted: v.defaultMuted,
    autoplay: v.autoplay,
    playsInline: v.playsInline,
    controls: v.controls,
  }))).toEqual({ loop: false, muted: true, defaultMuted: true, autoplay: true, playsInline: true, controls: false });
  await expect(page.locator(".cinematic-content")).toHaveAttribute("inert", "");
  const framing = await page.locator(".cinematic-media").evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, fit: style.objectFit, position: style.objectPosition };
  }));
  expect(framing[0]).toEqual(framing[1]);
  expect(framing[1]).toEqual(framing[2]);
  await expect(hero).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });
  await expect(video).toHaveCount(0);
  await expect(page.getByTestId("hero-explore-btn")).toBeVisible();
  await expect(page.locator(".cinematic-content")).not.toHaveAttribute("inert");
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  const evidence = await page.evaluate(() => (window as unknown as { heroEvidence: { plays: number; ended: number; frameDifference: number } }).heroEvidence);
  expect(evidence.plays).toBe(1);
  expect(evidence.ended).toBe(1);
  expect(evidence.frameDifference).toBeGreaterThanOrEqual(0);
  expect(evidence.frameDifference).toBeLessThan(3);
  await testInfo.attach("decoded-frame-comparison", { body: JSON.stringify(evidence), contentType: "application/json" });
  await expect(page.locator(".cinematic-secondary")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("hero-ready.png") });
  await page.getByTestId("hero-explore-btn").click();
  await expect(page).toHaveURL(/#destaques$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.evaluate(() => scrollTo(0, 0));
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(hero).toHaveAttribute("data-phase", "HERO_READY");
  await expect(video).toHaveCount(0);
  await page.getByTestId("shop-cart-link").click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await page.getByTestId("header-logo").click();
  await expect(hero).toHaveAttribute("data-phase", "HERO_READY");
  await expect(video).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { heroEvidence: { plays: number } }).heroEvidence.plays)).toBe(1);
  await page.reload();
  await expect(hero).toHaveAttribute("data-phase", "INTRO_PLAYING", { timeout: 15_000 });
});

for (const failure of ["reduced-motion", "autoplay-blocked", "video-error", "image-error", "video-stalled"] as const) {
  test(`${failure} releases the page with static hero`, async ({ page }) => {
    if (failure === "reduced-motion") await page.emulateMedia({ reducedMotion: "reduce" });
    if (failure === "autoplay-blocked") await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Blocked", "NotAllowedError"));
    });
    if (failure === "video-error") await page.route("**/intro/elevator-v2.mp4", route => route.abort());
    if (failure === "image-error") await page.route("**/intro/elevator-v2-final.webp", route => route.abort());
    if (failure === "video-stalled") await page.route("**/intro/elevator-v2.mp4", async route => {
      await new Promise(resolve => setTimeout(resolve, 15_000));
      await route.abort();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 18_000 });
    await expect(page.locator(".cinematic-video")).toHaveCount(0);
    await expect(page.getByTestId("hero-explore-btn")).toBeVisible();
    await expect(page.getByTestId("shop-header")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
