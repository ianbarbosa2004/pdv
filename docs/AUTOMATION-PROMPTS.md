# Prompts técnicos das automações

Este arquivo é o contrato versionado dos prompts definidos em
[`AUTOMATIONS.md`](AUTOMATIONS.md). Ao recriar uma automação em outro
computador, mantenha os nomes e o conteúdo destes prompts.
O histórico técnico consolidado está em
[`PROJECT-HISTORY.md`](PROJECT-HISTORY.md) e deve ser consultado quando uma
automação for atualizar documentação ou retomar uma etapa funcional.

## Parâmetros comuns

- Projeto: `pdv`
- Ambiente: `local`
- Intervalo: `manual`
- Modo: `autopilot`
- Workspace: `branch`
- Fonte: checkout de desenvolvimento
- `remote_branch`: vazio
- Proibido: `worktree`, cópia temporária, checkout alternativo e outro projeto
- Push: somente `git push origin main`, quando explicitamente autorizado
- Proibido: `--force`, `--force-with-lease` e exclusão de branch

Antes de qualquer build, teste, commit, push ou publicação, execute:

```powershell
git status --short
git diff --cached
git diff
```

O checkout local é a fonte prioritária. Preserve alterações staged, não
staged e não rastreadas pertencentes ao PDV. Nunca inclua `.env`, credenciais,
chaves privadas, dados reais, dumps, backups, `node_modules/`, `dist/` ou
`src-tauri/target/`.

Nunca use `git reset --hard`, `git checkout --`, `git restore`, `git clean` ou
qualquer equivalente para apagar trabalho local. Se a origem, intenção ou
segurança de um arquivo for ambígua, interrompa e informe o caminho.

## `sincronizar desenvolvimento`

```text
Use somente o checkout local do projeto pdv, no checkout de desenvolvimento.
Esta automação é manual e tem duas operações. Antes de executar qualquer
comando, faça exatamente uma pergunta ao usuário:

“Qual operação deseja executar: (1) Finalizar trabalho neste computador ou
(2) Retomar/continuar trabalho neste computador?”

Não escolha a operação pelo estado do Git. Use a resposta do usuário; o estado
do checkout serve apenas para bloquear uma operação incompatível e preservar
o trabalho local.

OPERAÇÃO 1 — FINALIZAR TRABALHO NESTE COMPUTADOR

Execute git status --short, git diff --cached, git diff e git diff --check.
Classifique as alterações e preserve as que pertencem ao PDV. Não inclua
.env, credenciais, chaves privadas, dados reais, dumps, backups, node_modules,
dist ou src-tauri/target. Se houver dúvida, pare e informe os caminhos.

Execute:

npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check

Se o Tauri estiver configurado e as dependências nativas disponíveis, valide
também npm.cmd exec tauri info. Não faça a compilação nativa completa sem
necessidade operacional.

Quando houver alterações de desenvolvimento seguras, crie um commit de
checkpoint com:

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>

Faça push somente para origin main quando isso tiver sido explicitamente
autorizado. Informe o SHA publicado. Não faça PR, merge, deploy ou force push.
Se não houver alterações de desenvolvimento, não crie commit vazio.

OPERAÇÃO 2 — RETOMAR/CONTINUAR TRABALHO NESTE COMPUTADOR

Só prossiga se o checkout estiver limpo. Confirme git remote -v e
git branch --show-current. Execute git fetch origin main e compare
git rev-parse HEAD com git rev-parse origin/main. Se estiver atrás, execute
somente git pull --ff-only origin main.

Depois leia README.md, docs/AI-TOOLS.md, docs/AUTOMATIONS.md,
docs/AUTOMATION-PROMPTS.md, docs/CONTINUITY-PROMPT.md e docs/DEPLOYMENT.md.
Incorpore as diretrizes vigentes ao restante da sessão e execute as
validações do projeto. Não edite esses Markdown como parte desta operação.

Se houver qualquer alteração local, não faça pull nem sobrescreva arquivos:
informe os caminhos e interrompa. Em caso de divergência de histórico,
remoto, branch ou falha de rede, pare sem resolver destrutivamente.

Nunca use reset --hard, checkout --, restore, clean, force push, PR, merge ou
deploy durante esta automação.
```

## `atualizar readme`

