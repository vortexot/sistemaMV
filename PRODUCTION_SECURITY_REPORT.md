# Relatório de preparação de segurança — MV Multimarcas

**Data:** 23/09/2026
**Branch/commit de partida:** `main` / `e7dd894dee545aebfb941e1fc0caa163ee09489d`
**Estado:** alterações anteriores não commitadas foram preservadas; nenhum backup, tag ou histórico foi removido.
**Decisão:** código em preparação para staging. Não publicar, não conectar dados reais e não habilitar PayPal Live nesta missão.

Este documento registra somente os bloqueadores definidos para a passagem a staging. Não representa certificação ASVS, conformidade jurídica ou autorização para pagamentos reais.

## Arquitetura confirmada

- Frontend React/Vite, API FastAPI e MongoDB.
- JWT em cookies HttpOnly ou Bearer, refresh rotativo e revogação por versão da conta.
- Uploads em filesystem configurado por `STORAGE_DIR`; a hospedagem precisa fornecer volume persistente.
- PayPal Orders v2 chamado somente pelo backend. Não existe webhook PayPal ativo.
- Recuperação de senha usa entrega HTTPS allowlisted; o token fica somente como digest no banco.
- Logs de segurança são JSON em `security.audit` e alertas em `security.alert`, ambos destinados a stdout para coleta externa.

## Controles confirmados e mantidos

- MFA TOTP obrigatório para equipe em staging/produção, recovery codes de 128 bits, hash SHA-256, consumo atômico e bloqueio de replay de TOTP.
- Senha redefinida não remove nem ignora MFA.
- Troca de senha, alteração de MFA, recuperação administrativa e mudança de papel revogam sessões por `token_version`.
- Reautenticação recente e MFA protegem escritas administrativas.
- Atendente não lê clientes, relatórios ou resumo administrativo.
- Preço, moeda, valor, propriedade, estoque, idempotência e estados de pagamento são validados pelo servidor.
- Startup de staging/produção falha com origem, proxy, storage, Mongo, JWT ou MFA inseguros; staging recusa PayPal Live.

## Alterações desta missão

### Recuperação administrativa de MFA

- Recovery codes podem ser regenerados; os anteriores são substituídos, os novos aparecem uma vez e as sessões são revogadas.
- Outro administrador com autenticação recente e MFA pode solicitar recuperação de uma conta interna.
- A solicitação não desativa o MFA. Ela revoga sessões e cria um token de 30 minutos armazenado somente como hash.
- O titular precisa do token **e da própria senha** para cadastrar e confirmar um novo TOTP em até 10 minutos.
- A conclusão substitui o fator, cria novos recovery codes, invalida o token e revoga sessões novamente.
- Auto-recuperação administrativa, comprador como solicitante e admin sem step-up são recusados.
- Procedimento: [ADMIN_MFA_RECOVERY.md](ADMIN_MFA_RECOVERY.md).

### Auditoria e alertas

