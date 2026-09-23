# Relatório de implantação de staging

Atualizado em 2026-09-23. Este documento não contém credenciais, tokens, connection strings, IPs públicos ou dados reais.

## Deploy

Frontend: projeto Vercel exclusivo `mv-multimarcas-staging` criado e vinculado ao diretório `frontend`; publicação aguarda a URL real do backend.
Backend: FastAPI empacotado em `backend/Dockerfile`; Blueprint Render preparado em `render.yaml` e validado pela CLI oficial até o bloqueio `need_payment_info`.
Banco: projeto Atlas exclusivo `mv-multimarcas-staging-runtime`, cluster `mv-staging` M0 em AWS `US_EAST_1`, MongoDB 8.0.32, 0,5 GB e proteção contra encerramento ativa.
Storage: volume Render exclusivo de 1 GB definido em `/data`, ainda não provisionado.
URL frontend: pendente de publicação.
URL API: pendente da criação do serviço Render.
Commit de referência: `a78e7ea`; tag de recuperação `pre-staging-final-2026-09-23`.
Data: 2026-09-23.

Arquitetura confirmada: React/Vite no frontend, FastAPI/Uvicorn no backend, MongoDB com transações, uploads em filesystem persistente, autenticação própria com cookies/JWT e MFA TOTP, e PayPal. O backend depende de processo e volume persistentes; a Vercel hospeda somente o frontend.

## Infraestrutura

HTTPS: pendente de endpoints publicados.
CORS: validação fail-closed implementada; a origem exata da Vercel será configurada no Render.
Proxy: Render encerra TLS e é o único caminho até a porta do container. `FORWARDED_ALLOW_IPS=*` só é aceito quando o próprio Render identifica o processo como web service; fora desse contexto o startup falha.
Banco privado: autenticação, TLS, usuário próprio e menor privilégio validados. O acesso local temporário expira automaticamente; os CIDRs de saída do Render serão os únicos acessos permanentes.
Storage persistente: imagem pronta para `/data/uploads`; provisionamento depende do serviço Render pago.
Secrets: segredos exclusivos gerados em `.local/staging/runtime-secrets.json`, ignorado pelo Git e com ACL local restrita. Ainda precisam ser enviados ao secret manager do Render.
Logs: auditoria estruturada e redação validadas localmente; inspeção remota pendente.
Alertas: AÇÃO DO RESPONSÁVEL — escolher um coletor antes de conectar `security.alert`.

Inventário de ambiente:

