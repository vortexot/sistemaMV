# Recuperação administrativa de MFA

## Fluxo normal

O titular usa um recovery code de uso único no campo de segundo fator. Depois de entrar, confirma novamente a identidade e gera novos códigos em **Segurança**. A regeneração invalida todos os códigos anteriores e encerra as sessões existentes.

## Perda do autenticador e dos recovery codes

1. Confirmar a identidade do titular pelo procedimento organizacional aprovado. Não pedir nem escolher a senha dele.
2. Um **outro** administrador entra, conclui a reautenticação com senha e MFA e chama `POST /api/auth/mfa/admin-recovery/request/{user_id}`.
3. A API revoga as sessões do titular, mantém o MFA antigo ativo até a conclusão, registra `MFA_RECOVERY_REQUEST` e mostra um token aleatório somente nessa resposta.
4. Transferir o token ao titular por canal restrito aprovado. Não colocá-lo em ticket, log, e-mail aberto ou histórico de comando.
5. O titular chama `POST /api/auth/mfa/admin-recovery/setup` com o próprio e-mail, a própria senha e o token. A resposta contém a nova chave TOTP temporária.
6. Depois de cadastrar a chave, o titular chama `POST /api/auth/mfa/admin-recovery/complete` com os mesmos três dados e o TOTP atual.
7. A conclusão substitui o TOTP, cria novos recovery codes, invalida o token administrativo, revoga novamente as sessões e registra `MFA_RECOVERY_COMPLETE`.
8. O titular guarda os novos códigos fora do sistema e testa um novo login. O administrador confere os dois eventos no coletor externo.

O token administrativo expira em 30 minutos. A configuração TOTP iniciada expira em 10 minutos. Repetir o token concluído falha. Um comprador não pode solicitar recuperação e um administrador não pode recuperar a própria conta.

## Administrador único

Não existe bypass especial. O administrador deve manter recovery codes em cofre separado e restaurável. Se não houver segundo administrador real, a criação e validação de uma conta administrativa de contingência é **AÇÃO DO RESPONSÁVEL** antes de produção. Nunca criar conta fictícia, compartilhar senha ou desativar `MFA_REQUIRED` para contornar a perda do fator.
