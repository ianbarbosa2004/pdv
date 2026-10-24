# Convenções de desenvolvimento

## Organização de arquivos

- Testes automatizados devem ser criados dentro de `tests/`.
- Testes de domínio podem usar `tests/unit/` quando houver volume suficiente.
- Testes de API, banco e contratos HTTP podem usar `tests/integration/`.
- Documentação operacional, decisões técnicas e procedimentos devem ser
  criados dentro de `docs/`.
- O `README.md` deve permanecer como índice e visão geral do projeto; detalhes
  operacionais devem ficar em documentos específicos de `docs/`.
- Não crie arquivos temporários, notas de planejamento ou documentação
  operacional na raiz do repositório.

## Nomenclatura de campos

Os campos técnicos persistidos usam o **nome do campo seguido do nome da
tabela/entidade** em todas as camadas: banco de dados, contratos JSON da API
e frontend. Exemplos: `idClass`, `descriptionClass`, `idGroup`,
`stockQuantityProduct`, `isActiveProduct`, `clientIdSale`, `idSale` e
`idPaymentMethod`.
Nomes de tabelas permanecem em snake_case quando já fazem parte do schema
existente, como `payment_methods`, `sale_items` e `sale_payments`.

Nomes de entrada que representam uma operação e não uma coluna persistida
podem permanecer contextuais, como `items`, `quantitySaleItem` e `payments`.

Novos campos devem seguir o mesmo padrão e não devem introduzir equivalentes
em snake_case. Renomeações de campos existentes exigem atualização do schema,
das consultas SQL, dos contratos da API, das telas e da migração do banco.

## Testes

Use o runner nativo `node:test` e mantenha os testes independentes de dados
reais ou credenciais de produção.

Execute a validação padrão:

```powershell
npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check
```

Quando uma mudança alterar API, banco ou fluxo de cadastro, inclua cobertura
para sucesso, entradas inválidas, erros explícitos e efeitos relevantes no
estado persistido.

## Reinício da API

Sempre que `src/server/` for alterado, encerre o processo da API que estiver
ouvindo na porta configurada e inicie-o novamente antes de validar o fluxo pela
interface. Não considere a alteração disponível enquanto um processo antigo
continuar atendendo as requisições.

Após o reinício, confirme a versão em execução com:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Na retaguarda, o controle de Status apenas inativa ou reativa o registro.
O botão de lixeira exclui definitivamente classes, grupos e produtos quando
não há vínculos que impeçam a remoção. Produtos que já aparecem em itens de
venda não podem ser apagados, para preservar o histórico; nesses casos, use o
controle de Status para inativá-los. Classes e grupos com produtos vinculados
também devem ser inativados.

## Dificuldades e workarounds registrados

Estas ocorrências foram encontradas durante a consolidação da nomenclatura,
criação do PR e validação pós-merge. Devem ser consideradas em tarefas futuras
que reutilizem o mesmo prompt:

### Refatoração automática de nomes

Substituições textuais amplas geraram identificadores híbridos, como
`idProductProduct`, referências antigas a `id`, `name` e `price`, e campos de
uma entidade aplicados em outra. O workaround é revisar cada contrato por
entidade, começando pelo `schema.sql`, depois consultas SQL, serviço, rotas,
frontend e testes. Não aplicar substituições globais sem validar o contexto da
tabela.

### Schema diferente do banco em execução

O `schema.sql` já estava no padrão final, mas o MariaDB ainda tinha nomes do
padrão intermediário. O workaround foi inspecionar `SHOW COLUMNS` antes da
migração e executar apenas `ALTER TABLE ... RENAME COLUMN` para colunas
existentes. Essa estratégia preservou dados, tipos, índices e foreign keys.
Nunca recriar, limpar ou truncar tabelas para resolver divergência de nomes.

### API antiga ocupando a porta

Após alterar `src/server/`, uma instância antiga continuou atendendo na porta
3000. O workaround é localizar o processo pelo `Get-NetTCPConnection`, pará-lo
pelo PID específico e iniciar a API novamente. O endpoint `/api/health` deve ser
consultado somente depois desse reinício; um health check isolado não prova que
a instância correta está em execução.

### Testes dependentes de `.env`

O CI falhou porque o teste iniciava a API com `--env-file=.env`, arquivo que é
local e não deve ser versionado. O workaround é iniciar o processo de teste
sem `--env-file` e fornecer apenas variáveis de ambiente controladas pelo
próprio teste. Segredos reais nunca devem ser incluídos no workflow ou nos
testes.

### Deploy inexistente

O repositório não possui provedor, destino remoto ou script oficial de deploy.
O workaround correto é executar e registrar o build local, sem inventar um
destino, copiar `.env`, alterar produção ou reutilizar scripts de outro
projeto. O deploy só pode ser executado depois que o ambiente e o procedimento
forem documentados e autorizados.

### Merge e remoção do branch no worktree

O merge via `gh pr merge` foi concluído, mas a remoção local do branch foi
omitida porque ele continuava aberto no worktree atual. O workaround é
confirmar o merge remoto e deixar a limpeza local para uma sessão fora desse
worktree; não forçar exclusão nem remover o checkout ativo.

## Documentação

Atualize a documentação relacionada na mesma alteração do código. Use nomes
descritivos em Português ou no padrão já adotado pelo documento e mantenha
`README.md` e `docs/*.md` coerentes com o estado real do sistema.