```text
Use somente o checkout de desenvolvimento do projeto pdv como fonte única.
Não use worktrees, cópias ou checkouts alternativos. Analise as implementações
recentes e atualize somente a documentação realmente afetada, principalmente
README.md e docs/*.md.

Preserve .env, credenciais, chaves privadas, dados reais, dumps, backups,
node_modules, dist e src-tauri/target. Execute:

npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check

Só crie commit quando houver alterações documentais reais. O commit deve
conter:

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>

Faça push direto para origin main somente com autorização explícita. Não use
force push, não exclua branch, não crie PR, não faça merge e não faça deploy.
```

## `consolidar documentação do PDV`

```text
Use somente o checkout de desenvolvimento do projeto pdv como fonte única.
Consolide a documentação do PDV com base no código, testes, schema, scripts,
histórico e mudanças desde a última consolidação ou PR.

Antes de agir, leia README.md, docs/PROJECT-HISTORY.md,
docs/DEVELOPMENT.md, docs/DEPLOYMENT.md, docs/AUTOMATIONS.md,
docs/AUTOMATION-PROMPTS.md, docs/CONTINUITY-PROMPT.md, CONTRIBUTING.md e as
instruções em .github/instructions/.

Execute git status --short, git diff --cached e git diff. Preserve alterações
locais legítimas e interrompa se houver arquivo protegido ou intenção
ambígua. Não use git reset --hard, git checkout --, git restore ou git clean.
Não altere código funcional apenas para facilitar a documentação.

Atualize somente documentos sustentados por evidência no código ou no
histórico. Mantenha README.md, docs/*.md, CONTRIBUTING.md e o prompt de
documentação coerentes. Atualize docs/PROJECT-HISTORY.md com as mudanças
relevantes de arquitetura, cadastros, estoque, fiscal, NFC-e, impressão,
navegação, Retaguarda, atalhos, interface, testes e pendências.

Não documente senhas, tokens, certificados, XMLs reais, dados reais, dumps,
backups ou artefatos. Execute git diff --check. Se contratos funcionais forem
refletidos ou houver dúvida, execute npm.cmd test, npm.cmd run build e
node --check src/server/server.js.

Se houver mudanças documentais reais, crie um commit descritivo com:

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>

Crie ou atualize uma PR somente quando houver mudanças não publicadas e a
operação estiver autorizada no contexto da execução. Não crie PR vazia, não
faça merge automático e não use force push.

Não faça deploy por inferência. O projeto ainda não possui script oficial de
publicação. Sem procedimento oficial e autorização explícita, valide
localmente, informe deploy bloqueado e pare. Se um procedimento oficial
existir no futuro, valide main, preserve o banco MariaDB e backups, publique
somente a versão validada e registre a versão efetivamente publicada.
```

## `atualizar repositorio`

```text
Use somente o checkout de desenvolvimento do projeto pdv como fonte única.
Não use worktrees, cópias ou checkouts alternativos. Integre apenas alterações
pertencentes ao PDV e preserve .env, credenciais, chaves privadas, dados reais,
dumps, backups, node_modules, dist e src-tauri/target.

Antes de agir, execute git status --short, git diff --cached e git diff.
Depois execute:

npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check

Quando houver mudanças reais, crie um commit com:

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>

Faça push direto para origin main somente com autorização explícita. Se não
houver mudanças, informe que não há alteração para integrar. Não use force
push, não exclua branch, não crie PR, não faça merge e não faça deploy.
```

## `publicar online`

```text
Use somente o checkout de desenvolvimento do projeto pdv, na branch main,
como fonte única. Esta automação está bloqueada até existir um script oficial
de publicação do servidor da loja.

Não execute cPanel, Passenger ou scripts herdados de outro projeto. Não
publique enquanto o procedimento não estiver documentado e explicitamente
autorizado pelo usuário.

Quando um procedimento oficial existir, ele deverá publicar somente main
validado, preservar o banco MariaDB, backups, .env e credenciais, e validar a
API e a conexão com o banco após a publicação. Nunca envie credenciais,
dumps, node_modules ou artefatos sem uma regra explícita.
```

## Regras de execução

As automações são manuais e executam uma por vez. Em qualquer falha,
divergência ou comportamento inesperado, preserve a saída, interrompa a
execução e corrija a causa antes de tentar novamente. Não automatize senhas,
credenciais ou passphrases. Não faça push, merge ou publicação por inferência.
