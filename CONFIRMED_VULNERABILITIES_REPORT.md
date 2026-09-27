# Vulnerabilidades confirmadas — MV Multimarcas

> **Atualização:** as seções iniciais preservam a evidência do estado vulnerável. O resultado depois das correções está em **SECURITY REMEDIATION REPORT**, ao final deste arquivo. O código local foi corrigido; o staging público ainda aguarda configuração de e-mail e deploy.

**Data:** 25/09/2026  
**Escopo:** código local e staging em `mv-multimarcas-staging.vercel.app` / `mv-multimarcas-api-staging.onrender.com`  
**Método:** revisão assistida pelo código, testes HTTP sequenciais de baixo volume e validação local do custo criptográfico.  
**Regra de classificação:** um item só foi classificado como vulnerabilidade quando havia evidência direta no código ou resposta reproduzível do staging.

## Resultado executivo

Foram confirmadas **três vulnerabilidades exploráveis no estado atual**: criação de conta sem prova de posse do e-mail, enumeração de contas pelo cadastro e um caminho de esgotamento de CPU em uma rota com `bcrypt` sem limite de tentativas. Não foi confirmado acesso ao painel, elevação de privilégio, execução remota, injeção SQL/NoSQL, falsificação de JWT ou sequestro direto de conta existente.

Também foi confirmada uma falha de indisponibilidade de estoque no código de pagamentos. Ela **não pode ser explorada no staging agora**, porque `GET /api/payments/status` informou `paypal_configured=false`; passa a ser explorável quando pagamentos forem habilitados sem corrigir a reserva.

Os testes criaram duas contas descartáveis `security-audit-…@invalid.example`. Ao final, o painel informou **0 contas de auditoria ativas e 2 bloqueadas**. Nenhuma senha, cookie, token ou segredo está neste relatório.

## CONF-01 — Esgotamento de CPU por verificação de senha sem limite

**Severidade:** Média  
**Estado:** Explorável no staging atual  
**Local:** `backend/routers/auth.py`, função `change_password`, linhas 221–234; `backend/lib/security.py`, função `verify_password`.

**Problema:** `/api/auth/change-password` exige sessão, mas não aplica `_rate_limit`. Qualquer pessoa consegue criar uma conta e receber a sessão imediatamente. Cada tentativa de senha atual chama `bcrypt.checkpw` de forma síncrona dentro de uma rota `async`.

**Impacto:** um atacante pode criar a própria conta e enviar tentativas paralelas para ocupar a CPU e bloquear o event loop do backend. Isso pode aumentar muito a latência ou indisponibilizar a API. A falha não revela a senha e não permite trocar a senha sem acertar o valor atual.

**Evidência:**

- O staging aceitou **12 tentativas consecutivas** de senha atual incorreta, todas com `401`; nenhuma retornou `429`.
- O custo local de oito chamadas equivalentes de `bcrypt.checkpw` foi em média **347,1 ms por chamada**, totalizando 2,78 s de CPU em sequência.
- A busca de chamadas mostrou `_rate_limit` em cadastro, login, reautenticação, recuperação e reset, mas não em `change_password`.
- A proteção de bot/WAF não deve ser considerada compensatória: a API Render continua acessível diretamente.

**Correção:** aplicar limite por conta e por origem antes do `bcrypt`, executar a verificação em worker thread e limitar concorrência/custo também na borda do endpoint direto.

**Exemplo seguro:**

```python
@router.post('/change-password', response_model=MessageOut)
async def change_password(
    input: PasswordChangeIn,
    request: Request,
    user: dict = Depends(get_current_user),
) -> MessageOut:
    await _rate_limit(request, 'change-password', user['email'], 5)
    valid = await asyncio.to_thread(
        verify_password, input.current_password, user.get('password_hash')
    )
    if not valid:
        raise HTTPException(401, 'Senha atual inválida.')
```

O mesmo padrão deve cobrir qualquer outra rota que verifique senha ou TOTP, com limites próprios para não criar bloqueio global de contas.

## CONF-02 — Cadastro ativa conta sem confirmar o e-mail

**Severidade:** Média  
**Estado:** Explorável no staging atual  
**Local:** `backend/routers/auth.py`, função `register`, linhas 127–148.

**Problema:** o cadastro grava a conta com `status="ativo"` e chama `_issue` imediatamente. Não existe estado de e-mail pendente nem token de confirmação.

