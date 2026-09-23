import { expect, test, type Page } from "@playwright/test";

const product = {
  id: "mobile-product",
  name: "Camiseta MV Mobile",
  sku: "MV-MOBILE-001",
  brand: "MV Multimarcas",
  category_name: "Camisetas",
  category_slug: "camisetas",
  price: 89.9,
  promo_price: 69.9,
  in_stock: true,
  sizes: ["P", "M", "G"],
  colors: ["Preto"],
  description: "Produto sintético usado somente no teste responsivo.",
  tag: "novo",
  featured: true,
  image_file_id: null,
};

const adminProduct = {
  ...product,
  category_id: "category-mobile",
  stock: 8,
  active: true,
  archived: false,
  created_at: "2026-09-22T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
};

async function mockPublicApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") {
      await route.fulfill({ status: 401, json: { detail: "Não autenticado" } });
      return;
    }
    if (pathname === "/api/catalog/products") {
      await route.fulfill({ json: [product, { ...product, id: "mobile-product-2", sku: "MV-MOBILE-002", name: "Tênis MV Mobile" }] });
      return;
    }
    if (pathname === "/api/catalog/categories") {
      await route.fulfill({ json: [{ id: "category-mobile", name: "Camisetas", slug: "camisetas", description: "", image_file_id: null }] });
      return;
    }
    if (pathname === "/api/payments/status") {
      await route.fulfill({ json: { paypal_configured: false, paypal_mode: null } });
      return;
    }
    await route.fulfill({ json: [] });
  });
}

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("public purchase journey remains usable across the mobile matrix", async ({ page }) => {
  await mockPublicApi(page);

  for (const width of [320, 360, 375, 390, 412, 430, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
    await page.goto("/");
    await expect(page.getByTestId("shop-header")).toBeVisible();
    await expectNoPageOverflow(page);

    for (const anchor of ["shop-categories-title", "shop-featured-title", "shop-catalog-title", "faq-title"]) {
      await page.getByTestId(anchor).scrollIntoViewIfNeeded();
      await expectNoPageOverflow(page);
    }

    const headerTargets = ["shop-search-toggle", "shop-cart-link", "header-mobile-menu"];
    if (width < 768) {
      for (const testId of headerTargets) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(40);
        expect(box?.height).toBeGreaterThanOrEqual(40);
      }
    }
  }

  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/#destaques");
  const cards = page.locator('[data-testid^="product-card-"]');
  await expect(cards).toHaveCount(4);
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThan(5);
  expect(first?.x).not.toBe(second?.x);

  await page.getByTestId("add-cart-product-mobile-product").first().click();
  await page.goto("/carrinho");
  await expect(page.getByTestId("cart-item-mobile-product")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-page")).toBeVisible();
  await expectNoPageOverflow(page);
});

test("menu, quick view and form remain accessible on a narrow dynamic viewport", async ({ page }) => {
  await mockPublicApi(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");

  const menu = page.getByTestId("header-mobile-menu");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("header-nav-mobile")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();

  await page.getByTestId("shop-featured-title").scrollIntoViewIfNeeded();
  await page.getByTestId("quick-view-product-mobile-product").first().click();
  const dialog = page.getByTestId("quick-view-dialog-mobile-product");
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.x).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(320);
  expect(dialogBox?.height).toBeLessThanOrEqual(568);
  await page.keyboard.press("Escape");

  await page.goto("/login");
  await page.setViewportSize({ width: 390, height: 500 });
  const password = page.getByTestId("login-password-input");
  await password.scrollIntoViewIfNeeded();
  await password.focus();
  const passwordBox = await password.boundingBox();
  expect(passwordBox?.y).toBeGreaterThanOrEqual(0);
  expect((passwordBox?.y ?? 0) + (passwordBox?.height ?? 0)).toBeLessThanOrEqual(500);
  await expectNoPageOverflow(page);
});

test("admin keeps wide data inside its focusable table region", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") {
      await route.fulfill({ json: { id: "admin-mobile", name: "Admin Mobile", email: "admin@example.com", role: "admin", status: "ativo", picture: null, created_at: "2026-09-22T00:00:00Z" } });
      return;
    }
    if (pathname === "/api/admin/products") {
      await route.fulfill({ json: [adminProduct, { ...adminProduct, id: "admin-product-2", sku: "MV-MOBILE-002" }] });
      return;
    }
    if (pathname === "/api/admin/categories") {
      await route.fulfill({ json: [{ id: "category-mobile", name: "Camisetas", slug: "camisetas", description: "", order: 0, active: true, image_file_id: null, created_at: "2026-09-22T00:00:00Z" }] });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/produtos");
  await expect(page.getByTestId("admin-products-table")).toBeVisible();
  await expectNoPageOverflow(page);
  const tableRegion = page.locator('[data-slot="table-container"]');
  await expect(tableRegion).toHaveAttribute("tabindex", "0");
  expect(await tableRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});