| Variável | Classe | Destino |
| --- | --- | --- |
| `APP_ENV`, `DB_NAME`, `MFA_REQUIRED`, `PAYMENTS_PAUSED`, `PAYPAL_MODE`, `COOKIE_SECURE`, `STORAGE_PERSISTENT`, `STORAGE_DIR`, `FORWARDED_ALLOW_IPS`, `GOOGLE_AUTH_ENABLED` | STAGING-ONLY / SERVER-ONLY | Backend |
| `PUBLIC_ORIGIN`, `CORS_ORIGINS` | PUBLIC / SERVER-ONLY | Backend |
| `MONGO_URL`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY_PREVIOUS`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `RESET_WEBHOOK_URL`, `RESET_WEBHOOK_TOKEN`, `RESET_WEBHOOK_ALLOWED_HOSTS` | SECRET / SERVER-ONLY | Secret manager do backend |
| `BACKEND_ORIGIN` | PUBLIC / STAGING-ONLY | Build da Vercel |

Configuração obrigatória preparada: `APP_ENV=staging`, `MFA_REQUIRED=true`, `PAYMENTS_PAUSED=true`, `PAYPAL_MODE=sandbox`, `COOKIE_SECURE=true`, `GOOGLE_AUTH_ENABLED=false`, `STORAGE_PERSISTENT=true` e `STORAGE_DIR=/data/uploads`. Credenciais PayPal Sandbox permanecem ausentes.

## Segurança

Headers: configurados em `frontend/vercel.ts`; validação externa pendente.
Cookies: flags seguras implementadas; validação externa pendente.
RBAC: aprovado nos testes locais; validação remota pendente.
MFA: administrador sintético criado no Atlas. Senha, segredo TOTP criptografado, dez recovery codes armazenados como hash e política obrigatória foram conferidos sem revelar valores. Credenciais estão em `.local/staging/staging-admin-credentials.json`, fora do Git e com ACL restrita.
Uploads: validações locais aprovadas; persistência e comportamento remoto pendentes.
Rate limit: implementado e coberto pelos testes locais; comportamento atrás do proxy remoto pendente.
Arquivos sensíveis: exclusões locais configuradas; requests reais pendentes.

O scan final cobriu 205 arquivos atuais e 330 blobs Git. Há 26 candidatos: 24 literais sintéticos de testes atuais/históricos e dois valores no `backend/.env` local ignorado. Os valores exatos não aparecem no histórico. Um deles é uma URL Supabase legada, não usada pelo staging Mongo; ela deve ser removida e rotacionada no Supabase antes de qualquer reutilização.

## Testes

Backend: 73 aprovados, 4 avisos de depreciação em dependências.
Frontend: coberto pelo E2E, typecheck e build.
Playwright/E2E: 28 aprovados.
Lint: aprovado, 0 erros e 6 avisos existentes de Fast Refresh.
Typecheck: aprovado.
Build: aprovado localmente e pelo `vercel build` (Build Output API v3); source maps não foram emitidos no artefato.
Smoke desktop: local aprovado em 1440x900; remoto pendente.
Smoke mobile: local aprovado, incluindo 375x812, 390x844 e 430x932; remoto pendente.

## PayPal

Sandbox configurado: não; credenciais externas ainda não fornecidas.
Teste real: pendente e exige confirmação imediatamente antes de remover temporariamente a pausa.
Conciliação: implementação e testes locais aprovados; validação remota pendente.
Idempotência: testes locais aprovados; validação remota pendente.
Pagamentos Live: desabilitados e fora do escopo.

## Recuperação

Backup banco: aprovado. `mongodump` 100.18.0, UTC `20260923T195301Z`, 2.776 bytes, SHA-256 `22c65b6548b120cee3e5153fc949d76535c666a4c741a8f29ecd59d5d4c0bb42`, armazenado fora do Git em `.local/staging/backups/20260923T195301Z`.
Restore banco: aprovado em banco temporário separado; 21 coleções, contagens e índices equivalentes. Banco e usuário temporários foram removidos após a comparação.
Backup storage: pendente do volume Render.
Restore storage: pendente do volume Render.
RPO: ainda não mensurável como objetivo operacional; existe um ponto manual confirmado em `20260923T195301Z`.
RTO: aproximadamente 22 segundos observados para restaurar e conferir este conjunto mínimo; não representa carga de produção.

## Pendências

- Adicionar forma de pagamento no Render e aprovar a criação do serviço `0.5c-512mb` e do disco de 1 GB. A estimativa atual é cerca de US$ 6,91/mês de compute mais US$ 0,25/mês de disco se o serviço ficar ativo continuamente, além de eventual excedente de rede.
- Criar o serviço Render, cadastrar somente seus CIDRs de saída no Atlas, enviar os secrets, executar o seed sintético no volume e publicar o backend.
- Configurar `BACKEND_ORIGIN`, publicar o projeto Vercel e executar smoke tests, headers, CORS, cookies, RBAC, MFA, rate limit, uploads e arquivos sensíveis contra as URLs reais.
- Remover ou rotacionar a URL Supabase legada antes de qualquer reutilização.
- Excluir pelo painel Atlas o primeiro projeto vazio que apresentou falha TLS; a API pública não permite desativar a proteção de encerramento de um M0.
- Configurar e testar PayPal Sandbox somente após autorização para despausar temporariamente o staging.
- Executar backup/restore do volume Render e medir RPO/RTO com dados sintéticos representativos.

## Checklist final

- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — Frontend staging: projeto vinculado; publicação depende do backend.
- ❌ BLOQUEADOR — Backend staging: cobrança do Render ainda não autorizada.
- ✅ APROVADO — Banco staging: Atlas isolado, TLS, autenticação, menor privilégio, transações e índices validados.
- ❌ BLOQUEADOR — Storage staging: volume Render ainda não criado.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — HTTPS: endpoints ainda não publicados.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — CORS: configuração pronta; URL real pendente.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — Trusted proxy: configuração Render aprovada localmente; teste remoto pendente.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — Secrets: gerados e protegidos localmente; envio ao Render pendente.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — Headers e cookies: configuração pronta; validação remota pendente.
- ✅ APROVADO — MFA e Admin: conta sintética provisionada e verificada no Atlas.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — RBAC, upload e rate limit: testes locais aprovados; remoto pendente.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — Logs e alertas: redação local aprovada; destino e inspeção remotos pendentes.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — Desktop, mobile e smoke tests: locais aprovados; remoto pendente.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — PayPal Sandbox e conciliação: código aprovado; credenciais e teste remoto pendentes.
- ✅ APROVADO — Backup e restore remoto do banco.
- ⚠️ DEPENDE DE CONFIGURAÇÃO/AÇÃO — Backup/restore do storage e RPO operacional.
- ❌ BLOQUEADOR — Pronto para pentest: requer frontend, backend e storage remotos validados.

STATUS: STAGING PARCIALMENTE CONFIGURADO
