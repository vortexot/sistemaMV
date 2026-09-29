import { expect, test } from "@playwright/test";

for (const { name, width, height } of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`header stays integrated with the Hero on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/me") return route.fulfill({ status: 401, json: { detail: "Não autenticado" } });
      if (path === "/api/catalog/products" || path === "/api/catalog/categories") return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });

    await page.goto("/");
    const header = page.getByTestId("shop-header");
    const hero = page.getByTestId("cinematic-hero");
    await expect(hero).toHaveAttribute("data-phase", "HERO_READY");
    await expect(header).toHaveAttribute("data-scroll-state", "top");

    const initial = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('[data-testid="shop-header"]')!;
      const hero = document.querySelector<HTMLElement>('[data-testid="cinematic-hero"]')!;
      const headerRect = header.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      return {
        header: { top: headerRect.top, bottom: headerRect.bottom },
        hero: { top: heroRect.top, bottom: heroRect.bottom },
        background: getComputedStyle(header).backgroundColor,
        blur: getComputedStyle(header).backdropFilter,
      };
    });
    expect(initial.header.top).toBe(0);
    expect(initial.hero.top).toBe(0);
    expect(initial.hero.bottom).toBeGreaterThan(initial.header.bottom);
    expect(initial.background).toContain("0.18");
    expect(initial.blur).toContain("2px");

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 0.4));
    await expect(header).toHaveAttribute("data-scroll-state", "transition");
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    await expect(header).toHaveAttribute("data-scroll-state", "solid");

    if (width < 1024) {
      await page.getByTestId("header-mobile-menu").click();
      await expect(page.getByTestId("mobile-menu-dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("mobile-menu-dialog")).toBeHidden();
    } else {
      await expect(page.getByTestId("header-nav-desktop")).toBeVisible();
    }
  });
}

test("internal pages keep a legible solid header", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: { detail: "Não autenticado" } }));
  await page.goto("/login");
  await expect(page.getByTestId("shop-header")).toHaveAttribute("data-scroll-state", "solid");
});