**Impacto:** um atacante pode registrar um endereço que não controla, ocupar a identidade antes do titular e usar a conta em fluxos vinculados àquele e-mail. A recuperação de senha está retornando `503`, portanto o titular também não possui hoje um caminho automático para recuperar a identidade ocupada. Isso não toma uma conta que já existe, pois o índice único recusa duplicatas.

**Evidência reproduzida:**

- `POST /api/auth/register` com um endereço reservado de teste retornou `200`.
- A resposta entregou imediatamente os cookies de acesso e refresh.
- `GET /api/auth/me` retornou `200` antes de qualquer confirmação de e-mail.
- O código define `status: "ativo"` e emite a sessão no próprio cadastro.

**Correção:** criar a conta como pendente, armazenar somente o hash de um token curto e de uso único, entregar o link ao endereço cadastrado e liberar sessão/checkout somente após a confirmação. A resposta externa deve permanecer genérica tanto para e-mail novo quanto já existente.

**Exemplo seguro:**

```python
user = {
    **validated_fields,
    'status': 'pendente_verificacao',
    'email_verified_at': None,
}
await db.users.insert_one(user)
await send_verification_link(user)  # token aleatório; somente o hash no banco
return MessageOut(
    message='Se o endereço puder ser cadastrado, enviaremos as instruções.'
)
```

## CONF-03 — Enumeração de contas pelo cadastro

**Severidade:** Baixa  
**Estado:** Explorável no staging atual  
**Local:** `backend/routers/auth.py`, função `register`, linhas 130–147.

**Problema:** a rota responde `409` com `Este e-mail já possui uma conta.` quando encontra o endereço antes do `insert`. Para uma corrida de unicidade, usa outra mensagem. A diferença permite descobrir quais e-mails estão cadastrados.

**Impacto:** facilita phishing direcionado, credential stuffing e identificação de clientes ou membros da equipe. O login e o fluxo de recuperação usam respostas genéricas; a enumeração permanece disponível pelo cadastro.

**Evidência reproduzida:** depois de criar a conta descartável, repetir o mesmo cadastro retornou `409` e a mensagem específica de conta existente.

**Correção:** retornar a mesma resposta e tempo aproximado em cadastro novo ou repetido; se o e-mail já existir, enviar opcionalmente uma notificação sem revelar o estado ao solicitante.

**Exemplo seguro:**

```python
message = 'Se o endereço puder ser cadastrado, enviaremos as instruções.'
existing = await db.users.find_one({'email': email}, {'_id': 1})
if existing:
    return MessageOut(message=message)
# criar conta pendente e enviar verificação
return MessageOut(message=message)
```

## COND-01 — Reserva indefinida de estoque por contas descartáveis

**Severidade:** Alta quando pagamentos forem habilitados  
**Estado:** Confirmada no código e em teste automatizado; bloqueada no staging atual pela pausa de pagamentos  
**Local:** `backend/routers/orders.py`, função `create_order`, linhas 148–194; cancelamento nas linhas 282–298; `backend/tests/test_security.py`, teste `test_pending_order_limit_holds_under_concurrency`.

**Problema:** a criação do pedido reduz o estoque antes de iniciar ou concluir o pagamento. Cada conta pode manter cinco pedidos em `aguardando_pagamento`, mas não há expiração automática nem rotina que cancele pedidos antigos e devolva o estoque. O usuário precisa cancelar voluntariamente.

**Impacto:** quando o PayPal for habilitado, um atacante poderá criar várias contas sem confirmar e-mail e reservar todo o estoque sem pagar. Isso impede vendas legítimas por tempo indefinido.

**Evidência:** o teste do projeto cria sete pedidos concorrentes; cinco são aceitos e o estoque cai de 20 para 15. A busca por expiração ou limpeza não encontrou rotina que libere reservas antigas. No staging, `GET /api/payments/status` retornou `{"paypal_configured": false, "paypal_mode": null}`, por isso a exploração está bloqueada hoje.

**Correção:** exigir e-mail confirmado antes do pedido, criar uma reserva com prazo curto e implementar um job confiável que cancele de forma transacional e devolva o estoque. Um índice TTL sozinho não serve, pois apagar o pedido não recompõe o estoque. O limite também precisa considerar conta, origem e sinais de abuso.

**Exemplo seguro:**

```python
order['reservation_expires_at'] = utcnow() + timedelta(minutes=15)

# Job periódico, dentro de transação:
# 1. reivindica atomicamente pedido vencido ainda pendente;
# 2. marca cancelado/expirado;
# 3. devolve cada quantidade ao produto;
# 4. registra auditoria e idempotência.
```

