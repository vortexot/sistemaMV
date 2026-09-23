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
