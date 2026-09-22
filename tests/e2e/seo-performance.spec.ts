import { expect, test, type Page } from "@playwright/test";

async function mockPublicApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") {
      await route.fulfill({ status: 401, json: { detail: "Não autenticado" } });
      return;
    }
    await route.fulfill({ json: [] });
  });
}

test("homepage exposes indexable metadata and matching FAQ schema", async ({ page }) => {
  await mockPublicApi(page);
  await page.goto("/");

  await expect(page).toHaveTitle("Streetwear e roupas esportivas | MV Multimarcas");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /streetwear/i);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://localhost:3000/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "http://localhost:3000/mv-logo.jpg");

  const schema = await page.locator("#mv-structured-data").textContent();
  expect(schema).toContain('"@type":"FAQPage"');
  expect(schema).toContain("Como encontro uma peça?");

  const hero = page.getByAltText("Modelos em streetwear premium");
  await expect(hero).toHaveAttribute("fetchpriority", "high");
  await expect(hero).toHaveAttribute("srcset", /640w/);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
});

test("unknown routes are explicitly noindex", async ({ page }) => {
  await mockPublicApi(page);
  await page.goto("/pagina-inexistente");

  await expect(page).toHaveTitle("Página não encontrada | MV Multimarcas");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator("#mv-structured-data")).toHaveCount(0);
});