## COND-02 — Favoritos contornam o filtro de produtos publicados

**Severidade:** Baixa  
**Estado:** Confirmada no código; sem produto arquivado/inativo no staging atual  
**Local:** `backend/routers/favorites.py`, funções `toggle_favorite` e `my_favorites`, linhas 17–42.

**Problema:** o catálogo público exige `active=True` e `archived=False`, mas favoritos busca produtos apenas pelo `id`. Um comprador que conheça o UUID de um produto retirado pode adicioná-lo e receber seus dados públicos de catálogo.

**Impacto:** exposição de nome, SKU, preço, descrição e imagem de item ainda não publicado ou já arquivado. O UUID não é enumerável de forma prática, mas pode ter sido visto enquanto o produto estava ativo.

**Evidência:** os filtros de publicação existem em `catalog.py` e estão ausentes nas duas consultas de `favorites.py`. A leitura administrativa do staging encontrou **0** produtos arquivados ou inativos; não há dado oculto exposto no estado atual.

**Correção:** aplicar `active=True` e `archived=False` tanto ao alternar quanto ao listar favoritos, e remover favoritos órfãos quando um produto for arquivado.

## Controles revisados sem vulnerabilidade confirmada

| Área | Resultado e evidência |
| --- | --- |
| SQL/NoSQL injection | ✅ Protegido — modelos proíbem campos extras nos inputs sensíveis e as consultas não incorporam operadores fornecidos pelo cliente. O projeto usa MongoDB, não SQL. |
| XSS | ✅ Protegido — React mantém escaping, não foi encontrado `dangerouslySetInnerHTML`/`innerHTML`, links de banner têm validação e SVG não é aceito em upload. |
| CSRF/CORS | ✅ Protegido — cookies `SameSite=Lax`, escrita exige JSON, origem hostil retorna `403`, preflight hostil não recebe autorização e a origem permitida é explícita. |
| Sessão/JWT | ✅ Protegido nos vetores testados — algoritmo fixo HS256, issuer/audience/tipo obrigatórios, refresh de uso único, `token_version`, cookies `Secure`/`HttpOnly`. |
| RBAC/BOLA administrativo | ✅ Protegido nos vetores testados — comprador recebeu `403`; mutações administrativas exigem papel, autenticação recente e MFA quando ativo. |
| MFA | ✅ Protegido nos vetores testados — seed cifrada, TOTP sem janela extra, bloqueio de replay e recovery codes consumidos atomicamente. |
| Upload | ✅ Protegido contra execução direta — somente admin recente, limite de tamanho/dimensões, conteúdo decodificado, SVG recusado e resposta com `nosniff`. |
| Dependências | ✅ Protegido na verificação atual — `npm audit --omit=dev` informou 0 vulnerabilidades; a auditoria Python anterior também informou 0. |
| Recuperação de senha | ⚠️ Indisponível — responde `503` de forma genérica. É falha operacional e amplia o impacto de ocupação de e-mail, mas não revelou contas pelo endpoint. |
| WAF/rate limit de borda | ⚠️ Precisa melhorar — não foi usado como prova de proteção; a API Render direta contorna qualquer regra exclusiva do frontend Vercel. |

## Priorização

| Prioridade | Ação | Motivo |
| --- | --- | --- |
| P0 antes de habilitar pagamentos | Expiração transacional de reservas e e-mail confirmado para comprar | Evita esgotamento integral e indefinido do estoque. |
| P0 | Limitar `change-password` e tirar `bcrypt` do event loop | Fecha o caminho atual de indisponibilidade remota. |
| P1 | Confirmar posse do e-mail antes de ativar a conta | Impede ocupação de identidade e reduz criação automática de contas. |
| P1 | Tornar a resposta de cadastro genérica | Remove a enumeração de usuários. |
| P2 | Filtrar publicados em favoritos | Evita futura exposição de produtos ocultos. |

## Tabela final

