import { expect, test } from '@playwright/test';

test('login, logout and email recovery use the hardened API contract', async ({ page }) => {
  let signedIn = false;
  let logoutUnavailable = true;
  const calls: string[] = [];
  const user = { id: 'synthetic', name: 'Cliente Teste', email: 'synthetic@example.com', role: 'comprador', status: 'ativo' };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    calls.push(path);
    if (path === '/api/auth/me') return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? user : { detail: 'Não autenticado' } });
    if (path === '/api/auth/login') {
      expect(route.request().postDataJSON()).toEqual({ email: user.email, password: 'Synthetic browser password!' });
      signedIn = true;
      return route.fulfill({ json: user });
    }
    if (path === '/api/auth/logout') {
      if (logoutUnavailable) return route.fulfill({ status: 503, json: { detail: 'Synthetic outage' } });
      signedIn = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/auth/forgot-password') return route.fulfill({ json: { message: 'Se o e-mail estiver cadastrado, as instruções serão enviadas.' } });
    if (path === '/api/auth/reset-password') {
      expect(route.request().postDataJSON()).toEqual({ token: 'synthetic-email-code-12345678901234567890', new_password: 'New synthetic browser password!' });
      return route.fulfill({ json: { message: 'Senha redefinida. Entre novamente.' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/login');
  await expect(page.getByTestId('google-login-button')).toHaveCount(0);
  await page.getByTestId('login-email-input').fill(user.email);
  await page.getByTestId('login-password-input').fill('Synthetic browser password!');
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('dashboard-logout-button').click();
  await expect(page.getByText('Não foi possível encerrar a sessão. Verifique sua conexão e tente novamente.')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  logoutUnavailable = false;
  await page.getByTestId('dashboard-logout-button').click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls).toContain('/api/auth/logout');
  await page.goto('/login');
  await page.getByTestId('forgot-password-link').click();
  await page.getByTestId('forgot-email-input').fill(user.email);
  await page.getByTestId('forgot-submit-button').click();
  await expect(page.getByTestId('forgot-reset-token')).toHaveCount(0);
  await page.locator('#reset-token').fill('synthetic-email-code-12345678901234567890');
  await page.getByTestId('reset-password-input').fill('New synthetic browser password!');
  await page.getByTestId('reset-submit-button').click();
  await expect(page.getByTestId('forgot-password-dialog')).not.toBeVisible();
  expect(calls).toContain('/api/auth/reset-password');
});

test('registration stays unauthenticated until the email token is confirmed', async ({ page }) => {
  const email = 'new-owner@example.com';
  const password = 'Synthetic registration password!';
  let verificationCalls = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ status: 401, json: { detail: 'Não autenticado' } });
    if (path === '/api/auth/register') {
      expect(route.request().postDataJSON()).toEqual({ name: 'Address Owner', email, password });
      return route.fulfill({ status: 202, json: { message: 'Confira seu e-mail para continuar.' } });
    }
    if (path === '/api/auth/verify-email') {
      verificationCalls += 1;
      expect(route.request().postDataJSON()).toEqual({ token: 'v'.repeat(48), password });
      return route.fulfill({ json: { message: 'E-mail confirmado. Entre com sua senha.' } });
    }
    if (path === '/api/auth/resend-verification') {
      expect(route.request().postDataJSON()).toEqual({ email, password });
      return route.fulfill({ status: 202, json: { message: 'Se aplicável, enviaremos novas instruções.' } });
    }
    return route.fulfill({ status: 404, json: { detail: 'Not found' } });
  });

  await page.goto('/login');
  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByTestId('register-name-input').fill('Address Owner');
  await page.getByTestId('register-email-input').fill(email);
  await page.getByTestId('register-password-input').fill(password);
  await page.getByTestId('register-submit-button').click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('email-verification-panel')).toBeVisible();
  await page.getByTestId('verification-resend-button').click();
  await page.getByTestId('verification-token-input').fill('v'.repeat(48));
  await page.getByTestId('verification-submit-button').click();
  await expect(page.getByTestId('login-email-input')).toHaveValue(email);
  expect(verificationCalls).toBe(1);
});

test('signing in from checkout returns to the preserved purchase', async ({ page }) => {
  const user = { id: 'buyer', name: 'Cliente Teste', email: 'buyer@example.com', role: 'comprador', status: 'ativo' };
  let signedIn = false;
  await page.addInitScript(() => {
    localStorage.setItem('gs-cart-v1', JSON.stringify([{
      product_id: 'product', name: 'Camiseta MV', brand: 'MV', sku: 'MV-1',
      price: 89.9, promo_price: null, image_file_id: null, qty: 1,
    }]));
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? user : { detail: 'Não autenticado' } });
    if (path === '/api/auth/login') {
      signedIn = true;
      return route.fulfill({ json: user });
    }
    if (path === '/api/payments/status') return route.fulfill({ json: { paypal_configured: true, paypal_mode: 'sandbox' } });
    return route.fulfill({ json: [] });
  });

  await page.goto('/checkout');
  await page.getByRole('radio', { name: /Retirar na loja/ }).check();
  await page.getByTestId('paypal-payment-button').first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByTestId('login-email-input').fill(user.email);
  await page.getByTestId('login-password-input').fill('Synthetic browser password!');
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId('checkout-item-product')).toBeVisible();
});
