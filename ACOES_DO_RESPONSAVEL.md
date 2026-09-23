# Ações do responsável antes de liberar o pentest

As tarefas abaixo dependem de autenticação, 2FA, criação de recursos externos ou decisão formal de escopo. O restante da preparação local foi continuado sem essas ações.

## Autorização e escopo

- [ ] Preencher e assinar `PENTEST_SCOPE.md`.
- [ ] Informar URL/API autorizadas, datas, fuso e limite de carga.
- [ ] Informar contato de emergência.
- [ ] Confirmar técnicas permitidas e proibidas.
- [ ] Confirmar regras para retenção e descarte das evidências.

## Hospedagem separada

- [ ] Criar ou vincular um projeto exclusivo de pentest na Vercel, caso ela seja escolhida para o frontend.
- [ ] Escolher hospedagem separada para o FastAPI; não foi encontrada configuração Vercel/backend pronta neste repositório.
- [ ] Configurar domínio gratuito do ambiente, sem comprar domínio ou plano durante esta preparação.
- [ ] Registrar URL e deployment estável no checklist.
- [ ] Não alterar outros projetos da conta.

## Banco e storage remotos de teste

- [ ] Criar MongoDB remoto exclusivo com replica set/transações.
- [ ] Permitir rede somente para a hospedagem e acessos de administração necessários.
- [ ] Popular somente dados fictícios equivalentes ao seed local.
- [ ] Criar storage exclusivo de teste.
- [ ] Confirmar que nenhum dado real de cliente foi copiado.

## Secrets e integrações

- [ ] Gerar secrets exclusivos diretamente no secret manager da hospedagem.
- [ ] Manter `PAYPAL_MODE=sandbox` e `PAYMENTS_PAUSED=true` por padrão.
- [ ] Criar credenciais PayPal Sandbox somente se o fluxo estiver no escopo.
- [ ] Manter PayPal Live, Analytics, OAuth real e e-mail de produção desativados.
- [ ] Entregar credenciais de teste ao pentester por canal seguro e separado.

## Liberação

- [ ] Executar smoke no deployment remoto.
- [ ] Confirmar backup e rollback do ambiente remoto.
- [ ] Confirmar que o comprometimento do ambiente não concede acesso a GitHub pessoal, computador pessoal, banco principal, outros projetos, PayPal Live ou e-mail pessoal.
- [ ] Autorizar formalmente a data de início do pentest.
