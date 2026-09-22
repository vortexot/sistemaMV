import { test, expect, type Page } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const banner = (id: string, order = 0, active = true) => ({ id, order, active, title: `Oferta ${id}`, subtitle: '', image_file_id: id, link: '', alt_text: `Imagem ${id}`, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' });
async function images(page: Page) {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'admin', name: 'Admin Test', role: 'admin', status: 'ativo' } }));
  await page.route('**/api/files/*', route => route.fulfill({ contentType: 'image/png', body: png }));
}

test('presentation expands and exits native fullscreen', async ({ page }) => {
  await images(page);
  await page.route('**/api/admin/indoor', route => route.fulfill({ json: [banner('A')] }));
  await page.goto('/admin/midia-indoor/tv');
  await expect(page.getByRole('link', { name: 'Voltar ao Admin' })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir mídia', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('indoor-display');
  await expect(page.getByRole('button', { name: 'Sair da tela cheia' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao Admin' })).toHaveCount(0);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole('link', { name: 'Voltar ao Admin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expandir mídia', exact: true })).toBeVisible();
});

test('anonymous access redirects to login and never fetches media', async ({ page }) => {
  let fetchedMedia = false;
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { detail: 'Login required' } }));
  await page.route('**/api/admin/indoor', route => { fetchedMedia = true; return route.fulfill({ json: [] }); });
  await page.goto('/midia-indoor');
  await expect(page).toHaveURL(/\/login$/);
  expect(fetchedMedia).toBe(false);
  await expect(page.getByTestId('indoor-display')).toHaveCount(0);
});

test('customer cannot open staff presentation', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'buyer', name: 'Buyer', role: 'comprador' } }));
  await page.goto('/admin/midia-indoor/tv');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('indoor-display')).toHaveCount(0);
});

test('public store does not show or fetch indoor media', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: {} }));
  const mediaRequests: string[] = [];
  page.on('request', request => { if (/api\/(admin\/indoor|catalog\/banners)/.test(request.url())) mediaRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByTestId('shop-categories-title')).toBeVisible();
  await expect(page.getByTestId('shop-banner-carousel')).toHaveCount(0);
  expect(mediaRequests).toEqual([]);
});

test('ordered active images loop continuously and pause', async ({ page }) => {
  await images(page);
  await page.route('**/api/admin/indoor', route => route.fulfill({ json: [banner('B', 2), banner('hidden', 0, false), banner('A', 1)] }));
  await page.goto('/admin/midia-indoor/tv');
  await expect(page.getByAltText('Imagem A')).toBeVisible();
  await expect(page.getByAltText('Imagem hidden')).toHaveCount(0);
  await expect(page.getByAltText('Imagem B')).toBeVisible({ timeout: 8000 });
  await expect(page.getByAltText('Imagem A')).toHaveCount(0);
  await expect(page.getByAltText('Imagem A')).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Pausar apresentação' }).click();
  await page.waitForTimeout(5500);
  await expect(page.getByAltText('Imagem A')).toBeVisible();
  await expect(page.getByAltText('Imagem B')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('one image stays static and zero images is a clear empty state', async ({ page }) => {
  await images(page);
  let rows = [banner('A')];
  await page.route('**/api/admin/indoor', route => route.fulfill({ json: rows }));
  await page.goto('/admin/midia-indoor/tv');
  await expect(page.getByAltText('Imagem A')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pausar apresentação' })).toHaveCount(0);
  await page.waitForTimeout(5500);
  await expect(page.getByAltText('Imagem A')).toBeVisible();
  rows = [];
  await page.reload();
  await expect(page.getByText('Nenhuma promoção ativa.')).toBeVisible();
});

test('broken image is skipped', async ({ page }) => {
  await images(page);
  await page.route('**/api/files/broken', route => route.fulfill({ status: 404 }));
  await page.route('**/api/admin/indoor', route => route.fulfill({ json: [banner('broken'), banner('good', 1)] }));
  await page.goto('/admin/midia-indoor/tv');
  await expect(page.getByAltText('Imagem good')).toBeVisible();
});

test('admin uploads, edits, orders, toggles and deletes', async ({ page }) => {
  await images(page);
  let rows: ReturnType<typeof banner>[] = [];
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'admin', name: 'Admin Test', role: 'admin', status: 'ativo', email: 'test@example.com' } }));
  await page.route('**/api/files/upload', route => route.fulfill({ json: { id: 'uploaded' } }));
  await page.route('**/api/admin/banners*', async route => {
    const method = route.request().method();
    if (method === 'POST') { rows = [{ ...banner('new'), ...route.request().postDataJSON() }]; return route.fulfill({ json: rows[0] }); }
    if (method === 'GET') return route.fulfill({ json: rows });
    return route.fallback();
  });
  await page.route('**/api/admin/banners/*', async route => {
    if (route.request().method() === 'DELETE') { rows = []; return route.fulfill({ json: { ok: true } }); }
    rows[0] = { ...rows[0], ...route.request().postDataJSON() };
    return route.fulfill({ json: rows[0] });
  });
  await page.goto('/admin/midia-indoor');
  await page.getByTestId('admin-new-banner-button').click();
  await page.getByLabel('Título', { exact: true }).fill('Campanha teste');
  await page.getByLabel('Ordem de exibição (menor primeiro)').fill('3');
  await page.getByLabel('Texto alternativo: descreva a promoção').fill('Imagem promocional');
  await page.getByTestId('banner-image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Pré-visualização')).toBeVisible();
  await page.getByTestId('banner-form-submit').click();
  await expect(page.getByText('Campanha teste', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Desativar', exact: true }).click();
  await expect(page.getByText('Inativo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ativar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Campanha atualizada');
  await page.getByLabel('Ordem de exibição (menor primeiro)').fill('1');
  await page.getByLabel('Link opcional (https:// ou /caminho)').fill('/carrinho');
  await page.getByTestId('banner-form-submit').click();
  await expect(page.getByText('Campanha atualizada', { exact: true })).toBeVisible();
  expect(rows[0].order).toBe(1);
  expect(rows[0].link).toBe('/carrinho');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Excluir banner' }).click();
  await expect(page.getByTestId('admin-banners-empty')).toBeVisible();
});
