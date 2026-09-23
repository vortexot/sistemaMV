# MV Multimarcas

Loja virtual com catálogo, carrinho, pedidos, integração PayPal, área do cliente,
painel administrativo e apresentação de mídia para a loja física.

## Arquitetura

- `frontend/`: Vite, React 19, TypeScript e Tailwind CSS.
- `backend/`: FastAPI, MongoDB e armazenamento de imagens em volume persistente.
- `tests/`: testes de navegador com Playwright.
- `vercel.ts`: build do frontend, cabeçalhos HTTP, fallback da SPA e proxy `/api`.

O frontend usa o prefixo relativo `/api`. Em desenvolvimento, o Vite encaminha
esse prefixo para o FastAPI. Na Vercel, o mesmo prefixo é encaminhado para a
origem externa configurada em `BACKEND_ORIGIN`.

## Desenvolvimento local

Requisitos: Node.js, npm, Python 3.12 e MongoDB.

Copie `backend/.env.example` para `backend/.env` e preencha apenas valores locais.
Depois execute em terminais separados:

```powershell
cd backend
python -m pip install --require-hashes -r requirements.lock
python -m uvicorn server:app --host 127.0.0.1 --port 8001 --reload
```

```powershell
cd frontend
npm ci
npm run dev
```

O site estará em `http://localhost:3000`. O script `INICIAR-PROJETO.cmd` também
prepara e inicia o ambiente local no Windows.

## Configuração do backend

Variáveis principais estão documentadas em `backend/.env.example`.

- `MONGO_URL` e `DB_NAME`: conexão e banco MongoDB.
- `JWT_SECRET`: segredo aleatório com no mínimo 32 bytes; obrigatório em produção.
- `PUBLIC_ORIGIN`: origem HTTPS pública exata.
- `CORS_ORIGINS`: lista de origens HTTPS confiáveis, sem curingas.
- `FORWARDED_ALLOW_IPS`: IPs ou CIDRs dos proxies que realmente chegam ao Uvicorn.
- `STORAGE_DIR`: caminho do volume persistente de uploads.
- `STORAGE_PERSISTENT=true`: confirmação explícita de que o volume é durável.
- `PAYMENTS_PAUSED`: mantenha `true` até validar as credenciais e o fluxo PayPal.
- `PAYPAL_MODE`, `PAYPAL_CLIENT_ID` e `PAYPAL_CLIENT_SECRET`: configuração PayPal.
- `RESET_WEBHOOK_URL`, `RESET_WEBHOOK_TOKEN` e `RESET_WEBHOOK_ALLOWED_HOSTS`:
  entrega de recuperação de senha.

Segredos pertencem somente ao backend. Variáveis com prefixo `VITE_` são públicas
e nunca devem conter chaves, tokens, senhas ou strings de conexão.

## Frontend na Vercel

O frontend pode ser publicado na Vercel depois que o backend estiver disponível
em outra hospedagem HTTPS com MongoDB e armazenamento persistentes. Configure:

- `BACKEND_ORIGIN`: origem HTTPS externa do FastAPI, sem `/api` e sem barra final.
- `VITE_SITE_URL`: URL pública final do site.
- `VITE_GA_MEASUREMENT_ID`: opcional; deixe vazio para não carregar Analytics.
- dados públicos opcionais `VITE_BUSINESS_*` descritos em `frontend/.env.example`.

`vercel.ts` bloqueia a configuração quando `BACKEND_ORIGIN` está ausente ou não é
uma origem HTTPS válida. O backend, o MongoDB e uploads não são executados na
Vercel por esta configuração. O armazenamento local efêmero de funções serverless
não atende aos uploads deste sistema.

No backend de produção, configure um proxy confiável para substituir cabeçalhos
de encaminhamento e iniciar o Uvicorn com `--proxy-headers` e uma allowlist exata
em `--forwarded-allow-ips`. Não exponha a origem diretamente nem use `*`.

## Uploads legados

Arquivos só são servidos quando o registro possui `access: "public_asset"`.
Registros antigos sem classificação permanecem privados. Para revisar imagens
antigas que ainda são referenciadas por produtos, categorias ou banners:

```powershell
cd backend
python scripts/classify_legacy_public_assets.py
```

O comando é somente leitura por padrão. Faça backup do banco e do volume, revise
as contagens e use `--apply` apenas no ambiente correto. Arquivos desconhecidos
não são classificados automaticamente.

## Mídia da loja

Administradores gerenciam as imagens em `/admin/midia-indoor`; administradores e
atendentes podem abrir a apresentação em `/admin/midia-indoor/tv`. A criação,
edição e exclusão continuam exclusivas de administrador. Imagens aceitas: JPG,
PNG, WEBP e GIF, até 8 MB e 40 megapixels.

## Validação

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

```powershell
# A partir da raiz do projeto:
.\scripts\test-security.ps1
cd backend
python -c "import server"
```

O GitHub Pages publica somente uma visualização estática do catálogo. Login,
pedidos, pagamentos, painel administrativo e uploads exigem o backend completo.
Consulte `PRODUCTION_SECURITY_REPORT.md` para o estado da preparação de produção.
Os procedimentos operacionais ficam em `ADMIN_MFA_RECOVERY.md`,
`PRODUCTION_SECRET_ROTATION.md`, `PAYPAL_SANDBOX_TEST.md` e
`PRODUCTION_INFRA_CHECKLIST.md`; a rastreabilidade ASVS fica em
`ASVS_SECURITY_MATRIX.md`.

Os testes de segurança iniciam uma réplica MongoDB temporária em uma porta local
aleatória, usam apenas dados sintéticos e substituem integrações HTTP externas.
O script requer `.local/mongodb/mongod.exe` e o ambiente Python do backend.
Não use um banco operacional em `SECURITY_TEST_MONGO_URL`.

`requirements.txt` declara as dependências; `requirements.lock` fixa as versões e
hashes verificadas. Atualizações do lock exigem nova auditoria e testes.