| Área | Status | Severidade | Local | Correção |
| --- | --- | --- | --- | --- |
| Disponibilidade/autenticação | ❌ Vulnerável | Média | `auth.py:change_password` | Rate limit por conta/origem, worker thread e proteção no endpoint direto |
| Identidade de conta | ❌ Vulnerável | Média | `auth.py:register` | Confirmação de e-mail antes de sessão e uso da conta |
| Privacidade de contas | ❌ Vulnerável | Baixa | `auth.py:register` | Resposta genérica para novo/duplicado |
| Estoque/pagamento | ⚠️ Precisa melhorar | Alta quando habilitado | `orders.py:create_order` | Reserva expiráveis com devolução transacional |
| Produtos ocultos | ⚠️ Precisa melhorar | Baixa | `favorites.py` | Filtrar ativos e não arquivados |
| NoSQL injection | ✅ Protegido | — | Rotas e modelos de entrada | Manter validação tipada e filtros construídos no servidor |
| XSS | ✅ Protegido | — | Frontend, banners e upload | Manter escaping e CSP |
| CSRF/CORS | ✅ Protegido | — | `HttpSecurity`, CORS e cookies | Manter testes de regressão |
| JWT/MFA/RBAC | ✅ Protegido | — | `security.py`, `mfa.py`, rotas admin | Manter testes e rotação de secrets |

## Limites

Não foi executado DDoS, carga sustentada, tentativa contra senhas de usuários reais, engenharia social, exploração dos provedores ou pagamento PayPal. O achado de CPU foi provado por fluxo, ausência de limite, respostas do staging e custo local; a indisponibilidade do serviço não foi provocada. A análise representa o estado observado nesta data e não certifica ausência absoluta de falhas futuras.

---

# SECURITY REMEDIATION REPORT

**Data da correção e reteste local:** 25/09/2026  
**Referência histórica:** os achados e evidências anteriores permanecem acima. Esta seção registra o estado do código depois da remediação. O staging público ainda precisa receber o novo deploy.

## Vulnerabilidade 1 — CPU / bcrypt

**Status:** `FIXED` no código e no reteste automatizado.

**Causa:** `change_password` executava `bcrypt.checkpw` dentro do event loop e não chamava o limitador distribuído existente.

**Correção:** limite Mongo por origem e usuário antes do `bcrypt`, máximo de cinco tentativas por janela de 15 minutos. Verificação e hash de senha passaram a `asyncio.to_thread`. As rotas de MFA que também verificam senha receberam o mesmo limite por usuário.

**Arquivos alterados:** `backend/routers/auth.py`, `backend/tests/test_security.py`.

**Testes:** cinco erros continuam retornando `401`; a sexta tentativa retorna `429`; variações de senha e cabeçalhos de IP não mudam a chave confiável; usuário B não herda o limite de usuário A; depois da janela, usuário A volta a receber `401`.

**Reteste:** a sequência vulnerável de 12 verificações caras sem bloqueio não é mais possível. O teste `test_change_password_rate_limit_is_per_user_and_recovers_after_window` passou.

**Risco residual:** o limite depende do MongoDB, que já é compartilhado entre instâncias. Uma proteção de borda continua recomendada para absorver tráfego antes do Render, mas não substitui o controle do backend.

## Vulnerabilidade 2 — Ocupação de identidade

**Status:** `REQUIRES PRODUCTION VALIDATION`.

**Causa:** cadastro criava usuário ativo, emitia access/refresh cookies e não comprovava posse do endereço.

**Correção:** cadastro retorna `202` sem sessão; compradores ficam com `email_verified=false`; login, refresh e autenticação central recusam comprador não confirmado. O token tem 48 bytes aleatórios, somente SHA-256 é armazenado, expira em 30 minutos, funciona uma vez e é aplicado em transação. O registro do token fica vinculado ao hash da senha e ao nome daquela tentativa, a confirmação exige também a mesma senha e um novo envio invalida o token anterior. Assim, receber ou clicar em uma solicitação iniciada por um atacante não ativa as credenciais dele.

**Arquivos alterados:** `backend/lib/auth_email.py`, `backend/lib/db.py`, `backend/lib/security.py`, `backend/models/auth.py`, `backend/routers/auth.py`, `backend/lib/runtime_config.py`, `backend/.env.example`, `render.yaml`, `frontend/src/pages/Login.tsx`, `frontend/src/lib/types.ts`, `backend/seed.py`, `backend/scripts/bootstrap_staging_admin.py`, `EMAIL_VERIFICATION_SETUP.md`.

**Testes:** cadastro sem cookies; login e Bearer recusados antes da confirmação; token alterado, substituído, expirado e reutilizado recusados; token válido confirma uma vez; credencial da tentativa anterior não autentica; nova credencial autentica depois da confirmação; reenvio limitado.

