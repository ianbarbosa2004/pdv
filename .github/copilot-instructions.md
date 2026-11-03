# Instruções persistentes para IA

Estas instruções complementam `README.md` e os documentos em `docs/`.

## Contexto e arquitetura

- O PDV usa Node.js com módulos ES, Vite, JavaScript, Tauri 2, Rust/Cargo e
  MariaDB via `mysql2`.
- O computador servidor da loja hospeda a API Node.js e o MariaDB.
- Os terminais Tauri acessam somente a API pela rede local; nunca recebem
  credenciais nem executam SQL diretamente.
- Regras compartilhadas ficam em `src/shared`; telas e componentes ficam em
  `src/catalog`, `src/sales`, `src/settings`, `src/tools` e `src/ui`; API e
  banco ficam em `src/server/`; a camada nativa fica em `src-tauri/`.
- `database/schema.sql` é o schema inicial e deve evoluir por migrações revisadas.

### Fluxo de dados

Preserve o fluxo:

```text
interface → API → validação → transação MariaDB → nova leitura → interface
```

Operações compostas devem ser atômicas. Uma venda só é confirmada depois de
persistir itens, pagamentos e baixa de estoque na mesma transação.

## Desenvolvimento e validação

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run api
npm.cmd test
git diff --check
```

Execute `npm.cmd run build` somente quando a alteração envolver o bundle,
configuração Vite/Tauri, versionamento ou uma validação de produção. Use
`node --check` nos arquivos JavaScript modificados.

Quando necessário, valide o ambiente Tauri com `npm.cmd exec tauri info` e
compile com `npm.cmd run tauri -- build --no-bundle`.

## Convenções

- Faça alterações pequenas, testáveis e compatíveis com os contratos existentes.
- Use SQL parametrizado e trate erros de banco explicitamente.
- Regras de domínio devem ser reutilizáveis entre cliente e servidor quando
  aplicável.
- O frontend só confirma uma escrita após sucesso da API; em falhas, restaure
  o estado visual anterior.
- Não duplique fontes de verdade entre vendas, estoque, caixa e relatórios.
- Impressão é local ao terminal, usa o driver do Windows e é separada da
  confirmação da venda.
- Use `node:test`; não introduza Jest ou Vitest sem decisão explícita.
- Crie testes isolados em `tests/unit/` e testes de API, banco ou contratos em
  `tests/integration/`.
- Crie documentação operacional e decisões técnicas em `docs/`, mantendo o
  `README.md` como visão geral e índice.
- Documente automaticamente alterações de código nos Markdown diretamente
  relacionados quando mudarem contrato, operação, arquitetura, validação,
  segurança ou comportamento visível.
- Siga SemVer: o hook `prebuild` e o fluxo `prerelease:client` podem acionar o
  versionamento automático quando o build é executado; use
  `npm.cmd run version:minor` para funcionalidades compatíveis e
  `npm.cmd run version:major` para mudanças incompatíveis ou a primeira versão
  estável.

## Segurança e operação

- Nunca versione `.env`, senhas, tokens, chaves privadas, dados reais, dumps,
  backups, `node_modules/`, `dist/` ou `src-tauri/target/`.
- Nunca registre credenciais, payloads sensíveis ou dados desnecessários.
- Não exponha a porta MariaDB aos terminais; eles acessam somente a API.
- Não use comandos destrutivos para apagar trabalho local.
- Não faça commit, push, merge ou publicação sem autorização explícita.
- Push direto, quando autorizado, é somente para `main`, sem force push.
- A publicação ainda não possui script oficial; não use procedimentos
  externos ou não documentados.

Use as instruções específicas em `.github/instructions/` e os prompts em
`.github/prompts/` sem contradizer os documentos canônicos de `docs/`.
