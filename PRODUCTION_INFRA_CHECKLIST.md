# Checklist de infraestrutura real

Use primeiro em staging. Registre evidência, responsável e data em cada item. Não coloque secrets ou dumps neste arquivo.

## Aplicação e rede

- [ ] Domínio de staging usa HTTPS válido; HTTP redireciona para HTTPS.
- [ ] `PUBLIC_ORIGIN` e `CORS_ORIGINS` contêm somente origens HTTPS exatas.
- [ ] Backend não está exposto fora do proxy/firewall necessário.
- [ ] `FORWARDED_ALLOW_IPS` contém apenas IPs/CIDRs reais do proxy, nunca `*` ou `/0`.
- [ ] Cookies têm `Secure`, `HttpOnly` e `SameSite`; HSTS e demais headers foram verificados no domínio final.
- [ ] `APP_ENV=staging`; PayPal Live é recusado pelo startup.
- [ ] Todas as contas internas ativas possuem MFA e existe pelo menos um admin ativo.

## MongoDB

- [ ] Endpoint privado ou allowlist restrita, autenticação e TLS ativos.
- [ ] Usuário da aplicação tem privilégio mínimo no database correto.
- [ ] Replica set/transações são suportados e os índices obrigatórios passam no startup.
- [ ] Testes usam banco sintético separado; nenhum teste destrutivo aponta para produção.
- [ ] Backup gerenciado está habilitado, criptografado e com acesso separado.

## Storage

- [ ] `STORAGE_DIR` é caminho absoluto em volume persistente; `STORAGE_PERSISTENT=true` somente depois de comprovar isso.
- [ ] Upload permanece após reinício/substituição da instância.
- [ ] Permissões do volume impedem leitura por serviços não autorizados.
- [ ] Snapshot do banco e arquivos pertence à mesma janela consistente.

## Secrets, logs e alertas

- [ ] Secrets estão no secrets manager e não em imagem, repositório, variável pública ou log.
- [ ] Rotação foi ensaiada conforme `PRODUCTION_SECRET_ROTATION.md`.
- [ ] `security.audit` e `security.alert` de stdout são enviados por TLS a coletor logicamente separado, com acesso e retenção restritos.
- [ ] Alertas acionáveis existem para `ROLE_CHANGE`, `MFA_DISABLED`, `MFA_RECOVERY_REQUEST`, `MFA_RECOVERY_COMPLETE`, rate limit de login e `PAYMENT_AMBIGUOUS`.
- [ ] O coletor preserva JSON, horário UTC, `request_id`, ator/alvo e não aceita alteração pelo operador da aplicação.

## Backup e restore remoto

- [ ] Fazer backup remoto do Mongo e storage sem sobrescrever o backup local pré-pentest.
- [ ] Restaurar em ambiente isolado com credenciais próprias e rede sem acesso público.
- [ ] Validar contagens, usuários, pedidos/itens, totais, referências PayPal, arquivos e leitura de imagens.
- [ ] Executar uma transação sintética e confirmar índices na cópia restaurada.
- [ ] RPO medido: `__________`; evidência: `__________`.
- [ ] RTO medido: `__________`; evidência: `__________`.
- [ ] Destruir ou reter a cópia restaurada conforme política aprovada, registrando a decisão.

## Gate de avanço

- [ ] Smoke tests passaram em staging.
- [ ] PayPal Sandbox passou conforme `PAYPAL_SANDBOX_TEST.md` e voltou a ficar pausado.
- [ ] Backup/restore remoto foi comprovado.
- [ ] Alertas foram recebidos por pessoa responsável.
- [ ] Pentest independente foi autorizado, executado e seus achados tratados antes de produção.
