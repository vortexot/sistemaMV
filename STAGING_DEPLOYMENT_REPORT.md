# Relatório de implantação de staging

Atualizado em 2026-09-23. Este documento não contém credenciais, tokens, connection strings ou dados reais.

## Deploy

Frontend: preparado para Vercel por `vercel.ts`; publicação bloqueada por autenticação externa.
Backend: FastAPI empacotado em `backend/Dockerfile`; provedor compatível com processo persistente e volume ainda precisa ser escolhido.
Banco: MongoDB remoto isolado ainda não provisionado.
Storage: diretório persistente isolado ainda não provisionado.
URL frontend: pendente.
URL API: pendente.
Commit: tag local `pre-staging-final-2026-09-23` (criada após os gates locais).
Data: 2026-09-23.

Arquitetura confirmada: React/Vite no frontend, FastAPI/Uvicorn no backend, MongoDB com transações, uploads em filesystem persistente, autenticação própria com cookies/JWT e MFA TOTP, e PayPal. O backend não é adequado à Vercel porque depende de processo persistente e volume durável. A Vercel será usada somente no frontend.

## Infraestrutura

HTTPS: pendente de URLs remotas.
CORS: validação fail-closed implementada; origens exatas dependem da URL da Vercel.
Proxy: `FORWARDED_ALLOW_IPS` obrigatório e sem `*`; CIDRs dependem do provedor do backend.
Banco privado: pendente de provedor/conta externa.
Storage persistente: imagem preparada para `/data/uploads`; volume remoto dedicado pendente.
Secrets: inventário abaixo; nenhum secret será enviado ao frontend ou ao Git.
Logs: auditoria estruturada e redação validadas localmente; destino remoto pendente.
Alertas: AÇÃO DO RESPONSÁVEL — escolher coletor antes de conectar `security.alert`.

Inventário de ambiente:

| Variável | Classe | Destino |
| --- | --- | --- |
| `APP_ENV`, `DB_NAME`, `MFA_REQUIRED`, `PAYMENTS_PAUSED`, `PAYPAL_MODE`, `COOKIE_SECURE`, `STORAGE_PERSISTENT`, `STORAGE_DIR`, `FORWARDED_ALLOW_IPS`, `GOOGLE_AUTH_ENABLED` | STAGING-ONLY / SERVER-ONLY | Backend |
| `PUBLIC_ORIGIN`, `CORS_ORIGINS` | PUBLIC / SERVER-ONLY | Backend |
| `MONGO_URL`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY_PREVIOUS`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `RESET_WEBHOOK_URL`, `RESET_WEBHOOK_TOKEN`, `RESET_WEBHOOK_ALLOWED_HOSTS` | SECRET / SERVER-ONLY | Secrets manager do backend |
| `BACKEND_ORIGIN` | PUBLIC / STAGING-ONLY | Build da Vercel |

Valores obrigatórios iniciais: `APP_ENV=staging`, `MFA_REQUIRED=true`, `PAYMENTS_PAUSED=true`, `PAYPAL_MODE=sandbox`, `COOKIE_SECURE=true`, `GOOGLE_AUTH_ENABLED=false`. Credenciais PayPal Sandbox permanecem ausentes até a etapa específica.

## Segurança

Headers: configurados em `vercel.ts`; validação externa pendente.
Cookies: flags seguras implementadas; validação externa pendente.
RBAC: aprovado nos testes locais; validação remota pendente.
MFA: obrigatório para equipe; `backend/scripts/bootstrap_staging_admin.py` prepara o primeiro admin sintético já com MFA.
Uploads: validações locais aprovadas; persistência e comportamento remoto pendentes.
Rate limit: implementado; comportamento atrás do proxy remoto pendente.
Arquivos sensíveis: exclusões locais configuradas; requests reais pendentes.

O scan executado antes de qualquer push cobriu 204 arquivos atuais e 315 blobs Git. Foram encontrados 25 candidatos: 23 literais sintéticos em testes atuais/históricos, sem ação; e 2 possíveis credenciais no `backend/.env` local ignorado. Esses valores não estão no commit e não serão copiados para staging. Se já tiverem sido usados ou distribuídos, devem ser rotacionados antes de qualquer reutilização.

## Testes

Backend: 69 aprovados.
Frontend: coberto pelo E2E e build.
Playwright/E2E: 28 aprovados.
Lint: aprovado, 0 erros e 6 avisos existentes.
Typecheck: aprovado.
Build: aprovado.
Smoke desktop: local aprovado; remoto pendente.
Smoke mobile: local aprovado em 375x812, 390x844 e 430x932; remoto pendente.

## PayPal

Sandbox configurado: não; credenciais externas ainda não fornecidas.
Teste real: pendente e exige confirmação antes de remover temporariamente a pausa.
Conciliação: implementação e testes locais aprovados; validação remota pendente.
Idempotência: testes locais aprovados; validação remota pendente.
Pagamentos Live: desabilitados e fora do escopo.

## Recuperação

Backup banco: pendente do MongoDB de staging.
Restore banco: pendente; será feito em banco temporário separado.
Backup storage: pendente do volume de staging.
Restore storage: pendente.
RPO: não medido.
RTO: não medido.

## Pendências

- Autenticar a conta Vercel que hospedará o frontend de STAGING.
- Escolher/provisionar um provedor de backend com processo persistente e volume durável, sem contratação paga automática.
- Criar MongoDB remoto exclusivo de staging com TLS, autenticação, transações e backup.
- Configurar secrets exclusivos, URLs reais, CORS e proxy após os endpoints existirem.
- Provisionar contas e dados exclusivamente sintéticos, executar smoke tests externos e validar logs.
- Configurar e testar PayPal Sandbox somente após autorização para despausar temporariamente staging.
- Executar backup/restore remoto de banco e storage e medir RPO/RTO.

## Checklist final

- ❌ Frontend staging — autenticação Vercel pendente.
- ❌ Backend staging — provedor pendente.
- ❌ Banco staging — provedor pendente.
- ❌ Storage staging — volume dedicado pendente.
- ⚠️ HTTPS — configuração pronta, validação remota pendente.
- ⚠️ CORS — implementação pronta, URLs pendentes.
- ⚠️ Trusted proxy — proteção pronta, CIDRs pendentes.
- ⚠️ Secrets — inventário pronto, criação externa pendente.
- ⚠️ Headers — configuração pronta, validação remota pendente.
- ⚠️ Cookies — implementação pronta, validação remota pendente.
- ⚠️ MFA — implementação e bootstrap prontos, validação remota pendente.
- ⚠️ Admin — provisionamento seguro pronto, execução remota pendente.
- ⚠️ RBAC — testes locais aprovados, validação remota pendente.
- ⚠️ Upload — validações prontas, volume remoto pendente.
- ⚠️ Logs — redação local aprovada, inspeção remota pendente.
- ⚠️ Alertas — coletor não escolhido.
- ⚠️ Desktop — smoke remoto pendente.
- ⚠️ Mobile — smoke remoto pendente.
- ⚠️ Smoke tests — ambiente remoto pendente.
- ⚠️ PayPal Sandbox — credenciais e autorização futura pendentes.
- ⚠️ Conciliação — validação remota pendente.
- ⚠️ Backup remoto — infraestrutura pendente.
- ⚠️ Restore remoto — infraestrutura pendente.
- ⚠️ RPO/RTO — não medidos.
- ❌ Pronto para pentest — requer staging remoto validado.

STATUS: STAGING BLOQUEADO