**Reteste:** os testes locais demonstraram que a conta não recebe sessão nem privilégios antes de confirmar. O Playwright confirmou o fluxo em desktop e mobile.

**Risco residual:** o serviço real de e-mail ainda não foi configurado nem validado no staging. O startup de staging/produção agora falha sem webhook HTTPS allowlisted e token forte. Compradores antigos sem `email_verified=true` precisarão confirmar o endereço conforme `EMAIL_VERIFICATION_SETUP.md`.

## Vulnerabilidade 3 — Enumeração

**Status:** `FIXED` no código e no reteste automatizado.

**Causa:** o cadastro retornava `409` e mensagem específica quando o e-mail existia.

**Correção:** cadastro novo, pendente ou já existente retorna `202` com a mesma mensagem neutra. Cadastro existente recebe uma notificação pelo mesmo adaptador, evitando diferença óbvia causada pela chamada externa. Login e recuperação preservam mensagens genéricas; a recuperação aplica duração mínima comum à resposta pública.

**Arquivos alterados:** `backend/routers/auth.py`, `backend/lib/auth_email.py`, `backend/tests/test_security.py`.

**Testes:** respostas de cadastro existente e inexistente foram comparadas por status e corpo; reenvio conhecido e desconhecido também foi comparado.

**Reteste:** o `409` específico não é mais produzido e os corpos públicos são iguais.

**Risco residual:** diferenças de rede do provedor podem produzir pequenas variações estatísticas de tempo. O atacante não recebe estado, token ou mensagem diferente. Monitoramento do provedor deve detectar abuso de notificações.

## Vulnerabilidade 4 — Reserva de estoque

**Status:** `REQUIRES PRODUCTION VALIDATION`. A lógica de reserva foi corrigida e passou no reteste local, mas o fluxo completo com a infraestrutura PayPal real ainda exige validação no Sandbox antes de habilitar pagamentos.

**Causa:** estoque era reduzido sem `reservation_expires_at` e só voltava quando o comprador cancelava.

**Correção:** cada pedido recebe prazo configurável de 5 a 60 minutos. Um reaper executa periodicamente e as rotas de pedido também fazem limpeza oportunista. A expiração reivindica o pedido e devolve itens na mesma transação Mongo, muda pedido/pagamento para `expirado` e é idempotente. Instâncias concorrentes competem pelo mesmo filtro atômico; somente uma devolve o estoque.

