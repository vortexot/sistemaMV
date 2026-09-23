# Relatório de implantação de staging

Atualizado em 2026-09-23. Este documento não contém credenciais, tokens, connection strings, IPs públicos ou dados reais.

## Deploy

Frontend: Vercel, projeto exclusivo `mv-multimarcas-staging`, publicado em `https://mv-multimarcas-staging.vercel.app`.

Backend: Render Free, serviço exclusivo `mv-multimarcas-api-staging`, publicado em `https://mv-multimarcas-api-staging.onrender.com`. O Blueprint em `render.yaml` foi validado pela CLI oficial. O plano gratuito pode dormir após 15 minutos sem requests; uma nova chamada à API o reativa e pode sofrer cold start.

Banco e storage: projeto Atlas exclusivo `mv-multimarcas-staging-runtime`, cluster M0 `mv-staging` em AWS `US_EAST_1`, MongoDB 8.0.32, 0,5 GB e proteção contra encerramento ativa. Metadados e bytes de imagens ficam no Atlas; os bytes usam GridFS e não dependem do filesystem efêmero do Render.

Implementação de referência: commit `39cc549`; tag anterior à implantação `pre-staging-final-2026-09-23`.

Arquitetura validada: React/Vite na Vercel, proxy `/api` da Vercel para FastAPI/Uvicorn no Render, MongoDB Atlas com transações e GridFS, autenticação própria com cookies/JWT e MFA TOTP. PayPal permanece pausado.

## Infraestrutura

HTTPS: aprovado nas duas URLs públicas.

CORS: aprovado. A origem exata da Vercel recebe `Access-Control-Allow-Origin`; uma origem não confiável recebe `400` sem o header.

Proxy: Render encerra TLS e controla o caminho até o container. `FORWARDED_ALLOW_IPS=*` só é aceito quando o próprio Render identifica o processo como web service; fora desse contexto o startup falha.

Rede do banco: autenticação, TLS e usuário de menor privilégio aprovados. Somente os dois CIDRs compartilhados de saída do Render em Virginia permanecem autorizados; a entrada local de bootstrap expira automaticamente. Não foi usada allowlist global.

Storage: `STORAGE_BACKEND=gridfs` e `STORAGE_PERSISTENT=true`. Upload, deduplicação e leitura passaram remotamente. O arquivo sintético continuou acessível após substituição das instâncias do Render.

Secrets: `MONGO_URL`, `JWT_SECRET` e `MFA_ENCRYPTION_KEY` foram enviados ao ambiente do Render sem exposição em logs ou Git. `BACKEND_ORIGIN` e `VITE_SITE_URL` foram configurados somente no projeto de staging da Vercel.

Logs: build, startup, falha fechada inicial e execução normal foram inspecionados. Nenhum segredo apareceu nos trechos revisados.

Alertas: **AÇÃO DO RESPONSÁVEL** — escolher um coletor externo antes de conectar os eventos `security.alert`.

Inventário principal:

