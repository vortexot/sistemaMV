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

const publicProducts = Array.from({ length: 8 }, (_, index) => ({
  ...product,
  id: index === 0 ? product.id : `mobile-product-${index + 1}`,
  sku: `MV-MOBILE-${String(index + 1).padStart(3, "0")}`,
  name: ["Camiseta MV Mobile", "Tênis MV Mobile", "Moletom MV Mobile", "Calça MV Mobile", "Short MV Mobile", "Boné MV Mobile", "Jaqueta MV Mobile", "Regata MV Mobile"][index],
  featured: index < 3,
}));

const publicCategories = [
  ["Camisetas", "camisetas"],
  ["Moletons", "moletons"],
  ["Tênis", "tenis"],
  ["Calças", "calcas"],
  ["Shorts", "shorts"],
  ["Acessórios", "acessorios"],
].map(([name, slug]) => ({
  id: `category-${slug}`,
  name,
  slug,
  description: "",
  image_file_id: null,
}));

const adminProduct = {
  ...product,
  category_id: "category-mobile",
  stock: 8,
  active: true,
  archived: false,
  created_at: "2026-09-22T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
};

async function stubPublicApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") {
      await route.fulfill({ status: 401, json: { detail: "Não autenticado" } });
      return;
    }
    if (pathname === "/api/catalog/products") {
      await route.fulfill({ json: publicProducts });
      return;
    }
    if (pathname === "/api/catalog/categories") {
      await route.fulfill({ json: publicCategories });
      return;
    }
    if (pathname === "/api/payments/status") {
      await route.fulfill({ json: { paypal_configured: false, paypal_mode: null } });
      return;
    }
    if (pathname === "/api/shipping/quote") {
      await route.fulfill({ json: {
        method: "motoboy",
        available: true,
        fee: 9,
        distance_km: 0,
        origin_store: "Valparaíso de Goiás",
        postal_code: "72871059",
        street: "Rua 59",
        neighborhood: "Jardim Céu Azul",
        city: "Valparaíso de Goiás",
        state: "GO",
      } });
      return;
    }
    await route.fulfill({ json: [] });
  });
}

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("public purchase journey remains usable across the mobile matrix", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubPublicApi(page);

  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : width === 768 ? 1024 : 844 });
    await page.goto("/");
    await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });
    await expect(page.getByTestId("shop-header")).toBeVisible();
    await expectNoPageOverflow(page);

    for (const anchor of ["shop-categories-title", "shop-featured-title", "shop-catalog-title", "faq-title"]) {
      await page.getByTestId(anchor).scrollIntoViewIfNeeded();
      await expectNoPageOverflow(page);
    }

    const headerTargets = ["shop-search-toggle", "shop-cart-link", "header-mobile-menu"];
    if (width < 768) {
      const headerBox = await page.getByTestId("shop-header").boundingBox();
      expect(headerBox?.height).toBeLessThanOrEqual(80);
      for (const testId of headerTargets) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(40);
        expect(box?.height).toBeGreaterThanOrEqual(40);
      }
    }
  }

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });
  const filters = page.getByTestId("shop-category-filter");
  await filters.scrollIntoViewIfNeeded();
  const filterButtons = filters.getByRole("button");
  await expect(filterButtons).toHaveCount(7);
  for (const button of await filterButtons.all()) {
    const box = await button.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/#destaques");
  const cards = page.locator('[data-testid^="product-card-"]');
  await expect(cards).toHaveCount(8);
  const cardIds = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
  expect(new Set(cardIds).size).toBe(cardIds.length);

  const collectionCards = page.locator('#colecao [data-testid^="product-card-"]');
  await expect(collectionCards).toHaveCount(5);
  const first = await collectionCards.nth(0).boundingBox();
  const second = await collectionCards.nth(1).boundingBox();
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThan(5);
  expect(first?.x).not.toBe(second?.x);

  await page.goto("/");
  await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });
  await page.locator(".cinematic-secondary").click();
  await expect.poll(() => page.locator("#colecao").evaluate((element) => Math.round(element.getBoundingClientRect().top)), { timeout: 4_000 }).toBeLessThanOrEqual(200);

  await page.getByTestId("add-cart-product-mobile-product").first().click();
  await page.goto("/carrinho");
  await expect(page.getByTestId("cart-item-mobile-product")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-page")).toBeVisible();
  const deliveryOption = page.getByRole("radio", { name: /Receber em casa/ });
  const pickupOption = page.getByRole("radio", { name: /Retirar na loja/ });
  await expect(deliveryOption).toBeChecked();
  await page.getByLabel("CEP").fill("72871-059");
  await page.getByRole("button", { name: "Calcular frete" }).click();
  await expect(page.getByTestId("motoboy-quote")).toContainText("R$ 9,00");
  await expect(page.getByTestId("checkout-total")).toContainText("R$ 78,90");
  await pickupOption.check();
  await expect(pickupOption).toBeChecked();
  await expect(page.getByTestId("fulfillment-method")).toContainText("Retirada grátis");
  await expect(page.getByTestId("checkout-page")).toContainText("Grátis — retirada");
  await expectNoPageOverflow(page);
});