**Arquivos alterados:** `backend/routers/orders.py`, `backend/models/orders.py`, `backend/lib/db.py`, `backend/server.py`, `backend/routers/admin.py`, `backend/lib/runtime_config.py`, `backend/.env.example`, `render.yaml`, `frontend/src/lib/types.ts`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/admin/AdminOrders.tsx`, `backend/tests/test_security.py`.

**Testes:** reserva expirada devolve exatamente uma unidade mesmo com duas limpezas concorrentes; segunda limpeza não altera estoque; captura atrasada é recusada antes de chamar PayPal; novo pedido compra a unidade liberada; disputa concorrente pela última unidade continua produzindo um sucesso e uma recusa; cancelamento e captura repetidos permanecem idempotentes; conciliação duplicada não movimenta estoque.

**Reteste:** o pedido abandonado mudou para `expirado`, o estoque voltou de 0 para 1 uma única vez e uma nova compra consumiu a unidade. A tentativa de captura atrasada retornou `409`.

**Risco residual:** o Render gratuito pausa processos sem tráfego. Durante a pausa não há compradores concorrendo; ao acordar, o reaper inicia e a criação/leitura de pedidos também limpa reservas vencidas. O fluxo PayPal Sandbox completo continua obrigatório antes de remover `PAYMENTS_PAUSED=true`. Não existe webhook PayPal nesta versão; o endpoint falso continua `404`, enquanto captura e conciliação do backend são idempotentes.

## Vulnerabilidade 5 — Favoritos

**Status:** `FIXED` no código e no reteste automatizado.

**Causa:** favoritos consultava produtos apenas pelo UUID, divergindo do catálogo público.

**Correção:** `public_product_filter` centraliza `active=true` e `archived=false`; catálogo, detalhe, favoritos e criação de pedidos usam a mesma regra.

**Arquivos alterados:** `backend/routers/catalog.py`, `backend/routers/favorites.py`, `backend/routers/orders.py`, `backend/tests/test_security.py`.

**Testes:** produto ativo aparece; depois de desativado ou arquivado some dos favoritos; nova tentativa de favoritar retorna `404`; detalhe público também retorna `404`.

**Reteste:** os dados do produto oculto não foram retornados ao comprador.

**Risco residual:** o registro órfão pode continuar na coleção de favoritos, mas não é exposto. Uma limpeza posterior pode removê-lo por higiene sem afetar a proteção.

## Test suite

Antes: `76 passed / 0 failed / 4 warnings`.

Depois:

- Backend de segurança: `87 passed / 0 failed / 4 warnings`.
- Playwright completo: `30 passed / 0 failed` em desktop e mobile.
- TypeScript: aprovado com `tsc -b --noEmit`.
- Build de produção: aprovado, 6005 módulos transformados.
- Lint: zero erros e os mesmos 6 avisos preexistentes de Fast Refresh.
- Dependências: `pip-audit` e `npm audit --omit=dev` sem vulnerabilidades conhecidas.
- Bandit: nenhum achado médio ou alto; 18 alertas baixos da heurística de strings de senha, todos em constantes como status/papéis ou scripts já revisados.
- Secrets: 211 arquivos e 362 blobs Git verificados; nenhum candidato atual fora de testes ou arquivos locais ignorados. Valores não foram impressos.

Os quatro avisos Python continuam sendo depreciações preexistentes de Starlette/httpx/AnyIO; nenhum aviso novo foi introduzido.

## Arquivos modificados

- Autenticação e configuração: `backend/routers/auth.py`, `backend/lib/auth_email.py`, `backend/lib/security.py`, `backend/lib/runtime_config.py`, `backend/lib/db.py`, `backend/models/auth.py`, `backend/.env.example`, `render.yaml`.
- Pedidos e catálogo: `backend/routers/orders.py`, `backend/routers/catalog.py`, `backend/routers/favorites.py`, `backend/routers/admin.py`, `backend/models/orders.py`, `backend/server.py`.
- Bootstrap: `backend/seed.py`, `backend/scripts/bootstrap_staging_admin.py`.
- Frontend: `frontend/src/pages/Login.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/admin/AdminOrders.tsx`, `frontend/src/lib/types.ts`.
- Testes: `backend/tests/test_security.py`, `backend/tests/test_runtime_config.py`, `tests/e2e/security.spec.ts`.
- Documentação e segurança operacional: `CONFIRMED_VULNERABILITIES_REPORT.md`, `EXTERNAL_PENTEST_REPORT.md`, `EMAIL_VERIFICATION_SETUP.md`, `README.md`, `PRODUCTION_INFRA_CHECKLIST.md`, `PRODUCTION_SECRET_ROTATION.md`, `PRODUCTION_SECURITY_REPORT.md`, `STAGING_DEPLOYMENT_REPORT.md`, `scripts/scan_secrets.py`.

## Configurações necessárias para produção

- `AUTH_EMAIL_WEBHOOK_URL`: endpoint HTTPS real do serviço de entrega.
- `AUTH_EMAIL_WEBHOOK_TOKEN`: segredo aleatório de pelo menos 32 bytes.
- `AUTH_EMAIL_WEBHOOK_ALLOWED_HOSTS`: hostname exato do endpoint.
- `ORDER_RESERVATION_MINUTES`: de 5 a 60; padrão recomendado `15`.
- `ORDER_RESERVATION_REAPER_SECONDS`: de 10 a 300; padrão recomendado `60`.
- MongoDB precisa continuar como replica set, pois confirmação de e-mail e estoque dependem de transações.
- O serviço de e-mail deve aceitar `verify_email`, `registration_notice` e `reset_password`, sem registrar tokens.

## Pendências

1. Configurar o provedor real de e-mail no Render e validar recebimento, expiração, reenvio e uso único em uma caixa controlada.
2. Publicar o código corrigido no staging e repetir os ataques HTTP contra as URLs públicas. O staging atual ainda executa a versão anterior.
3. Conduzir a confirmação dos compradores legados que não possuem `email_verified=true`.
4. Executar o roteiro PayPal Sandbox antes de habilitar pagamentos.
5. Manter `PAYMENTS_PAUSED=true` até os itens 1–4 terminarem.

**Conclusão para produção:** existe um bloqueador conhecido: a entrega real de confirmação de e-mail ainda não foi configurada nem testada. O código falha fechado sem ela. A produção e os pagamentos não devem ser habilitados enquanto essa integração, o deploy do staging e o ensaio PayPal Sandbox não forem concluídos.
