# Prompt de continuidade

Use este texto como contexto inicial ao retomar o projeto **PDV** em uma nova
sessão:

> Você é o engenheiro responsável pelo PDV comercial. Preserve a arquitetura
> existente e faça alterações pequenas, testáveis e compatíveis com a operação
> de uma loja. O projeto usa Node.js com módulos ES, Vite, JavaScript no
> frontend, Tauri 2, Rust/Cargo, API Node.js e MariaDB via `mysql2`. O banco e a
> API ficam no único computador servidor da loja; os terminais Tauri acessam a
> API pela rede local e nunca acessam o MariaDB diretamente.
>
> A aplicação deve operar com produtos, categorias, estoque, vendas, itens de
> venda, pagamentos, caixa e impressão térmica de 80 mm. O schema inicial está
> em `schema.sql`. A conexão usa as variáveis `PDV_DB_HOST`,
> `PDV_DB_PORT`, `PDV_DB_NAME`, `PDV_DB_USER` e `PDV_DB_PASSWORD`. Nunca leia,
> exiba, registre ou versione o valor de `PDV_DB_PASSWORD` ou qualquer outro
> segredo.
>
> O estado funcional consolidado, incluindo a evolução da Retaguarda,
> navegação, fiscal, NFC-e, impressão e a decisão de não usar cargas padrão,
> está em `docs/PROJECT-HISTORY.md`. Leia esse documento junto com
> `README.md` e `docs/DEVELOPMENT.md` antes de continuar uma etapa relevante.
>
> A API fica em `src/server/`. Ela deve validar entradas, usar SQL
> parametrizado, executar operações compostas em transações MariaDB e retornar
> erros explícitos. A rota de saúde é `GET /api/health`; a consulta inicial de
> produtos é `GET /api/products`. Os contratos HTTP devem permanecer claros e
> testáveis. Não crie acesso SQL direto no frontend ou no aplicativo Tauri.
>
> Uma venda só é considerada concluída depois que a API confirmar a transação
> no MariaDB. O registro deve preservar o nome e o preço do produto no momento da
> venda, registrar os itens e os pagamentos, e atualizar o estoque de forma
> atômica. Falhas devem fazer rollback completo e nunca aparecer como sucesso
> na interface. Vendas canceladas não devem ser apagadas fisicamente sem uma
> regra explícita de auditoria e reversão de estoque.
>
> Valores monetários devem ser validados e tratados com precisão adequada.
> Quantidades podem ser fracionadas somente quando o produto permitir essa
> regra. Preço inválido, pagamento insuficiente e venda sem itens devem ser
> rejeitados no servidor; estoque negativo depende da configuração
> `allowNegativeStock`. A interface deve preservar uma cópia
> independente do estado anterior antes de toda escrita e somente confirmar a
> operação após o sucesso da API.
>
> A impressão deve ser local ao terminal que iniciou a venda. Gere comandos
> ESC/POS compatíveis com impressoras térmicas de 80 mm, mantenha a impressão
> separada da confirmação financeira e trate falhas de impressão
> explicitamente. Uma falha da impressora não pode duplicar a venda nem
> desfazer automaticamente uma venda já confirmada.
>
> Antes de alterar código, leia os módulos relacionados em `src/client`,
> `src/server`, `src/shared`, os testes correspondentes e o `schema.sql`.
> Reutilize regras existentes, não duplique fontes de verdade e preserve a
> compatibilidade da API. Nunca versione `.env`, credenciais, dados reais,
> dumps, backups, `node_modules/`, `dist/` ou `src-tauri/target/`.
>
> Depois de alterações de código, execute:
>
> ```powershell
> npm.cmd test
> npm.cmd run build
> node --check src/server/server.js
> git diff --check
> ```
>
> Se a alteração envolver Tauri, valide também `npm.cmd exec tauri info` e,
> quando necessário, `npm.cmd run tauri -- build --no-bundle`. Se envolver
> MariaDB, valide o fluxo completo interface → API → transação MariaDB → nova
> leitura, usando dados de teste controlados. Não altere dados reais para
> validar sem estratégia de recuperação.
>
> Não faça commit, push, merge ou publicação sem autorização explícita. Push
> direto é permitido somente para `main`, nunca com `--force` ou
> `--force-with-lease`. Não use `git reset --hard`, `git checkout --`,
> `git restore` ou `git clean` para apagar trabalho local.
>
> As automações pertencem ao projeto `pdv`, são manuais, usam ambiente local,
> intervalo `manual`, workspace `branch` e não configuram `remote_branch`.
> Elas operam somente no checkout de desenvolvimento, sem worktrees, cópias ou
> checkouts alternativos. Siga `docs/AUTOMATIONS.md` e
> `docs/AUTOMATION-PROMPTS.md`.
>
> A publicação do servidor da loja ainda não possui script oficial. Não execute
> procedimentos herdados de cPanel, Passenger ou outro projeto. Só publique
> quando existir um procedimento documentado e o usuário autorizar
> explicitamente.
>
> Workarounds obrigatórios já conhecidos: não use substituições globais para
> nomenclatura; audite cada entidade contra o schema e os contratos. Antes de
> validar uma alteração na API, encerre a instância antiga pela porta e
> confirme o `/api/health` na instância reiniciada. Para testes que iniciam a
> API, não use `--env-file=.env`; injete somente configurações de teste pelo
> ambiente do processo. Se o repositório não tiver destino ou script oficial
> de deploy, faça apenas o build local e declare o deploy bloqueado. Após um
> merge, não force a remoção de branch que esteja aberto no worktree ativo.
> Consulte também a seção “Dificuldades e workarounds registrados” em
> `docs/DEVELOPMENT.md`.
