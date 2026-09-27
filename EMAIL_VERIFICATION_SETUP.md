# Entrega de verificação de e-mail

O backend não envia nem simula e-mail por conta própria. Em staging e produção ele exige um webhook HTTPS autenticado, configurado pelas variáveis abaixo:

- `AUTH_EMAIL_WEBHOOK_URL`: URL HTTPS completa do serviço de entrega.
- `AUTH_EMAIL_WEBHOOK_TOKEN`: segredo aleatório com pelo menos 32 bytes, enviado como `Authorization: Bearer ...`.
- `AUTH_EMAIL_WEBHOOK_ALLOWED_HOSTS`: hostname exato permitido para o webhook, sem esquema.

O startup recusa staging/produção quando a URL não usa HTTPS, o host não está na allowlist ou o token é fraco. O endpoint não segue redirecionamentos.

## Contrato do webhook

O backend envia JSON com uma das ações:

```json
{
  "action": "verify_email",
  "email": "cliente@example.com",
  "token": "valor-secreto-entregue-somente-ao-destinatario",
  "expires_in_seconds": 1800,
  "site": "https://loja.example"
}
```

```json
{
  "action": "registration_notice",
  "email": "cliente@example.com",
  "site": "https://loja.example"
}
```

```json
{
  "action": "reset_password",
  "email": "cliente@example.com",
  "token": "valor-secreto-entregue-somente-ao-destinatario",
  "expires_in_seconds": 1800,
  "site": "https://loja.example"
}
```

O serviço deve responder `2xx` somente depois de aceitar a mensagem para entrega. Ele não pode registrar o header de autorização nem o campo `token`. O template de verificação deve deixar claro que o destinatário não deve confirmar uma solicitação que não iniciou.

O backend armazena apenas SHA-256 do token. Cada novo envio invalida o anterior; a confirmação exige o token e a mesma senha usada naquela tentativa, usa transação, expira em 30 minutos, funciona uma vez e revoga sessões antigas pela versão da conta. A senha nunca é enviada ao webhook.

## Ativação

1. Criar o endpoint no provedor de e-mail e cadastrar o segredo nos dois lados.
2. Configurar as três variáveis no Render sem copiar valores para o repositório.
3. Fazer deploy no staging.
4. Cadastrar uma caixa de teste controlada e confirmar recebimento, conteúdo, expiração e uso único.
5. Verificar que cadastro novo e cadastro repetido continuam respondendo `202` com o mesmo corpo.
6. Rotacionar o token do webhook antes da produção e guardar a credencial no secrets manager.

## Contas anteriores

Compradores antigos sem `email_verified=true` deixam de autenticar. Cada titular deve repetir o cadastro com o próprio e-mail e senha desejada, receber o token e confirmar. Contas de equipe provisionadas pelo script administrativo continuam compatíveis e novos registros administrativos recebem `email_verified=true` no bootstrap.

**Estado atual:** a implementação e os testes locais estão completos; a entrega por um provedor real ainda requer validação no staging.
