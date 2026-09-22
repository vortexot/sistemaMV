# MV Multimarcas — SPEC

E-commerce premium de roupas esportivas e streetwear multimarcas (pt-BR). Identidade preto/dourado
metálico (extraída da logo): fundo #0B0B0B, cards #151515, acento dourado #DAA520, dourado
profundo #A07C1B, texto #BDBDBD. Logo em `frontend/public/mv-logo.jpg` (emblema com coroa + MV),
renderizada pelo componente `components/shop/BrandMark.tsx` (header, footer, login, admin, 404,
callback). Fontes: Outfit (heading) + Plus Jakarta Sans (body). Site dark-by-default.

## Stack
- Backend: FastAPI + motor (MongoDB `app`), Pydantic v2, JWT (HS256) + bcrypt, cookies httpOnly
  (`gs_access_token` 30min / `gs_refresh_token` 7d, samesite=lax), uvicorn :8001 (`--reload`).
- Frontend: Vite :3000, React 19 + TS strict + TanStack Query + Tailwind v4 + shadcn (base-nova),
  fontes Outfit/Plus Jakarta Sans, motion/react. Chamadas só por `/api/...` (src/lib/api.ts).
- Object storage local: `STORAGE_DIR=/app/backend/storage/uploads`, servido em GET /api/files/{file_id}.

## Perfis (RBAC aplicado no backend, não só no frontend)
- **ADMIN** — acesso total: CRUD de produtos/categorias/banners, upload de imagens, clientes
  (mudar perfil/status), status de pedidos, ajuste de estoque, relatórios, dashboard.
- **ATENDENTE** — somente visualização: dashboard, pedidos, clientes, estoque, relatórios.
  Não pode excluir produtos, alterar permissões nem configurações.
- **COMPRADOR** — vitrine, carrinho, checkout, favoritos, pedidos próprios, dados pessoais.
  /admin redireciona comprador para /dashboard (e o backend devolve 403 nas rotas admin).

## Autenticação
- Rotas: POST /api/auth/register | login | refresh | logout, GET /api/auth/me,
  POST /api/auth/forgot-password | reset-password, POST /api/auth/google/session.
- JWT access+refresh em cookies httpOnly; refresh com rotação + coleção revoked_tokens (jti);
  `token_version` no user invalida tudo ao resetar senha; lockout: 5 falhas em 15min → 429;
  tokens de reset expiram em 30min (TTL index). Sem e-mail provider: forgot-password devolve
  o token na própria resposta (modo demonstração, mensagem genérica quando e-mail inexistente).
- Google: frontend redireciona para auth.emergentagent.com com redirect=origin+/auth/callback
  (NUNCA hardcodar/fallback), callback detecta #session_id=, backend troca por sessão e emite
  os JWT próprios. Respostas de auth NUNCA contêm password_hash, tokens ou segredos.

## Loja pública
- `/` — header fixo glass (logo MV, Coleção/Categorias/Destaques, **campo de busca**, login,
  carrinho com contador `shop-cart-count`), hero escura ("Vista sua presença."), marquee animado,
  carrossel de banners do admin (`shop-banner-carousel`, auto-rotação 6s com setas/dots, oculto se
  não houver banner ativo), grid de 6 categorias com hover dourado, seção Destaques (featured),
  Coleção com filtro `/?cat=<slug>`, manifesto, footer. Cards têm "Vista rápida"
  (`quick-view-product-<id>`) abrindo modal com zoom na imagem, tamanhos, cores, quantidade e
  adicionar ao carrinho. Transições de página douradas (`PageTransition`, na loja e no admin).
- **Busca**: header (`shop-search-input` desktop/`mobile-search-input` + `shop-search-toggle` no
  mobile, `menu-search-input` no menu) navega para `/?q=<termo>#colecao`; a seção Coleção tem o
  campo `catalog-search-input` sincronizado com `?q=`, resumo de resultados
  (`catalog-search-summary` / `catalog-search-count`), limpar busca e estado vazio dedicado
  (`shop-catalog-empty` + `shop-catalog-empty-reset`). Filtra por nome, marca, categoria e SKU,
  combinando com o filtro de categoria (`?cat=` + `?q=` coexistem na URL).
