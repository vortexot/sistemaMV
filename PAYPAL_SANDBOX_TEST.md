# Teste PayPal Sandbox

**AÇÃO DO RESPONSÁVEL:** fornecer credenciais Sandbox próprias. Não usar credenciais Live. Manter `PAYMENTS_PAUSED=true` até iniciar a janela de teste controlada em staging.

## Pré-condições

- `APP_ENV=staging`, HTTPS ativo e `PAYPAL_MODE=sandbox`.
- Backup/restore de staging validado e dados exclusivamente sintéticos.
- Configurar `PAYPAL_CLIENT_ID` e `PAYPAL_CLIENT_SECRET` pelo secrets manager.
- Alterar `PAYMENTS_PAUSED=false` apenas durante o ensaio autorizado.
- Confirmar que o recebedor exibido no painel Sandbox pertence à conta de teste correta.

## Roteiro

1. Criar um pedido com chave de idempotência nova e confirmar preço, quantidade, moeda BRL e reserva de estoque no servidor.
2. Iniciar o pagamento e aprová-lo com uma conta compradora Sandbox.
3. Capturar pela API da aplicação e comparar pedido local, PayPal Order ID, valor, moeda, recebedor e status no painel Sandbox.
4. Repetir a captura. O resultado deve continuar pago sem nova cobrança nem nova movimentação de estoque.
5. Criar outro pedido, aprovar no Sandbox e interromper a resposta da aplicação depois da ação no provedor.
6. Executar `POST /api/payments/paypal/reconcile` como dono do pedido ou `POST /api/admin/payments/paypal/reconcile` como admin com autenticação recente.
7. Repetir a conciliação. Ela deve consultar o provedor no máximo até o estado local chegar a `pago`; nunca deve capturar novamente.
8. Simular indisponibilidade e resposta divergente. O pedido deve permanecer bloqueado ou usar `revisao_necessaria`, com evento `PAYMENT_AMBIGUOUS`.
9. Conferir eventos `PAYMENT_STATE_CHANGE`, `PAYMENT_RECONCILIATION` e alertas no coletor de staging.
10. Voltar `PAYMENTS_PAUSED=true` ao final e registrar IDs Sandbox e resultados sem copiar tokens ou secrets.

## Estorno inicial

O primeiro lançamento não possui endpoint de estorno. Quando necessário, o responsável financeiro deve localizar a captura pelo PayPal Order ID no painel oficial, executar o estorno ali, registrar o identificador e reconciliar manualmente pedido, estoque e contabilidade. Não alterar o banco para simular estorno. Automatização fica para pós-lançamento após regras financeiras e testes próprios.

## Webhooks

O sistema não possui receptor PayPal ativo. Não cadastrar URL de webhook até existir validação pelo mecanismo oficial do PayPal, deduplicação e teste de replay.
