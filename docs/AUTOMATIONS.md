# Automações do projeto

Este documento descreve a configuração canônica das automações do **PDV**.
As automações são manuais, executam uma por vez e usam exclusivamente o
projeto `pdv` no checkout de desenvolvimento.

## Configuração canônica

| Nome | Modo | Workspace | Fonte | Responsabilidade |
| --- | --- | --- | --- | --- |
| `sincronizar desenvolvimento` | `autopilot` | `branch` | `main` | Finalizar ou retomar o desenvolvimento |
| `atualizar readme` | `autopilot` | `branch` | `main` | Atualizar a documentação afetada |
| `atualizar repositorio` | `autopilot` | `branch` | `main` | Integrar código, testes e documentação |
| `publicar online` | `autopilot` | `branch` | `main` | Publicar no servidor da loja, quando o procedimento existir |

Todas pertencem ao projeto `pdv`, têm intervalo `manual`, ambiente `local` e
operam no checkout de desenvolvimento. Para preservar uma fonte única:

- não use `worktree`, cópia temporária, checkout alternativo ou outro projeto;
- não configure `remote_branch` em ambiente local;
- use `main` como branch oficial somente quando a operação exigir integração;
- permita push direto somente para `main`;
- nunca use `git push --force`, `--force-with-lease` ou exclusão de branch.

IDs de automações e execuções são específicos de cada computador e não devem
ser copiados para outro ambiente. Ao configurar a plataforma, use os nomes,
parâmetros e prompts versionados neste documento e em
[`AUTOMATION-PROMPTS.md`](AUTOMATION-PROMPTS.md).

## Regras comuns

Antes de qualquer build, teste, commit, push ou publicação:

```powershell
git status --short
git diff --cached
git diff
```

As automações devem:

- tratar o checkout local como fonte prioritária;
- classificar alterações staged, não staged e não rastreadas;
- preservar alterações locais seguras;
- interromper se a origem, intenção ou segurança de um arquivo for ambígua;
- preservar `.env`, credenciais, chaves privadas, dados reais, dumps e
  backups do MariaDB;
- preservar `node_modules/`, `dist/` e `src-tauri/target/`;
- executar as validações previstas antes de declarar sucesso;
- interromper em caso de erro, divergência ou arquivo protegido inesperado;
- atualizar a documentação quando o contrato operacional mudar.

Nunca use `git reset --hard`, `git checkout --`, `git restore`, `git clean` ou
qualquer equivalente para apagar trabalho local. Não crie PR, faça merge,
push ou publicação sem autorização explícita.

## `sincronizar desenvolvimento`

É uma automação manual com duas operações. Antes de qualquer comando, pergunte:

> Qual operação deseja executar: (1) Finalizar trabalho neste computador ou
> (2) Retomar/continuar trabalho neste computador?

### Finalizar trabalho neste computador

1. Identifique e preserve as alterações locais pertencentes ao PDV.
2. Exclua do escopo `.env`, credenciais, dados reais, dumps, backups,
   `node_modules/`, `dist/` e `src-tauri/target/`.
3. Execute `npm.cmd test`, `npm.cmd run build`, `node --check
   src/server/server.js` e `git diff --check`.
4. Crie um checkpoint com o trailer:

   ```text
   Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
   ```

5. Faça push somente para `origin main`, quando explicitamente autorizado.
6. Informe o SHA publicado.

Não faça deploy, merge ou force push.

### Retomar/continuar trabalho neste computador

Só prossiga se o checkout estiver limpo. Confirme o remoto e a branch, execute
`git fetch origin main` e use somente `git pull --ff-only origin main` quando
estiver atrás. Depois leia `README.md` e os documentos operacionais vigentes,
execute as validações e informe o SHA sincronizado.

Se houver qualquer alteração local, não faça pull nem sobrescreva arquivos:
informe os caminhos e interrompa.

## `atualizar readme`

Analise as implementações recentes e atualize somente a documentação
relacionada ao estado real do PDV, incluindo `README.md` e `docs/*.md`.

Execute:

```powershell
npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check
```

Só crie commit quando houver mudança documental real. Push para `main`
depende de autorização explícita. Não faça deploy.

## `atualizar repositorio`

Integre somente alterações pertencentes ao PDV. Preserve credenciais, dados
reais, arquivos de runtime, dumps, backups e artefatos gerados.

Execute:

```powershell
npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check
```

Quando houver mudanças reais, crie um commit com o trailer padrão. Push direto
para `origin main` só pode ocorrer após autorização explícita. Não faça merge,
force push ou deploy.

## `publicar online`

Esta automação permanece documentada para uso futuro, mas **não deve ser
executada ainda**. O PDV atualmente não possui um script oficial de publicação
do servidor da loja.

Quando o procedimento for definido, ele deverá:

- publicar somente o estado validado de `main`;
- confirmar que o checkout não possui alterações pendentes;
- preservar o banco MariaDB e seus backups;
- nunca enviar `.env`, credenciais, chaves privadas, dumps, `node_modules/`,
  `dist/` ou `src-tauri/target/` sem uma regra explícita;
- validar a API e a conexão com o MariaDB após a publicação;
- registrar a versão efetivamente publicada.

Não use cPanel, Passenger ou scripts do projeto anterior como substitutos.

## Ordem operacional

Quando o usuário solicitar integração e publicação:

1. `sincronizar desenvolvimento`;
2. `atualizar readme`, se houver documentação pendente;
3. `atualizar repositorio`;
4. `publicar online`, somente depois que o procedimento existir e houver
   autorização explícita.

Analise o resultado de cada etapa antes de iniciar a próxima. Alterações de
schema, migrações, foreign keys ou persistência MariaDB exigem validação da API
e do banco após uma publicação autorizada.