- `/carrinho` — carrinho em localStorage (`gs-cart-v1`), ± quantidade, remover, subtotal,
  descontos, total, estado vazio, "Continuar comprando" e "Finalizar compra".
- `/checkout` — resumo + área PayPal. GET /api/payments/status define `paypal_configured`
  (+ `paypal_mode`). O fluxo PayPal real (Orders v2, `backend/lib/paypal.py` via httpx, sem SDK)
  está implementado: POST /api/orders cria o pedido "Pagamento pendente" e reserva estoque →
  POST /api/payments/paypal/create gera a ordem no PayPal e devolve o `approval_url` (redirect) →
  o cliente aprova no PayPal → retorno em /checkout?paypal=return&order_id=… →
  POST /api/payments/paypal/capture captura e marca "Pagamento aprovado"/`payment_status=pago`
  (idempotente) → /checkout?paypal=cancel chama POST /api/payments/paypal/cancel, que devolve o
  estoque e cancela o pedido. Sem PAYPAL_CLIENT_ID/SECRET no .env: botão `paypal-payment-button`
  desabilitado, "PayPal indisponível no momento" + "Nenhuma cobrança foi realizada", e as rotas
  de pagamento respondem 503 — nenhum pedido/pagamento falso é criado. Credenciais só no backend
  (PAYPAL_MODE=sandbox|live); erros do provedor nunca vazam detalhes ao cliente.

## Painel admin (/admin, sidebar preto+dourado; mobile = nav horizontal)
Dashboard (KPIs produtos ativos/clientes/pedidos/estoque baixo + resumo + welcome) · Produtos
(CRUD + upload de imagem + destaque/ativo/arquivar) · Categorias (CRUD + imagem + ordem) ·
Banners (CRUD + imagem + status, exibição futura na home) · Pedidos (estado vazio preparado,
status alterável pelo admin) · Clientes (nome/email/perfil/data/status, troca de perfil pelo
admin, nunca senha/hash) · Estoque (SKU, estoque atual, baixo, sem estoque, ajuste rápido) ·
Relatórios (pedidos, vendas, ticket médio, top produtos, clientes, estoque baixo — estados
vazios informativos sem inventar vendas) · Sair.

## Entidades/coleções
users, products, categories, banners, files, product_images, orders, order_items, payments,
shipments, addresses, favorites, reviews, coupons, carts, cart_items, login_attempts,
password_reset_tokens, revoked_tokens (índices em backend/lib/db.py; revocation/reset com TTL).
Carrinho/cartItems ficam no localStorage por design. Nenhuma resposta expõe `_id` do Mongo.

## API — mapa rápido
- Público: GET /api/catalog/products(?category&search&featured) | /{id}, GET /api/catalog/categories,
  GET /api/catalog/banners (ativos), GET /api/files/{file_id}, GET /api/payments/status.
- Usuário: GET/POST /api/favorites (+ /{id}/toggle), GET /api/orders/mine, GET /api/orders/{id},
  POST /api/orders (requer login; valida estoque/preço no servidor),
  POST /api/payments/paypal/create | capture | cancel (requer login; 503 sem credenciais).
- Upload: POST /api/files/upload (ADMIN; multipart ≤ 8MB; jpg/jpeg/png/webp/gif; MIME+tamanho+
  nome validados; UUID no caminho; metadados em files; storage_path nunca sai do backend).
- Admin: GET/POST/PATCH/DELETE em /api/admin/products|categories|banners; GET dashboard,
  customers, orders, stock, reports; PATCH /api/admin/customers/{id} (role/status),
  /api/admin/orders/{id} (status), /api/admin/stock/{id} (estoque).

## Seed (`backend/seed.py`, idempotente)
6 categorias com imagem, 10 produtos (2 SEM imagem de propósito → fallback visual), 2 banners,
3 contas (abaixo). Imagens baixadas para o object storage e servidas via /api/files/{file_id}.

## Notas de teste
- Contas: ver `memory/test_credentials.md`.
- PayPal bloqueado é comportamento esperado (sem credenciais reais).
- Upload admin: máx 8MB; formatos jpg/jpeg/png/webp/gif.
- Produto criado no admin aparece na vitrine imediatamente (invalidação de queries ["catalog"]).