test("cancelled PayPal flow preserves the cart and explains the recovery path", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const user = { id: "buyer", name: "Cliente Teste", email: "buyer@example.com", role: "comprador", status: "ativo" };
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") return route.fulfill({ json: user });
    if (pathname === "/api/catalog/products") return route.fulfill({ json: publicProducts });
    if (pathname === "/api/catalog/categories") return route.fulfill({ json: publicCategories });
    if (pathname === "/api/payments/status") return route.fulfill({ json: { paypal_configured: true, paypal_mode: "sandbox" } });
    if (pathname === "/api/orders") return route.fulfill({ json: { id: "order-cancel", number: "MV-1", items: [] } });
    if (pathname === "/api/payments/paypal/create") {
      return route.fulfill({ json: { approval_url: "http://localhost:3000/checkout?paypal=cancel&order_id=order-cancel" } });
    }
    if (pathname === "/api/payments/paypal/cancel") return route.fulfill({ json: { id: "order-cancel", number: "MV-1", items: [] } });
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });
  await page.getByTestId("add-cart-product-mobile-product").first().click();
  await page.goto("/checkout");
  await page.getByRole("radio", { name: /Retirar na loja/ }).check();
  await page.getByTestId("paypal-payment-button").first().click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId("checkout-item-mobile-product")).toBeVisible();
  await expect(page.getByText("Pagamento cancelado. Seus itens continuam no carrinho.")).toBeVisible();
});

test("menu, quick view and form remain accessible on a narrow dynamic viewport", async ({ page }) => {
  await stubPublicApi(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  // The intro intentionally keeps navigation inert until the real video finishes.
  await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });

  const menu = page.getByTestId("header-mobile-menu");
  await page.evaluate(() => window.scrollTo(0, 420));
  const backgroundScroll = await page.evaluate(() => window.scrollY);
  await menu.focus();
  await page.keyboard.press("Enter");
  const menuDialog = page.getByRole("dialog", { name: "Encontre sua direção." });
  await expect(menuDialog).toBeVisible();
  await expect(menuDialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("menu-search-input")).toBeFocused();
  await expect(menuDialog).toContainText("MV / Navegação");
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(backgroundScroll);

  const closeMenu = page.getByRole("button", { name: "Fechar menu" });
  await closeMenu.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("menu-search-input")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(closeMenu).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menuDialog).toBeHidden();
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

test("logo-derived gold stays an accent while neutral surfaces and category actions remain visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubPublicApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });

  const primaryCta = page.locator(".cinematic-primary");
  await expect(primaryCta).toBeVisible();
  await expect.poll(() => primaryCta.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("rgb(243, 202, 88)");
  await expect.poll(() => page.getByTestId("header-login-link").evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("rgb(224, 160, 24)");

  const categoryCards = page.locator('[data-testid^="category-card-"]');
  await categoryCards.first().scrollIntoViewIfNeeded();
  await expect(categoryCards).toHaveCount(6);
  for (const card of await categoryCards.all()) {
    const cardBox = await card.boundingBox();
    const arrowBox = await card.locator(".editorial-category-arrow").boundingBox();
    expect(arrowBox).not.toBeNull();
    expect((arrowBox?.x ?? 0) + (arrowBox?.width ?? 0)).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0));
    expect((arrowBox?.y ?? 0) + (arrowBox?.height ?? 0)).toBeLessThanOrEqual((cardBox?.y ?? 0) + (cardBox?.height ?? 0));
  }

  const manifesto = page.locator(".manifesto-section");
  await manifesto.scrollIntoViewIfNeeded();
  await expect.poll(() => manifesto.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("rgb(247, 244, 237)");

  const lookbook = page.locator(".lookbook-section");
  await lookbook.scrollIntoViewIfNeeded();
  await expect.poll(() => lookbook.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("rgb(247, 244, 237)");
  await expectNoPageOverflow(page);
});

test("plain Home reload starts at the top without leaving history restoration disabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubPublicApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1_000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  await expect.poll(() => page.evaluate(() => window.history.scrollRestoration)).toBe("auto");

  await page.getByTestId("shop-cart-link").click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.history.scrollRestoration)).toBe("auto");
  await page.goForward();
  await expect(page).toHaveURL(/\/carrinho$/);

  // A carga completa de uma rota interna não deve acionar a regra exclusiva da Home.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect.poll(() => page.evaluate(() => window.history.scrollRestoration)).toBe("auto");
});

test("Home reflows at a 200% desktop-zoom equivalent and with larger text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubPublicApi(page);

  // A 1440 × 900 display at 200% browser zoom exposes roughly a 720 × 450
  // CSS-pixel viewport, which exercises the same responsive breakpoints.
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto("/");
  await expect(page.getByTestId("cinematic-hero")).toHaveAttribute("data-phase", "HERO_READY", { timeout: 15_000 });
  for (const anchor of ["shop-categories-title", "shop-featured-title", "shop-catalog-title", "faq-title"]) {
    await page.getByTestId(anchor).scrollIntoViewIfNeeded();
    await expectNoPageOverflow(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 125% !important; }" });
  await page.getByTestId("shop-category-filter").scrollIntoViewIfNeeded();
  await expectNoPageOverflow(page);
  await page.getByTestId("faq-title").scrollIntoViewIfNeeded();
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