| Variável | Classe | Destino |
| --- | --- | --- |
| `APP_ENV`, `DB_NAME`, `MFA_REQUIRED`, `PAYMENTS_PAUSED`, `PAYPAL_MODE`, `COOKIE_SECURE`, `STORAGE_BACKEND`, `STORAGE_PERSISTENT`, `FORWARDED_ALLOW_IPS`, `GOOGLE_AUTH_ENABLED` | STAGING-ONLY / SERVER-ONLY | Render |
| `PUBLIC_ORIGIN`, `CORS_ORIGINS` | PUBLIC / SERVER-ONLY | Render |
| `MONGO_URL`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY` | SECRET / SERVER-ONLY | Render |
| `BACKEND_ORIGIN`, `VITE_SITE_URL` | PUBLIC / STAGING-ONLY | Vercel |

Configuração ativa: `APP_ENV=staging`, `MFA_REQUIRED=true`, `PAYMENTS_PAUSED=true`, `PAYPAL_MODE=sandbox`, `COOKIE_SECURE=true`, `GOOGLE_AUTH_ENABLED=false`, `STORAGE_BACKEND=gridfs` e `STORAGE_PERSISTENT=true`.

## Segurança

Headers: HSTS, CSP, `nosniff`, proteção contra frames, referrer policy e permissions policy conferidos na resposta real da Vercel. A CSP permite somente as fontes locais incorporadas em `data:` e os destinos públicos explicitamente listados.

Cookies: `gs_access_token` e `gs_refresh_token` conferidos remotamente com `Secure`, `HttpOnly` e `SameSite=Lax`.

RBAC: usuário sintético comprador recebeu `403` no painel administrativo; request anônimo recebeu `401`; o usuário temporário foi removido. O admin sintético autenticou com MFA e executou upload autorizado.

MFA: administrador sintético ativo no Atlas. Senha, segredo TOTP criptografado e recovery codes continuam somente em arquivo local ignorado e protegido. Login real pela Vercel retornou função `admin` e `mfa_enabled=true`.

Rate limit: dez logins inválidos retornaram `401`; a 11ª tentativa do mesmo par origem/e-mail retornou `429`.

Arquivos sensíveis: requests reais a `.env`, `.git/config`, `backend/.env`, `vercel.json` e `render.yaml` retornaram `404` sem conteúdo sensível.

O scan final cobriu 205 arquivos e todo o histórico Git existente. Os 31 candidatos são literais sintéticos de testes atuais/históricos e dois valores no `backend/.env` local ignorado. Valores reais não foram adicionados ao Git. A URL Supabase legada e não usada deve ser rotacionada antes de qualquer reutilização.

## Testes

- Backend: 76 aprovados; quatro avisos de depreciação em dependências.
- Playwright local: 28 aprovados em desktop e mobile.
- Lint: 0 erros e seis avisos existentes de Fast Refresh.
- Typecheck e build: aprovados.
- Vercel: build remoto aprovado e deployment `READY`.
- Smoke público: 10 produtos, seis categorias e imagens GridFS entregues pelo caminho Vercel → Render → Atlas.
- Smoke desktop 1440×900 e mobile 390×844: título, header, catálogo e ausência de overflow horizontal aprovados em Chromium real.
- Upload remoto: criação, deduplicação, content type, bytes, logout e persistência após restart aprovados.

## PayPal

Sandbox configurado: não; credenciais externas ainda não foram fornecidas.

Teste real: pendente. Exige confirmação imediatamente antes de remover temporariamente `PAYMENTS_PAUSED=true`.

Conciliação e idempotência: implementação e testes locais aprovados; validação remota depende das credenciais Sandbox.

Pagamentos Live: desabilitados e fora do escopo.

## Recuperação

Backup inicial pré-seed preservado em `.local/staging/backups/20260923T195301Z`.

Backup final: aprovado com `mongodump` 100.18.0, UTC `20260923T230829Z`, 26.759.539 bytes e SHA-256 `3eee9c0e598759fe2ba961f5687e404efdf463edb8e3500655b9000007edb88d`.

Restore final: aprovado em banco isolado. Foram restaurados 172 documentos em 23 coleções, incluindo 13 arquivos e 112 chunks do GridFS; contagens e índices ficaram equivalentes. O banco e o usuário temporários foram removidos.

RPO observado: ponto manual confirmado em `20260923T230829Z`.

RTO observado: 138,64 segundos para propagar credencial temporária, restaurar, comparar e limpar este conjunto sintético.

## Pendências externas

- Fornecer credenciais PayPal Sandbox e autorizar o despause imediatamente antes do teste.
- Escolher um coletor de alertas e confirmar recebimento por uma pessoa responsável.
- Excluir pelo painel Atlas o primeiro projeto vazio `mv-multimarcas-staging`; a API pública não permite desativar a proteção de encerramento daquele M0.
- Remover ou rotacionar no Supabase a URL legada antes de qualquer reutilização.
- Se o cold start do Render Free deixar de ser aceitável, migrar o mesmo container para um plano sempre ativo; o banco e o GridFS não precisam migrar.

## Checklist final

- ✅ APROVADO — Frontend staging publicado na Vercel.
- ✅ APROVADO — Backend staging publicado no Render Free.
- ✅ APROVADO — Banco Atlas isolado, TLS, autenticação, menor privilégio, transações e índices.
- ✅ APROVADO — Storage GridFS persiste após restart do Render.
- ✅ APROVADO — HTTPS, proxy, CORS, headers e cookies.
- ✅ APROVADO — MFA, admin, RBAC, upload e rate limit remotos.
- ✅ APROVADO — Desktop, mobile e smoke público.
- ✅ APROVADO — Backup e restore do banco e do GridFS.
- ⚠️ AÇÃO EXTERNA — Coletor de alertas.
- ⚠️ AÇÃO EXTERNA — PayPal Sandbox e conciliação remota.
- ✅ APROVADO — Pronto para pentest do escopo não financeiro; pagamentos permanecem pausados até o gate acima.

STATUS: STAGING IMPLANTADO E VALIDADO, COM PAYPAL SANDBOX E COLETOR DE ALERTAS PENDENTES.