Eventos cobertos: `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `PASSWORD_CHANGE`, `PASSWORD_RESET`, `MFA_ENABLED`, `MFA_DISABLED`, `MFA_RECOVERY_USED`, `MFA_RECOVERY_REQUEST`, `MFA_RECOVERY_COMPLETE`, `ROLE_CHANGE`, `ADMIN_SENSITIVE_ACTION`, `AUTHORIZATION_DENIED`, `PAYMENT_STATE_CHANGE`, `PAYMENT_RECONCILIATION` e `PAYMENT_AMBIGUOUS`.

O emissor usa JSON, horário UTC e `request_id`. Chaves relacionadas a senha, autorização, cookie, token, segredo, API key, connection string, TOTP e recovery code são redigidas. Eventos críticos também vão para `security.alert`. O repositório não inventa fornecedor ou URL de alerta: coleta remota, retenção protegida e escalonamento são ações externas de staging.

### Secrets e rotação

- Produção e staging recusam JWT placeholder, Mongo local/ausente, database ausente, chave MFA inválida, storage não persistente, origem HTTP/wildcard e proxy irrestrito.
- `MFA_ENCRYPTION_KEY_PREVIOUS` permite uma janela controlada de rotação.
- `backend/scripts/rotate_mfa_secrets.py` faz dry-run por padrão, nunca imprime seed/chave e só grava com `--apply`.
- Procedimento por credencial: [PRODUCTION_SECRET_ROTATION.md](PRODUCTION_SECRET_ROTATION.md).

O scanner heurístico final examinou 200 arquivos e 308 blobs Git. Ele listou 23 localizações sem imprimir valores: 21 são literais sintéticos de testes ou histórico e 2 ficam no `backend/.env` local ignorado. Isso não comprova vazamento, mas as duas credenciais locais devem ser identificadas, comparadas com os serviços reais e rotacionadas pelo responsável se já tiverem sido distribuídas ou usadas fora deste computador.

### Conciliação PayPal

- `POST /api/payments/paypal/reconcile` consulta o pedido do próprio comprador no provedor.
- `POST /api/admin/payments/paypal/reconcile` permite operação por admin com autenticação recente.
- A conciliação apenas lê o PayPal; nunca captura, cria pedido ou altera estoque.
- ID do provedor, status, moeda BRL, valor e capturas são conferidos antes de marcar pago.
- Repetição após `pago` retorna o estado local sem nova consulta ou efeito financeiro.
- Estado confiavelmente não capturado volta a `aguardando`; divergência usa `revisao_necessaria`; indisponibilidade mantém o pedido bloqueado e gera alerta.
- Sandbox e estorno operacional: [PAYPAL_SANDBOX_TEST.md](PAYPAL_SANDBOX_TEST.md).

## Classificação dos bloqueadores

| Bloqueador | Estado | Evidência e pendência |
|---|---|---|
| RECUPERAÇÃO MFA | ✅ RESOLVIDO | Fluxo entre dois admins, senha do titular, tokens temporários com hash, novo TOTP, recovery codes e revogação. Admin único depende dos códigos e da ação do responsável. |
| AUDITORIA | ✅ RESOLVIDO no código | Eventos mínimos e redaction implementados. A proteção fora da aplicação depende do coletor de staging. |
| ALERTAS | ⚠️ PREPARADO — DEPENDE DO DEPLOY/CONFIGURAÇÃO | `security.alert` emite eventos críticos; falta integrar e testar o coletor/plantão real. |
| SECRETS | ⚠️ PREPARADO — DEPENDE DO DEPLOY/CONFIGURAÇÃO | Fail-closed, inventário e rotação documentados; falta cadastrar e rotacionar valores no secrets manager real. |
| PAYPAL | ⚠️ PREPARADO — DEPENDE DO DEPLOY/CONFIGURAÇÃO | Conciliação idempotente implementada; falta executar Sandbox real com credenciais do responsável. `PAYMENTS_PAUSED` permanece verdadeiro por padrão. |
| INFRA | ⚠️ PREPARADO — DEPENDE DO DEPLOY/CONFIGURAÇÃO | Checklist criado; TLS, firewall, proxy, Mongo privado, storage, logs e monitoramento só podem ser comprovados após deploy. |
| BACKUP REMOTO | ⚠️ PREPARADO — DEPENDE DO DEPLOY/CONFIGURAÇÃO | Backup local anterior preservado. Falta backup e restore isolado do Mongo/storage remotos, com RPO/RTO medidos. |
| DOCUMENTAÇÃO | ✅ RESOLVIDO | Relatório, matriz ASVS, rotação, MFA, Sandbox e infraestrutura atualizados. |

## Inventário de configuração

| Variável | Classe | Uso |
|---|---|---|
| `APP_ENV`, `APP_TZ` | AMBIENTE | Modo e fuso do backend |
| `PUBLIC_ORIGIN`, `CORS_ORIGINS`, `FORWARDED_ALLOW_IPS` | AMBIENTE | Origem pública, CORS e proxies confiáveis |
| `COOKIE_SECURE`, `MFA_REQUIRED`, `PAYMENTS_PAUSED`, `PAYPAL_MODE`, `STORAGE_PERSISTENT`, `GOOGLE_AUTH_ENABLED` | AMBIENTE | Flags operacionais; não contêm credencial |
| `STORAGE_DIR`, `DB_NAME`, `RESET_WEBHOOK_ALLOWED_HOSTS` | SERVER-ONLY | Caminhos e identificadores internos |
| `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY_PREVIOUS` | SECRET | Assinatura de sessão e criptografia de seeds MFA |
| `MONGO_URL` | SECRET | Endpoint e credencial do MongoDB |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | SECRET | Credenciais PayPal server-side |
| `RESET_WEBHOOK_URL` | SERVER-ONLY | Destino HTTPS allowlisted de recuperação |
| `RESET_WEBHOOK_TOKEN` | SECRET | Autorização do serviço de entrega |
| Variáveis `VITE_*` do frontend | PÚBLICA | Incorporadas ao bundle; nunca devem conter secrets |

## Infraestrutura e backup

O gate executável está em [PRODUCTION_INFRA_CHECKLIST.md](PRODUCTION_INFRA_CHECKLIST.md). O Mongo remoto deve usar TLS, autenticação, rede restrita, usuário mínimo, replica set/transações e backup. O volume de uploads deve sobreviver à troca da instância. O restore deve ocorrer em ambiente isolado e validar banco e arquivos da mesma janela. RPO e RTO permanecem em branco até serem medidos.

## Testes finais

- Backend: **69 testes aprovados** em Mongo temporário com replica set; 4 avisos de depreciação Starlette/httpx/AnyIO.
- Frontend/e2e: **28 cenários Playwright aprovados** em desktop e mobile.
- Lint: **aprovado, zero erros e 6 avisos** `react/only-export-components` já existentes.
- Typecheck: **aprovado** com `tsc -b --noEmit`.
- Build: **aprovado**, 6005 módulos transformados; sitemap omitido porque `VITE_SITE_URL` não está definido no build local.

Os testes usam Mongo temporário em replica set e dados sintéticos. Nenhuma chamada PayPal real, e-mail real, banco remoto ou dado de produção é usada.

## POST-LAUNCH SECURITY HARDENING

- Passkeys/WebAuthn ou chave física para resistência a phishing.
- Migração gradual de bcrypt para Argon2id e política de senhas comprometidas.
- Inventário e revogação individual de sessões/dispositivos.
- Dupla aprovação para mudanças financeiras e privilégios de alto impacto.
- Automação de direitos e retenção LGPD.
- Quotas de upload, remoção automática de EXIF e retenção automatizada.
- Notificações avançadas ao usuário e detecção contextual.
- CI/CD com actions fixadas por SHA, branches protegidas e scans bloqueantes.

Esses itens continuam visíveis, mas não bloqueiam automaticamente staging nesta missão.

## Rollback e limites

- Não houve deploy, push, force push, migração de dados reais, cobrança, estorno ou alteração de credencial externa.
- O backup local pré-pentest continua válido para o estado em que foi criado e não foi sobrescrito.
- Em rollback financeiro, conciliar o PayPal antes de restaurar estado local; não restaurar cegamente um snapshot anterior a uma captura.
- Reativar pagamentos, remover a pausa ou declarar produção exige staging real, Sandbox, restore remoto, smoke tests e pentest independente.

**STATUS: PRONTO PARA STAGING**
