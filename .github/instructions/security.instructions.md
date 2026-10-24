---
applyTo: '**/*'
description: 'Segurança e proteção de dados do PDV'
---

# Segurança

- Nunca versione `.env`, credenciais, chaves privadas, dados reais, dumps,
  backups, `node_modules`, `dist` ou `src-tauri/target`.
- Nunca exponha a senha do MariaDB aos terminais; somente a API acessa o banco.
- Use SQL parametrizado e transações para operações compostas.
- Valide autorização e entrada no servidor, não apenas na interface.
- Não registre senhas, tokens, dados de pagamento ou payloads sensíveis.
- Retorne erros explícitos; nunca transforme falha de banco em sucesso.
- Não execute migrações destrutivas sem backup, revisão e autorização.
- Não faça deploy ou push sem autorização explícita.
