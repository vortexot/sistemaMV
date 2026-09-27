# Ativação comercial da loja

O código aceita retirada, motoboy regional, Correios e pagamento PayPal. As credenciais devem pertencer ao comprador da loja e ser cadastradas somente no painel da Render; nunca no GitHub.

## 1. Frete dos Correios

1. Criar uma conta empresarial no [Meu Correios](https://meucorreios.correios.com.br/).
2. Firmar contrato comercial e pedir a liberação do serviço **38202 — API Preços** no contrato e no cartão de postagem.
3. No [Correios Web Services](https://cws.correios.com.br/), criar o código de acesso às APIs.
4. Testar primeiro em homologação com `CORREIOS_ENV=homologation`.
5. Cadastrar na Render:
   - `CORREIOS_USERNAME`: usuário Meu Correios;
   - `CORREIOS_API_CODE`: código de acesso criado no CWS;
   - `CORREIOS_POSTING_CARD`: cartão de postagem;
   - `CORREIOS_CONTRACT`: número do contrato;
   - `CORREIOS_DR`: regional do contrato;
   - `CORREIOS_ENABLED=true`.
6. Conferir peso e embalagem usados na cotação: `CORREIOS_ITEM_WEIGHT_GRAMS`, `CORREIOS_PACKAGE_LENGTH_CM`, `CORREIOS_PACKAGE_WIDTH_CM` e `CORREIOS_PACKAGE_HEIGHT_CM`.
7. Depois da homologação, trocar para `CORREIOS_ENV=production`, usar as credenciais de produção e publicar novamente.

Por padrão, o sistema consulta PAC (`03298`) e SEDEX (`03220`) e oferece o serviço disponível de menor preço. Outros códigos contratados podem ser informados em `CORREIOS_SERVICE_CODES`.

## 2. Pagamento PayPal

1. O comprador da loja cria ou valida uma conta PayPal Business.
2. No [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), cria uma aplicação e copia primeiro as credenciais Sandbox.
3. Na Render, configura `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` e mantém `PAYMENTS_PAUSED=true`.
4. Executa o roteiro de `PAYPAL_SANDBOX_TEST.md` com comprador e vendedor de teste.
5. Cria as credenciais Live, configura um backend de produção com `APP_ENV=production`, `PAYPAL_MODE=live` e os segredos Live.
6. Só depois dos testes altera `PAYMENTS_PAUSED=false` e publica novamente.

O backend cria e captura a cobrança em BRL, valida o valor no retorno do PayPal, evita captura repetida e só confirma o pedido depois do pagamento aprovado. O segredo PayPal nunca vai para o navegador.

## 3. Antes de vender ou transferir

- Transferir GitHub, Vercel, Render, domínio e banco de dados para contas do comprador.
- O comprador deve criar credenciais próprias de PayPal, Correios e e-mail; não reutilizar as do vendedor.
- Configurar o serviço de e-mail descrito em `EMAIL_VERIFICATION_SETUP.md`; em produção ele é obrigatório para cadastro e recuperação de senha.
- Trocar `PUBLIC_ORIGIN` e `CORS_ORIGINS` para o domínio definitivo.
- Rotacionar `JWT_SECRET`, `MFA_ENCRYPTION_KEY` e todos os tokens após a transferência.
- Fazer uma compra real de baixo valor, conferir recebimento, frete, estoque, pedido, estorno e conciliação antes de abrir a loja ao público.

PayPal é o meio já implementado. Pix e cartão direto exigem contrato e integração separados com um provedor brasileiro; não devem ser simulados nem ativados sem credenciais do novo proprietário.
