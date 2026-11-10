# Convenções de desenvolvimento

O histórico consolidado da evolução funcional e técnica está em
[`PROJECT-HISTORY.md`](PROJECT-HISTORY.md). Atualize esse documento quando
uma etapa relevante alterar a arquitetura, os contratos ou o estado do
produto.

### Formulário de Receitas e Composições

O cadastro usa `recipe_components` para persistir, além do componente e da
quantidade, a Unidade Culinária e a Conversão escolhidas quando o componente é
um Produto. A Unidade Culinária e a Conversão são obrigatórias para componentes
de Produto, inclusive quando a conversão é uma identidade como `kg → kg`.
Componentes que apontam para outra Receita não usam conversão. A interface deve
buscar componentes sem diferenciar caixa ou
acentos, filtrar unidades culinárias pela base da unidade tributável do Produto
e filtrar conversões pela unidade escolhida, pela unidade tributável de destino
e pelo estado físico. A API repete
essas validações antes de inserir os dados na transação.

Medidas culinárias como colheres, xícaras e doses não têm base nem categoria
físicas fixas: o mesmo recipiente pode representar massa, pó ou líquido. Nesses
casos, use `baseUnitCulinaryUnit = common` (Comum) e
`categoryCulinaryUnit = general` (Geral); a conversão específica deve ser
escolhida pelo estado físico do componente.

O cabeçalho também persiste `yieldQuantityRecipe` e
`idCulinaryUnitYieldRecipe`. O rendimento deve ser maior que zero e a Unidade
Culinária final deve estar ativa.

A tela de cadastro usa um workspace de três colunas: o editor ocupa duas
colunas e a listagem de Receitas e Composições ocupa uma. No editor, nome,
tipo e status ficam na mesma linha, com o nome ocupando duas colunas. O seletor de componente ocupa uma linha inteira. Após Observações, um divisor
separa o bloco de inclusão: Unidade culinária, Quantidade, Conversão, Perda e o
botão permanecem visíveis em uma área de altura fixa, inicialmente
desabilitados até a seleção do componente. A listagem de componentes aparece
abaixo desse bloco, com área fixa de `248px` e margem inferior de `30px` no
botão de inclusão para evitar que a listagem fique visualmente colada ao
editor.
Quantidade, rendimento e perda usam a máscara numérica padrão do
projeto durante a digitação; ao sair da edição de quantidade ou perda, o valor
é normalizado com duas casas decimais. A lista de componentes exibe a ordem, permite reordenar com setas e
apresenta o custo calculado por componente e o custo total estimado alinhado à
direita no rodapé, sem SKU ou coluna de Conversão. A conversão continua sendo
usada no cálculo e na edição do componente. Quando a unidade do Produto é quilograma, por
exemplo, `800 g` com fator `0,001` é calculado como `0,800 kg` antes da
aplicação do custo e da perda. A ordem é persistida em
`recipe_components.orderRecipeComponent`.
Na leitura das receitas, a API também deve retornar
`factorCulinaryUnitConversion` junto da conversão; sem esse campo, a interface
assume fator `1` e calcula incorretamente componentes informados em gramas,
mililitros ou outras unidades convertidas.
Quando o Produto usa `KG`, por exemplo, a conversão precisa terminar em `kg`.
Conversões culinárias para a unidade-base são complementadas pela carga do
catálogo com registros explícitos para a unidade comercial: `colher_sopa → kg`
com fator `0,01` quando a conversão original representa `10 g`. O cálculo
continua sendo sempre `quantidade × fator × custo unitário`; não há inversão ou
ajuste automático do fator.
O cadastro usa unidades tributáveis para o rendimento final; receitas existentes
podem ser visualizadas e editadas no formulário principal e arquivadas pela
ação de exclusão.

Na listagem, clicar na linha carrega a Receita ou Composição no formulário
principal em modo somente leitura. A edição ocorre pelo botão **Editar** no
próprio formulário, habilitando **Salvar** sem abrir modal. Durante a
visualização, o cabeçalho do formulário exibe **Visualização** e o botão
**Novo cadastro**, que limpa o formulário e inicia um novo cadastro. O cabeçalho
da listagem fica reservado ao título e à pesquisa; o rodapé mantém apenas a
ação **Editar**.

O campo `statusRecipe` é controlado pelo formulário com os estados `draft`
(Rascunho), `active` (Ativa) e `review_required` (Requer revisão). O estado
`archived` é reservado ao arquivamento e não pode ser criado pelo salvamento
normal. A listagem operacional exibe Nome, Tipo, Status e Ações, incluindo
arquivados porque a tela usa `includeArchived=1`; Nome ocupa o espaço restante,
enquanto Tipo e Status ficam limitados a 90px e Ações a 70px. Vínculos com produtos
continuam aceitando somente receitas `active`.

A listagem possui filtros por status para Todas, Rascunho, Ativas, Revisão e
Arquivadas. O filtro de status é combinado com a pesquisa textual e exibe a
quantidade atual de registros em cada grupo. Na listagem, os status Rascunho e
Revisão usam negrito para facilitar a identificação operacional.

Durante a edição, o botão de lápis de cada componente abre um modal próprio,
fora do elemento `<form>`, para alterar componente, unidade culinária,
conversão, quantidade e perda sem interferir no editor principal. O botão X,
Cancelar e a tecla ESC fecham o modal sem aplicar alterações. O fechamento por
ESC é global para os modais visíveis da aplicação. Se uma conversão antiga já
estiver persistida, ela continua visível durante a edição para permitir sua
correção, mesmo que não seja oferecida para novos componentes. O carregamento inicial busca os catálogos
auxiliares em paralelo; depois de salvar ou arquivar, a tela atualiza somente
a listagem de Receitas e mantém esses catálogos em memória. A submissão também
é protegida contra cliques repetidos para evitar feedback de sucesso duplicado.

Alterações em `src/server/`, `database/schema.sql` ou
`src/server/schema-manager.js` exigem reinício da API publicada para aplicar a
migração idempotente. O identificador de caixa usa `SMALLINT UNSIGNED`; a
preparação do schema converte instalações antigas que ainda usam `TINYINT`
antes de garantir o registro `Caixa principal`. Não execute build a cada alteração: ele só é necessário
quando houver mudança no bundle, Vite/Tauri, versionamento ou validação de
produção.

A listagem de Receitas usa `recipe_components.idRecipeComponent` na ordenação
da leitura, uma coluna presente também nas instalações legadas. A ordem
editável continua sendo persistida em `orderRecipeComponent` quando o schema
atualizado está disponível, mas a ausência dessa coluna não impede a consulta
dos cadastros existentes. Falhas de banco na API são
registradas em uma única linha com `code`, `errno`, `sqlState` e `message`, sem
registrar a consulta completa nem dados sensíveis; esses campos devem ser
preservados ao investigar erros em `C:\ProgramData\PDV\logs`.
As verificações de `ensureRecipeSchema()` compartilham uma promessa durante a
vida do processo e são refeitas somente após falha. Isso evita repetir as
consultas de metadados e as verificações idempotentes a cada leitura de
Receitas, sem ocultar erro de migração.

## Organização de arquivos

### Temas da interface

A aparência do terminal é uma preferência local. Em uma janela Tauri, ela é
persistida junto do `offline-config.json`; em desenvolvimento no navegador,
ela é persistida no `localStorage` sob a chave `pdv.offline-config`. O módulo
`src/ui/theme-manager.js` aplica o tema no elemento raiz por meio de
`data-theme`; novas telas devem reutilizar os componentes visuais existentes e
evitar cores ou fontes fixas quando o valor puder ser um token de tema.

Os temas disponíveis são `default`, `dos` e `high-contrast`. A tela
**Configurações > Aparência** permite trocar o tema sem alterar a API, o
MariaDB, as regras de venda ou a impressão. A alteração é aplicada
imediatamente e exige apenas novo bundle quando for distribuída em um terminal
Tauri; não exige reinício da API.

### Reconciliação da navegação

Toda leitura ou republicação da navegação deve usar
`reconcileNavigation()` em `src/shared/navigation-defaults.js`, inclusive no
carregamento inicial e no Construtor de navegação. Esse módulo mescla os dados
persistidos com os defaults atuais para que novos itens não desapareçam após
trocar de tela.

`Ficha Técnica` é um item direto e clicável dentro de Cadastros, seguindo o
mesmo padrão de `Produtos`. Ele abre Receitas e Composições, cuja barra
contextual apresenta Receitas, Estados Físicos e Conversões. Esses cadastros
relacionados permanecem vinculados à Ficha Técnica na navegação persistida, mas
não transformam o item principal em um submenu.

- Testes automatizados devem ser criados dentro de `tests/`; testes de domínio,
  modelos e serviços isolados ficam em `tests/unit/`, enquanto testes de API,
  banco e contratos HTTP ficam em `tests/integration/`.
- O runner padrão (`npm.cmd test`) descobre ambos os grupos recursivamente.
- `docs/NOTES.md` é reservado para anotações pessoais de tarefas e não deve
  ser removido durante reorganizações ou limpezas da árvore.
- Documentação operacional, decisões técnicas e procedimentos devem ser
  criados dentro de `docs/`.
- O `README.md` deve permanecer como índice e visão geral do projeto; detalhes
  operacionais devem ficar em documentos específicos de `docs/`.
- Não crie arquivos temporários, notas de planejamento ou documentação
  operacional na raiz do repositório.

## Convenção de navegação

O projeto não possui submenu visual. Menus principais devem abrir diretamente
uma tela ou um agrupador técnico sem criar uma segunda camada visual dentro do
menu. Quando uma área possuir telas relacionadas, elas devem ser exibidas em
uma barra contextual própria da tela, seguindo o padrão de **Produtos**.

### Criação e manutenção de menus

Ao criar uma nova área de navegação, siga esta sequência:

1. Defina o menu principal e seus itens em
   `src/shared/navigation-defaults.js`, usando uma chave estável, um rótulo,
   uma rota e uma ordem explícita.
2. Para uma tela que abre diretamente, use um item raiz com
   `typeNavigationItem: "item"` e uma rota resolvida por
   `src/main.js`. O item deve ser renderizado como um
   `<button data-main-menu="...">`, seguindo o mesmo padrão de **Produtos**.
3. Para telas relacionadas, mantenha a relação pai-filho em
   `parentKey`/`idParentNavigationItem` apenas para persistência, ordenação e
   montagem da barra contextual. Não transforme essa relação em `<details>`,
   `<summary>`, dropdown aninhado ou submenu visual.
4. Registre o handler da chave principal em `common()` de `src/main.js` e
   passe os handlers necessários às telas que chamam `bindMainMenu()`. A chave
   do item, a rota persistida e o handler devem apontar para o mesmo destino.
5. Se a tela tiver áreas relacionadas, monte a barra contextual a partir da
   navegação persistida com `selectContextualNavigationItems()`. A tela
   principal deve ser o item ativo da barra, e os itens relacionados devem
   continuar acessíveis sem duplicar a rota principal.
6. Use `reconcileNavigation()` em toda leitura ou republicação da navegação.
   Assim, instalações existentes recebem itens novos sem perder customizações,
   ordens, divisores, relações pai-filho ou estados inativos válidos.
7. Crie testes para a definição persistida, a renderização como botão direto,
   a resolução do handler, a barra contextual e a migração de dados antigos.

O caso de **Ficha Técnica** exemplifica essa regra. Ela mantém as telas
relacionadas **Receitas e Composições**, **Estados Físicos** e **Conversões**
como filhos persistidos, mas o item principal é um item direto com a rota
`recipes`, igual a **Produtos**. A correção removeu o `<summary>` clicável que
dependia do comportamento nativo de `<details>`; esse elemento fechava o menu
em vez de executar a navegação em alguns estados. O contrato correto é:

```html
<button type="button" data-main-menu="technical-sheet">Ficha Técnica</button>
```

O handler `technical-sheet` abre **Receitas e Composições**, e a barra
contextual apresenta os três cadastros relacionados. Dados antigos que tenham
persistido `Ficha Técnica` como `submenu` devem ser normalizados para
`typeNavigationItem: "item"` durante a reconciliação. Ao alterar a estrutura
de um menu, valide também o clique real no navegador; testar somente a função
de resolução ou acionar `element.click()` por script não comprova o fluxo do
usuário.

Telas singleton também devem renderizar uma barra contextual com um único
botão ativo, alinhado à esquerda. O texto desse botão, o título da tela e o
título do painel introdutório devem ser idênticos. O conteúdo abaixo do menu
principal deve manter centralização horizontal com `margin: 0 auto` e usar
espaçamento lateral mínimo de `28px`, além de respeitar `max-width: 1440px` e
`min-width: 1180px`, mantendo uma área de operação estável para as telas de
retaguarda. O espaçamento vertical padrão dos contêineres é `28px` no topo e
`40px` na base. A barra contextual
deve ocupar a largura da tela e iniciar no extremo esquerdo, sem recuo baseado
no conteúdo. O menu principal e a barra contextual não devem receber margem
vertical adicional; painéis consecutivos devem manter espaçamento visual, e
campos de URL devem ter largura suficiente para exibir endereços completos
sem depender de expansão manual.
Painéis irmãos na mesma tela devem usar separação vertical uniforme; no
Construtor de navegação, linhas de menus e itens devem manter a mesma altura
mínima para facilitar a leitura e o arraste.
Nenhum menu pode receber `padding-top` especial por ser o primeiro; **Frente de
Caixa** e os demais menus devem seguir exatamente o mesmo espaçamento.
Nas telas de Status da API, Atualizar NCM / CEST, Backup e Restauração,
Importar Cadastros, Configurações Gerais e Impressoras, o contêiner operacional
deve seguir o limite de Dados da Empresa, com `min-width: 1180px` e
`max-width: 1180px`, sem `width: 100%` explícito.
Larguras internas de tabelas, campos e controles podem continuar ocupando sua
própria área.
O texto explicativo de cada tela deve vir de `descriptionNavigationItem` em
`navigation_items`. A edição deve ser feita pelo campo **Texto introdutório da
tela** do Construtor de navegação, sem duplicar a fonte de verdade nas telas.

**Frente de Caixa** é o primeiro item fixo do menu principal. Ele fica sempre
ativo, usa ordem `0` e abre diretamente a frente de caixa por meio de
`showSales`. O Construtor de navegação e a API não podem desativar, renomear,
reordenar ou substituir esse item; a sincronização de defaults corrige o
registro persistido quando necessário.

Não introduza elementos HTML de submenu, dropdown aninhado ou qualquer outra
hierarquia visual equivalente no menu principal. A hierarquia entre item pai e
telas relacionadas pode continuar persistida em `navigation_items` para
roteamento e ordenação, mas deve ser apresentada somente pela barra
contextual.

## Cadastros, tabelas e migrações

O `database/schema.sql` é o schema inicial reproduzível. A API também executa
verificações idempotentes ao iniciar ou ao acessar cada área, por meio das
funções `ensure...Schema` compostas pelo módulo
`src/server/schema-manager.js`. O roteador em `src/server/server.js` recebe
somente a interface desse módulo. Essas verificações criam
tabelas ausentes e adicionam colunas novas com `ALTER TABLE`; não devem apagar,
recriar ou truncar tabelas existentes.

A preparação do catálogo NCM/CEST pertence ao módulo
`src/server/ncm-cest-update.js`, que é a única fonte runtime para as tabelas
`ncm_catalog`, `cest_catalog`, `ncm_cest_relations` e `ncm_cest_updates`.
Atualizações e inicialização reutilizam a mesma preparação idempotente para
evitar divergência entre o caminho de carga e o caminho de inicialização.

### Migração do catálogo unificado de unidades

`units` é a fonte canônica de unidades, `unit_conversions` é a fonte canônica
de conversões e `physical_states` apoia as conversões dependentes do estado
físico. A API e a tela de Receitas usam esses objetos diretamente; os aliases
`/api/culinary-units` e `/api/culinary-unit-conversions` existem somente para
compatibilidade de clientes antigos.

Para instalações que ainda possuem as estruturas antigas, execute primeiro a
migração aditiva no servidor do MariaDB:

```powershell
npm.cmd run migrate:unify-measurement-units
```

Antes dela, execute `npm.cmd run migrate:culinary-units` somente se a instalação
ainda não tiver `culinary_units` e `culinary_unit_conversions`. A migração
aditiva copia as estruturas antigas para o catálogo canônico e cria mapas
temporários de IDs para validação.

Os comandos consultam primeiro a credencial do MariaDB armazenada no Windows
Credential Manager. Se ela não existir e o terminal for interativo, solicitam a
senha sem ecoá-la na tela. Em execução automatizada ou sem terminal, defina
`PDV_DB_PASSWORD` somente no ambiente do processo; nunca grave a senha em
scripts, arquivos `.ps1`, histórico ou documentação.

Antes de publicar a versão que remove a leitura dos mapas, confirme um backup
restaurável e execute:

```powershell
npm.cmd run migrate:cutover-measurement-units
```

O corte é transacional: valida todos os vínculos de Receitas, converte os IDs
das colunas históricas para IDs de `units` e `unit_conversions`, verifica
órfãos e somente então remove os mapas e as tabelas legadas. Em caso de erro,
faz rollback. A migração destrutiva não deve ser executada sem autorização
operacional explícita. Reinicie a API após o corte para descartar processos que
ainda estejam executando a versão anterior.

Se qualquer migração falhar, restaure o backup somente após confirmar a causa e
não remova tabelas manualmente como tentativa de recuperação.

### Registro da auditoria arquitetural e operacional — 2026-11-02

Esta etapa corrigiu os dois pontos arquiteturais identificados na auditoria:

1. As rotinas de preparação do banco foram retiradas de
   `src/server/server.js` e passaram a ser compostas por
   `src/server/schema-manager.js`, cuja interface recebe `pool` e `config` e
   devolve somente as operações necessárias ao roteador e ao startup.
2. A preparação das quatro tabelas NCM/CEST foi concentrada em
   `src/server/ncm-cest-update.js`; não deve ser recriada em outro módulo.

Também foram corrigidos os scripts `scripts/publish-windows-api-service.ps1`
e `scripts/configure-windows-service-account.ps1`. O SQL que redefine
`pdv_app` é transmitido diretamente ao `mysql` por pipe. A senha não é
materializada em arquivo SQL persistente. A conta `PDVApiSvc` é criada ou
atualizada com a senha gerada antes do provisionamento do Credential Manager.

Validação realizada: 58 testes passaram; os arquivos JavaScript alterados
passaram em `node --check`; os três scripts Windows passaram pela análise
sintática do PowerShell; `git diff --check` passou. Não foram executados
publicação, deploy, alteração de serviço ou build completo. Como somente
scripts, documentação e preparação de código foram alterados nesta etapa, não
é necessário reiniciar a API agora. Depois de publicar alterações em
`src/server/`, reinicie a API publicada com `api.cmd` antes da validação real.

### Implementação de operadores e caixa — 2026-11-02

A pendência identificada na auditoria foi implementada em uma primeira versão
vertical:

- operadores usam usuário e senha individuais com hash `scrypt`;
- sessões expiram após oito horas e usam token aleatório armazenado somente
  como hash no banco;
- o token compartilhado continua identificando o terminal, enquanto
  `X-Operator-Session` identifica o operador;
- o caixa principal exige abertura com saldo inicial, registra vendas pagas
  pela conta `Caixa`, permite suprimento/sangria e exige supervisor/admin para
  fechamento;
- diferenças de fechamento exigem justificativa;
- `sales` passa a registrar operador e sessão de caixa, e o servidor rejeita
  vendas sem operador autenticado e caixa aberto.

Rotas adicionadas: `POST /api/operator/login`,
`POST /api/operator/logout`, `GET /api/operator/session`,
`POST /api/operators`, `GET /api/cash/current`, `POST /api/cash/open`,
`POST /api/cash/movements` e `POST /api/cash/close`.
Para criar o primeiro operador, use `npm.cmd run create:operator` com
`PDV_OPERATOR_PASSWORD` somente no ambiente do servidor; nunca registre a
senha em documentação ou logs. Se a conta MariaDB da API não puder executar
a inclusão, gere apenas o hash com o argumento `--hash-only` e faça o
`INSERT`/`UPDATE` no DBeaver usando uma conta autorizada; o hash não permite
recuperar a senha original.

Como `src/server/` e o frontend foram alterados, a API precisa ser publicada e
reiniciada antes da validação operacional. A migração runtime é executada pelo
startup de `schema-manager.js`; instalações existentes recebem as colunas de
vínculo de venda como anuláveis para preservar o histórico legado.

### Separação entre Frente de Caixa e Retaguarda — 2026-11-02

O login autentica o operador, mas não abre caixa automaticamente. Depois da
autenticação, a tela de credenciais é substituída por uma tela exclusiva de
seleção de ambiente, que apresenta três destinos:

- **Vendas**: permite consultar o catálogo e informa quando o caixa
  está fechado; a abertura exige saldo inicial e acontece na tela de Caixa,
  somente quando o operador escolhe trabalhar com vendas;
- **Caixa**: abre diretamente o controle de abertura, movimentações e
  fechamento do caixa;
- **Retaguarda**: abre diretamente para cadastros, configurações e ferramentas,
  sem exigir caixa aberto.

A tela inicial da Retaguarda exibe somente os itens marcados como **Atalho** no
Construtor de navegação. Os cards seguem a ordem dos menus e dos itens
persistida na navegação, mantendo uma única fonte de verdade para a organização
do menu, e cada card usa um ícone Lucide correspondente ao módulo. O cabeçalho
consulta o operador autenticado e o estado real do caixa; alertas adicionais só
devem ser exibidos quando houver uma fonte correspondente na API.

A seleção pós-login usa uma tela de módulos inspirada na referência visual
fornecida, mas oferece exatamente três ambientes: **Vendas**, **Caixa** e
**Retaguarda**. A tela mostra o operador autenticado e o status real do caixa;
**Trocar usuário** permanece como ação auxiliar fora da grade de ambientes.

A ordem, os divisores e a estrutura definidos no Construtor de navegação são
configuração persistida. A preparação do schema não renumera mais os itens
existentes ao iniciar a API; ela apenas cria ou corrige registros essenciais
ausentes. Portanto, alterações feitas no Construtor continuam sendo carregadas
após novo login e reinício da API.

As barras contextuais não exibem ação de retorno: não mostram “Frente de caixa”
nem “Voltar”. A navegação entre áreas ocorre pelo menu principal e pelas opções
contextuais disponíveis na própria tela.

A API continua exigindo operador autenticado e caixa aberto na rota de venda.
Essa regra não foi relaxada; a separação ocorre na navegação e evita bloquear
atividades administrativas. Esta etapa alterou apenas frontend e documentação:
não é necessário reiniciar a API. É necessário gerar e distribuir o bundle
frontend para validar a mudança no terminal.

A tela de login não possui seletor de ambiente ou conexão “Padrão”. O botão
com ícone de banco abre a configuração da API, permitindo informar, testar e
salvar o endereço do servidor antes da autenticação. Uma falha de rede no
teste não substitui o endereço anteriormente salvo. Essa configuração é local
ao terminal e não altera as credenciais ou a configuração do servidor.
No modal, **Testar** verifica a conexão sem salvar. O botão **Salvar** só fica
habilitado depois de um teste bem-sucedido da mesma URL; então grava o endereço
informado e fecha a configuração.

O fechamento do aplicativo pela tela de login não solicita backup, pois ainda
não há operação autenticada ativa. A pergunta de backup continua reservada às
telas operacionais.

### Auditoria de backup e restauração — 2026-11-02

Foi identificado e corrigido um risco no fluxo de backup: as rotas aceitavam
`directory` na query string e `backupDirectory` no corpo, permitindo que um
terminal autenticado direcionasse leitura, gravação, download ou restauração
para qualquer caminho acessível à conta da API. O servidor agora ignora esses
valores e usa exclusivamente `PDV_BACKUP_DIR` ou o diretório padrão da API.

O diretório físico não é retornado ao terminal. A API envia somente os
metadados necessários para a tela, como nome, data, tamanho e contagem de
registros. A configuração deve ser feita no servidor; o caminho escolhido no
terminal não é uma autorização para acessar diretórios do servidor. A alteração
envolve `src/server/server.js`, portanto exige nova publicação e reinício da
API antes da validação em produção.

### Auditoria de autorização e CORS — 2026-11-02

A proteção existente foi conferida sem alteração de contrato:

- a API não inicia sem `PDV_API_TOKEN`;
- no modo `vite serve`, o cliente reutiliza `VITE_PDV_API_TOKEN` ou
  `PDV_API_TOKEN`; quando ambos não existem, procura o token operacional em
  `C:\ProgramData\PDV\app\.env`, permitindo testar uma instalação limpa sem
  copiar segredos para o checkout;
- builds de cliente continuam exigindo `VITE_PDV_API_TOKEN` explicitamente pelo
  fluxo de publicação;
- todas as rotas `/api/` exigem `Authorization: Bearer ...`;
- origens CORS são comparadas com `PDV_API_ALLOWED_ORIGINS`;
- preflight rejeita origens não autorizadas;
- respostas não incluem credenciais de banco ou dados de autenticação.

O limite conhecido é intencional e já está registrado para a etapa futura:
um token compartilhado autentica o terminal perante a API, mas não representa
um operador, uma sessão ou uma permissão específica. Não é adequado usar esse
token para controlar telas financeiras ou autorizar operações por usuário.

### Auditoria de papel servidor/terminal — 2026-11-03

A auditoria confirmou que o sistema ainda não possui uma identificação
confiável do papel do chamador. O servidor pode conhecer suas próprias
capacidades, mas os terminais acessam a mesma API e usam o token compartilhado
do terminal; por isso, `127.0.0.1`, hostname, origem HTTP ou flag local não
podem ser usados como autorização. A proteção de backup continua correta
porque o diretório é resolvido exclusivamente pela API.

Não foi adicionada uma solução parcial que apenas esconderia telas. Antes de
liberar operações exclusivas do servidor, será necessário criar uma identidade
ou capacidade emitida e validada pelo servidor, com autorização efetiva no
backend. Até lá, recursos de servidor devem permanecer protegidos por suas
rotas e configurações server-side existentes.

### Consolidação da versão 0.11.0 — 2026-11-04

Receitas de Produção e Composições de Produto são estruturas nomeadas,
reutilizáveis e independentes de Produto comercial. Componentes podem apontar
para Produtos ou outras Receitas; o cadastro do Produto mantém os vínculos com
quantidade e perda. A API valida ciclos, componentes ativos e persistência
transacional, e as revisões pendentes ficam disponíveis em Views.

Produtos Buffet são Produtos comerciais com preço próprio. A venda não baixa
estoque, não exige Cardápio e não impede o fechamento do caixa.

As telas de Ficha Técnica, Views, Produtos, Operações Fiscais, Financeiros e
Ferramentas consultam as barras contextuais persistidas. Arrays locais existem
somente como fallback quando a API está indisponível ou incompleta; uma resposta
válida do banco não deve receber itens locais adicionais nem perder sua ordem,
label, rota, divisor ou relação pai-filho.

Esta etapa foi validada com 112 testes aprovados, `node --check` e
`git diff --check`. Como houve alterações em `src/server/`, publique e reinicie
a API antes da validação operacional; como houve alterações no frontend, gere
novo bundle para os terminais. O build não foi executado nesta etapa.

### Consolidação da versão 0.10.0 — 2026-11-04

O Construtor de navegação usa `navigation_menus` e `navigation_items` como
fonte de verdade persistida. Leituras normais da API e do frontend não aplicam
defaults sobre registros existentes e não reordenam itens salvos. Rotas,
labels, menus, pais, tipos, status, divisores e ordens personalizados devem
sobreviver à nova leitura e ao reinício da API.

Defaults só podem criar registros ausentes no bootstrap ou montar o fallback
quando a API estiver indisponível. O arraste entre menus deve mover a subárvore
inteira, preservar os vínculos pai-filho e salvar pais antes dos filhos. A
rotina antiga de normalização destrutiva não pode voltar ao caminho de startup.

Esta etapa foi validada com 98 testes aprovados, `node --check` nos JavaScript
alterados e `git diff --check`. Como houve alteração em `src/server/`, reinicie
a API antes da validação operacional contra um banco de teste controlado. Não
foi executado build completo, publicação ou reinício do serviço.

### Consolidação da versão 0.9.0 — 2026-11-03

As alterações funcionais acumuladas em 2 e 3 de novembro devem ser tratadas
como incremento **minor**, pois adicionam capacidades compatíveis ao produto:
operadores e sessões, controle de caixa, cancelamento auditado, NFC-e em
homologação, destino de impressão, importação de Status e Estado Físico, além
das regras de estoque.
O versionamento sincronizado deve permanecer em `package.json`,
`package-lock.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`.

Na Frente de Caixa, `GET /api/products` aplica a configuração
`allowNegativeStock` somente ao catálogo operacional. Com estoque negativo
permitido, produtos controlados com estoque zero ou negativo continuam
renderizados. Sem essa permissão, eles são filtrados quando não têm estoque
positivo. Produtos com `controlsStockProduct = 0` permanecem visíveis em ambos
os cenários. Chamadas administrativas com `includeInactive=1` não recebem esse
filtro.

A importação CSV inclui `descriptionPhysicalState`, obrigatório para
matérias-primas. A tela consulta `GET /api/physical-states`, aceita ID, nome,
código ou descrição do estado físico ativo e oferece o download
`referencia-estados-fisicos.md`. O servidor converte o valor para
`idPhysicalStateProduct` e mantém `NULL` para os demais tipos de produto.
O SKU continua obrigatório e único, mas não exige prefixos como `MP-`, `EMB-`
ou `PROD-`. Após um erro de validação, o botão **Testar arquivo** permanece
disponível para nova tentativa, a seleção anterior é descartada e o botão
**Selecionar arquivo** permite escolher outro CSV; **Importar arquivo** só é
habilitado depois de uma validação bem-sucedida.

Esta consolidação foi validada com 94 testes aprovados, `node --check` nos
JavaScript alterados e `git diff --check`. Como houve alteração em
`src/server/`, a validação operacional exige publicar a API atualizada e
reiniciar o serviço `PDV-API`; isso não foi executado nesta etapa. Não execute
build completo apenas para documentar a mudança; ele deve ser usado quando a
distribuição do bundle ou do instalador for realmente necessária.

### Auditoria de integridade de vendas e estoque — 2026-11-02

O fluxo foi revisado da interface à transação:

- a interface só limpa o carrinho depois de uma resposta HTTP bem-sucedida;
- o servidor normaliza e valida itens, quantidades, desconto e pagamentos;
- produtos são bloqueados com `FOR UPDATE` antes da confirmação de estoque;
- venda, itens, pagamentos, Vale e baixa de estoque usam a mesma transação;
- falhas fazem rollback e não são convertidas em sucesso;
- `clientIdSale` possui restrição única e comparação do conteúdo para
  idempotência segura;
- o servidor retorna o resumo confirmado da venda após o commit.

Não foi encontrado defeito novo nesta auditoria. O limite funcional já
registrado permanece: sem operador e caixa vinculados, o fluxo não permite
responsabilização financeira por usuário.

### Auditoria de impressão — 2026-11-02

O fluxo de impressão foi revisado no terminal Tauri:

- impressão direta usa o driver de impressora do Windows;
- a pré-visualização usa o diálogo de impressão do sistema;
- o envio é local ao terminal e não participa da confirmação financeira;
- nomes de impressora e layout possuem limites server-side;
- o layout é escapado na pré-visualização e limitado a 80 linhas, com texto
  livre limitado a 120 caracteres na interface.

O fluxo ESC/POS foi removido por decisão de produto. Não foi encontrado
defeito novo no fluxo Windows/GDI. Falhas de impressão continuam separadas da
venda confirmada, conforme a regra operacional. A validação automatizada
permaneceu com 59 testes aprovados.

### Auditoria de dependências — 2026-11-02

As dependências declaradas foram comparadas com os imports, scripts, comandos
Tauri e configurações de capability. Foram removidas `cors`,
`@tauri-apps/plugin-http`, `rfd` e `tauri-plugin-http`, pois não tinham uso
ativo após a remoção da impressão TCP/RAW e da seleção local de diretório de
backup. O `package-lock.json` e o `Cargo.lock` foram atualizados, e não restam
referências a esses pacotes ou comandos.

As dependências ainda utilizadas foram preservadas: Vite/Tauri, `keytar`,
`lucide`, `mysql2`, `node-forge`, `xml-crypto`, além das crates Rust usadas
pela janela, DPAPI, ícone, logging e impressão Windows/GDI.

### Auditoria de schema e migrações — 2026-11-02

`database/schema.sql` foi comparado com as declarações `CREATE TABLE IF NOT
EXISTS` do gerenciador de schema em runtime. Não há tabela criada somente pelo
runtime sem correspondente no schema inicial. As tabelas que aparecem apenas
no schema inicial são as entidades centrais que a instalação deve criar pela
importação inicial, como produtos, vendas, itens, pagamentos e NCM/CEST; a API
não tenta recriá-las automaticamente para evitar ocultar uma instalação
incompleta.

As migrações de unidades culinárias, normalização de textos e correção de
embalagens continuam presentes, documentadas e separadas da inicialização
normalizadora da API. As operações de dados revisadas usam transação, consultas
parametrizadas e verificações de conflito antes de alterar registros. Nenhuma
inconsistência nova foi encontrada nesta auditoria.

### Auditoria de empacotamento Windows — 2026-11-02

O script `scripts/build-client-release.mjs` continua usando somente as
ferramentas declaradas do projeto: Node.js, Vite e a CLI Tauri. O bundle
mantém os instaladores MSI/NSIS por máquina, o `UpgradeCode` fixo do WiX e a
proibição de downgrade no Windows. A remoção de ESC/POS e das dependências
obsoletas não deixou referências no processo de release.

As versões de `package.json`, `src-tauri/tauri.conf.json` e
`src-tauri/Cargo.toml` estão sincronizadas em `0.8.11`. A sintaxe dos scripts
de release/versionamento foi validada. Não foi executado build completo de
instalador, pois esta auditoria não exigia gerar artefatos distribuíveis.

Os instaladores Windows foram configurados para português: NSIS usa
`Portuguese`, WiX/MSI usa `pt-BR` e o seletor de idioma permanece desativado
para manter a instalação da loja em português.

### Auditoria de desempenho — 2026-11-02

A busca da Frente de Caixa reconstruía todo o DOM da tela a cada tecla,
incluindo carrinho, resumo, modal de pagamento e todos os listeners. A busca
agora atualiza somente o grid de produtos e reusa o binding existente dos
cartões. Isso reduz trabalho de layout e evita reconfigurar partes da tela que
não mudaram, sem alterar o contrato da API ou o comportamento do carrinho.

O endpoint de produtos ainda retorna o catálogo completo e não foi paginado
nesta etapa, porque a Frente de Caixa e as Views atuais dependem da coleção
completa para filtragem local. A paginação deve ser tratada como alteração de
contrato em uma etapa própria, com medição do volume real e suporte no
frontend.

A tela de cadastro de produtos também deixou de baixar o catálogo completo de
NCMs durante a abertura. A consulta é carregada somente quando o usuário abre
o modal de pesquisa, com estados explícitos de carregamento, erro e tentativa
novamente. O código NCM já selecionado permanece no formulário mesmo antes da
carga da descrição correspondente.

#### Medição de volume dos catálogos — 2026-11-02

Os endpoints locais foram medidos três vezes com autenticação, em ambiente de
desenvolvimento, sem alterar dados:

| Endpoint | Registros | Resposta UTF-8 | Observação |
| --- | ---: | ---: | --- |
| `/api/products?includeInactive=1` | 75 | 43 KB | Volume compatível com filtragem local e sem paginação imediata |
| `/api/groups?includeInactive=1` | 19 | 2,8 KB | Volume baixo |
| `/api/ncm-cest/ncms` | 10.508 | 939 KB | Maior payload; adequado para carga sob demanda, não para toda abertura |
| `/api/ncm-cest/cests` | 947 | 194 KB | Catálogo fiscal relevante; deve ser avaliado para consulta server-side |

Produtos variaram entre 43 e 133 ms nas três medições, grupos entre 3 e
5 ms, NCMs entre 125 e 400 ms e CESTs entre 78 e 350 ms após o aquecimento
local. Uma medição inicial isolada do CEST chegou a 6,7 s, indicando que a
preparação/cache do banco pode dominar a primeira consulta; esse valor não foi
usado como latência média.

Conclusão: não há evidência para introduzir paginação em produtos ou grupos
agora, pois a carga atual é pequena e as telas dependem de filtragem local.
NCM/CEST permanece candidato a paginação ou busca server-side, especialmente
na tela dedicada que hoje carrega os dois catálogos completos. Essa alteração
deve preservar a pesquisa, a paginação visual e os contratos de seleção antes
de ser implementada.

Essa etapa implementou a consulta server-side na tela dedicada de NCM/CEST.
`GET /api/ncm-cest/ncms` e `GET /api/ncm-cest/cests` preservam o retorno completo
quando chamados sem parâmetros, mantendo compatibilidade com o formulário de
produto. Quando recebem `page`, `pageSize` e/ou `search`, retornam somente a
página solicitada junto de `total`, `page`, `pageSize` e `pageCount`. A tela
fiscal usa esse contrato para não transferir os 10.508 NCMs e 947 CESTs de uma
vez; buscas e trocas de página são canceladas logicamente quando uma resposta
mais nova chega primeiro.

Registro intermediário: após o reinício da API publicada, `/api/health`
respondeu HTTP 200 com o banco conectado, porém as rotas paginadas retornaram
404. O reinício confirmou a saúde do serviço, mas não atualizou a cópia
publicada em `C:\ProgramData\PDV\app`.

Registro intermediário: após um bundle inicial, instalação e reinício
informados pelo operador, a validação permaneceu em 404. A inspeção confirmou que
`C:\ProgramData\PDV\app\src\server\server.js` ainda não contém
`parseCatalogPagination`, embora o checkout contenha. O problema é de conteúdo
instalado, não de disponibilidade do serviço; o processo ativo continua sendo
o wrapper `C:\ProgramData\PDV\service\PDV-API.exe`.

Uma tentativa posterior encontrou corrupção nos argumentos de
`Set-LocalUser`/`New-LocalUser` dos scripts de publicação. Os comandos foram
corrigidos com splatting de parâmetros e validados pelo parser do PowerShell;
a publicação foi repetida com sucesso posteriormente.

O operador repetiu a publicação após a correção. A API publicada ficou
saudável, passou a conter `parseCatalogPagination` e
`src/server/catalog-pagination.js`, e as rotas paginadas autenticadas
responderam HTTP 200. A rota de NCM página 2 confirmou total 10.508,
`pageSize` 25 e `pageCount` 421.

Na auditoria de interface e acessibilidade, o Lighthouse encontrou contraste
insuficiente nos textos secundários da Frente de Caixa. As cores de
`eyebrow`, categorias, grupos dos cartões e textos auxiliares do carrinho foram
ajustadas para atingir o contraste mínimo esperado. Os campos de pesquisa
também receberam `name` explícito e rótulos acessíveis onde faltavam. A
auditoria foi executada no
Vite local; os avisos de HTTPS, SEO e arquivos de descoberta (`robots.txt`,
`llms.txt` e `ai-catalog.json`) não foram tratados como defeitos do fluxo
local do PDV nesta etapa.

As tabelas de cadastro e apoio atualmente são:

| Área | Tabelas | Conteúdo |
| --- | --- | --- |
| Produtos | `classes`, `groups`, `products`, `product_types`, `units` | Classificação, Código PDV, operação fiscal de venda, tipo, unidade, preço, estoque, flags operacionais e status |
| Fiscal do produto | `ncm_catalog`, `cest_catalog`, `ncm_cest_relations`, `ncm_cest_updates` | Catálogos NCM/CEST, relações e histórico das cargas |
| Financeiro | `payment_methods` | Forma de pagamento, conta Banco/Caixa, prazo, desconto, acréscimo e status |
| Operações fiscais | `fiscal_operations`, `fiscal_catalog_items` | Operações e listas de CFOP, CST/CSOSN, ICMS, IPI, PIS/COFINS e demais parâmetros |
| Configuração | `company_settings`, `printer_settings`, `general_settings` | Empresa, NFC-e, certificado protegido, impressoras, layout de cupom e regras operacionais gerais |
| Insumos culinários | `culinary_units`, `physical_states`, `culinary_unit_conversions` | Unidades de medida, estados físicos e fatores de conversão para estoque |
| Navegação | `navigation_menus`, `navigation_items` | Menus, barras contextuais, rotas e ordenação |
| Venda | `sales`, `sale_items`, `sale_payments`, `customer_vouchers`, `sale_fiscal_documents` | Venda, itens congelados, pagamentos, idempotência, débitos de Vale e estado fiscal opcional |
| Pessoas | `customers`, `consumers` | Clientes financeiros, consumidores operacionais e relação automática Cliente → Consumidor |

As chaves e colunas persistidas seguem o padrão `nomeCampoEntidade`, por
exemplo `ncmProduct`, `receiptLayoutPrinterSetting`,
`nfceEnvironmentCompany` e `discountTypePaymentMethod`. As relações usam
foreign keys com `ON DELETE RESTRICT` quando a remoção poderia destruir
histórico; por isso a interface oferece inativação antes da exclusão
definitiva.

Ao alterar uma tabela, atualize nesta ordem: `database/schema.sql`, migração compatível
no módulo de schema responsável pelo domínio, consultas e validações da API, telas, testes e esta
documentação. Teste tanto uma instalação nova quanto um banco existente com
colunas da versão anterior. A migração deve preservar dados, índices e
restrições.

As tabelas de unidades culinárias são carregadas pela migração idempotente
`npm.cmd run migrate:culinary-units`. Ela cria as tabelas se necessário e
atualiza somente os registros de referência e os fatores cadastrados; não
remove produtos nem altera o estoque existente.
Essa carga mantém Quilograma (`kg`) e Litro (`l`) ativos, com conversões para
grama e mililitro nos estados físicos compatíveis, respectivamente.
As conversões são bidirecionais: `kg → g`/`g → kg` e `l → ml`/`ml → l`;
assim, um produto cadastrado em kg ou l pode ser utilizado na ficha em sua
unidade menor.

`products.idPhysicalStateProduct` relaciona matérias-primas ao estado físico
usado nas conversões culinárias. O valor `0` significa “não aplicável” e é
gravado para os demais tipos de produto. O campo só aparece no cadastro de
**Matérias-primas**; a API também força `0` quando outro cadastro tenta enviar
um estado físico. Em um banco existente, reinicie a API uma vez após atualizar
o código para que a migração idempotente crie a coluna; em seguida, reinicie o
Vite para carregar o formulário atualizado.

O cadastro oficial de unidades fica em **Cadastros > Produtos > Unidades** e
usa a tabela canônica `units`. A tela expõe código, descrição, unidade base,
categoria e switches para `isActiveUnit`, `isTaxableUnit` e `isCulinaryUnit`.
A preparação do schema consolida variantes duplicadas de `Dúzia`: preserva o
registro referenciado por `unit_conversions`, remove somente a variante sem
referências e normaliza o código para `DZ`. Os códigos `duzia` e `DUZIA` são
tratados somente como aliases legados. Essa limpeza é idempotente e ocorre
durante a inicialização da API.
A antiga tela separada de Unidades Culinárias
não é mais exibida; rotas antigas são redirecionadas para o cadastro oficial.
O menu **Cadastros > Ficha Técnica** mantém apenas as telas auxiliares de
Estados Físicos e Conversões. As alterações são persistidas pela API nos
cadastros unificados e as conversões relacionam duas unidades e um estado
físico, com fator positivo. Códigos são armazenados como slugs em minúsculas e
não aparecem nas listagens; status também permanece disponível apenas nas
ações do cadastro. O fator é digitado e exibido no padrão decimal brasileiro,
como `1,000`. A migração garante conversões identidade e fatores universais entre `g`, `kg`,
`ml`, `l`, `un` e `DZ` em cada estado físico. Durante a transição, as tabelas `culinary_units` e
`culinary_unit_conversions` permanecem no banco para compatibilidade com a
migração e com instalações antigas. Elas só poderão ser removidas após a API
deixar de ler e gravar esses nomes e uma verificação de órfãos confirmar que
todos os vínculos foram migrados. Os estados sólidos são
separados em inteiro, fatiado, picado/cubos e ralado/triturado; **Congelado**
também é mantido como estado próprio. A existência do estado não cria fator
automaticamente: cada conversão não-identidade deve ser cadastrada
explicitamente. Para os quatro estados adicionados posteriormente, a carga
inicial usa fatores aproximados de referência já existentes: `colher_sopa →
g = 10` e `xicara_cha → g = 115`, sempre identificados nas observações como
aproximados. Também são mantidas as unidades `kg`, `l`, `colher_cafe`,
`colher_sobremesa` e `DZ`, com conversões seguras para as unidades-base;
conversões dependentes do produto, como fatia, folha ou lata, não são
generalizadas nesta tabela.
O endpoint de estados físicos deve retornar o campo `isActivePhysicalState`
junto com os dados cadastrais; sem esse campo a tela interpreta o estado como
inativo. A migração remove duplicidades pela combinação origem/destino/estado
antes de garantir a chave única dessa tabela.
As referências volumétricas adotadas são colher de café = 2,5 ml, colher de chá
= 5 ml, colher de sobremesa = 10 ml, colher de sopa = 10 ml, xícara de chá =
200 ml e dose/jigger = 45 ml. Esses valores foram comparados com referências
da Anvisa, da Secretaria Estadual da Saúde do Rio Grande do Sul, do NIST e de
referências institucionais para doses; as fontes e limitações estão em
`docs/research/culinary-conversion-reference.md`. A massa não deve ser
inferida universalmente a partir desses volumes.

Para completar o uso de medidas culinárias em matérias-primas sólidas, a carga
de referência mantém `colher_cha → g` para sólidos picados, inteiros,
fatiados, ralados/triturados e congelados, sempre com observação de que são
fatores aproximados.

Em **Ferramentas > Views > Sem Estado Físico**, a listagem mostra somente
produtos cujo tipo é **MATÉRIA-PRIMA** e cujo `idPhysicalStateProduct` é `0`.
O filtro é aplicado sobre os dados retornados pela API, sem alterar produtos.

As barras contextuais não devem incluir o link **Retaguarda**. A navegação
principal e os handlers de cada tela permanecem responsáveis por seus acessos;
as barras contextuais exibem somente as opções específicas da área atual. A
tela **Frente de Caixa** é uma exceção de layout: seu cabeçalho deve manter o
botão **Retaguarda**, pois ele não faz parte de uma barra contextual.

No **Construtor de navegação**, a estrutura existente continua protegida:
menus, itens e submenus não podem ser criados livremente. Um divisor visual é
a única exceção e deve ser incluído pelo botão **Adicionar divisor abaixo** de
um item existente. A API desloca atomicamente os itens seguintes do mesmo
nível para manter o divisor imediatamente abaixo do item escolhido.

A ordem é sequencial dentro do próprio escopo: menus possuem sua sequência;
itens de menu são numerados entre os irmãos do menu; barras são numeradas
entre os irmãos do item pai; e divisores compartilham a sequência do nível em
que foram inseridos. A inicialização da API normaliza lacunas preservando a
ordem relativa existente. Divisores podem ser excluídos individualmente pelo
construtor; a API aceita `DELETE /api/navigation/items` somente para registros
do tipo `divider` e ajusta atomicamente a ordem dos irmãos restantes.

No Windows, `pdv.vbs` inicia diretamente o CLI Tauri pelo Node sem exibir as
janelas de console do `npm` e do Cargo. Isso evita uma camada de inicialização
do `npm` e reduz a demora antes da janela nativa aparecer. O `pdv.cmd`
permanece como alternativa para diagnóstico. O executável Tauri de produção
usa `windows_subsystem = "windows"` e não deve abrir uma janela de console.

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
git diff --check
```

Execute `npm.cmd run build` quando a alteração envolver o bundle do frontend,
configuração Vite/Tauri, versionamento ou uma validação de produção. Para
alterações de JavaScript, execute `node --check` nos arquivos modificados.
Não é necessário compilar o projeto inteiro a cada alteração.

### Diretriz de validação e continuidade

Não compile o projeto inteiro após toda alteração. Escolha a menor validação
que cubra o escopo modificado:

- documentação, scripts locais e testes isolados: `git diff --check` e os
  testes diretamente relacionados;
- JavaScript: `node --check` nos arquivos alterados e os testes relacionados;
- `src/server/`: `npm.cmd test`, `node --check` e reinício da API publicada
  antes da validação operacional;
- Vite, Tauri, versionamento ou bundle distribuível: execute o build
  correspondente;
- alterações que envolvam MariaDB: valide o fluxo completo com banco e dados
  de teste controlados, sem usar dados reais.

Toda etapa relevante deve deixar nos documentos afetados o estado atual, os
comandos realmente executados, o resultado da validação, a necessidade de
reiniciar a API ou redistribuir o frontend e os próximos bloqueios conhecidos.
Nunca registre senhas, tokens, certificados, XMLs reais, dumps ou outros
segredos. O documento canônico deve ser atualizado em vez de criar notas
paralelas na raiz do repositório.

### Migrações disponíveis

### Cancelamento auditado de vendas

O cancelamento de uma venda confirmada é uma operação transacional protegida
por sessão de operador. Somente `supervisor` e `admin` podem executá-la pela
rota `POST /api/sales/:idSale/cancel`, enviando um motivo com pelo menos cinco
caracteres.

A API não apaga a venda. Ela marca `statusSale = 'cancelled'`, registra o
operador, horário e motivo, repõe o estoque controlado, cancela um Vale ainda
aberto e registra a reversão de valores da conta `Caixa` como movimento
`sale_cancellation`. A reversão financeira exige que o caixa da venda ainda
esteja aberto. Qualquer falha provoca rollback completo, e uma venda já
cancelada retorna resultado idempotente.

Alterações nesse fluxo exigem testes de serviço e contrato HTTP, `node --check`
nos módulos JavaScript, publicação e reinício da API antes da validação
operacional. A tela de vendas ainda não oferece a ação visual de cancelamento;
essa integração foi adicionada posteriormente como consulta sob demanda de
vendas recentes. O modal permite cancelar uma venda somente para
`supervisor`/`admin`, exige confirmação e motivo, e atualiza a lista após o
sucesso. Como a tela ainda depende do frontend distribuído, a validação em
terminal exige novo bundle; não use `window.confirm` nem `window.prompt`.

As migrações ficam em `scripts/migrations/` e devem ser executadas somente
com backup verificável quando alterarem dados existentes:

| Comando | Arquivo | Finalidade |
| --- | --- | --- |
| `npm.cmd run migrate:culinary-units` | `migrate-culinary-units.mjs` | Cria ou atualiza unidades, estados físicos e conversões culinárias de referência |
| `npm.cmd run migrate:uppercase` | `migrate-uppercase-data.mjs` | Normaliza textos humanos para capitalização de título e SKUs para maiúsculas |
| `node --env-file=.env scripts/migrations/migrate-embalagens-to-uso-consumo.mjs` | `migrate-embalagens-to-uso-consumo.mjs` | Migra dados legados de embalagens para a classificação de uso e consumo |

As duas primeiras migrações possuem scripts npm. A migração de embalagens é
um procedimento operacional explícito e não deve ser adicionada a um comando
genérico sem revisar sua idempotência e o impacto nos dados existentes. Todas
as migrações devem preservar dados e ser validadas com uma leitura real da API
depois da execução.

### Versionamento dos builds

O hook `prebuild` de `package.json` e o script `prerelease:client` acionam
automaticamente `npm.cmd run version:auto` antes de executar seus builds. O
script mantém a mesma versão em:

- `package.json`;
- `package-lock.json`;
- `src-tauri/tauri.conf.json`.

Quando uma alteração funcional exigir nova versão, faça um incremento explícito
e único com `version:patch`, `version:minor` ou `version:major`. Alterações
pontuais e correções compatíveis normalmente usam `patch`; `minor` fica
reservado para uma nova capacidade compatível identificada explicitamente;
`major` exige quebra incompatível. No versionamento automático, alterações de
fonte, arquivos novos e expansões compatíveis ficam em `patch` por padrão.
Para solicitar `minor`, inclua no diff a marca `MINOR CHANGE:` ou
`MINOR_CHANGE:`. Alterações somente documentais ou testes isolados não exigem
incremento.

**Diretriz:** o versionamento automático é acionado quando existe alteração
pendente no build ou na geração do cliente. A primeira execução classifica o
diff pendente: `patch` para correções e
expansões compatíveis, `minor` somente com `MINOR CHANGE:` ou
`MINOR_CHANGE:`, `major` somente com `BREAKING CHANGE:` ou
`BREAKING_CHANGE:`. Se houver apenas documentação, testes isolados ou arquivos
de versionamento, a versão não deve ser incrementada. Não use
`npm.cmd run version:patch` automaticamente para substituir essa análise;
reserve os comandos `version:minor` e `version:major` para uma decisão explícita.
Depois que os arquivos de versão forem alterados, novas execuções antes do
commit reconhecem que o conjunto já foi versionado e não incrementam novamente.

Os comandos manuais são:

| Comando | Uso | Exemplo |
| --- | --- | --- |
| `npm.cmd run version:patch` | Correção ou ajuste compatível | `0.1.2` → `0.1.3` |
| `npm.cmd run version:minor` | Nova funcionalidade compatível | `0.1.9` → `0.2.0` |
| `npm.cmd run version:major` | Mudança incompatível ou primeira versão estável | `0.9.9` → `1.0.0` |

`npm.cmd run version:increment` permanece como alias compatível para
`version:patch`. `npm.cmd run version:auto` analisa o diff pendente e aplica a
classificação automática descrita acima. Ele é acionado pelos gatilhos
`prebuild` e `prerelease:client`, além de poder ser executado manualmente.

A versão definida no `package.json` é injetada pelo Vite em
`src/shared/build-info.js` e também é retornada pela API em
`GET /api/health`. A tela **Ferramentas > Status da API** exibe a mesma versão
em **Versão do aplicativo** e **Versão da API**. O **Identificador do frontend**
é somente o fingerprint do código compilado, sem repetir a versão SemVer.

O memorial das alterações por versão fica em
[`CHANGELOG.md`](CHANGELOG.md). Cada incremento distribuível deve registrar
nesse documento as novidades, correções e ajustes relevantes da versão,
preferencialmente com a data e uma separação clara por categoria. O changelog
não substitui o histórico arquitetural em `PROJECT-HISTORY.md`: o primeiro
resume o conteúdo de cada versão; o segundo registra decisões e evolução
duradoura do projeto.

### Views de produtos

**Views** é um item direto de **Ferramentas**, seguindo o mesmo padrão de
**Produtos**. Ele não deve ser implementado como `submenu` nem como submenu
visual dentro do menu principal. Ao clicar em **Views**, a aplicação abre a
primeira tela, **Grupos x Produtos**, e renderiza a barra contextual com
**Grupos x Produtos** (ordem 1) e **Sem Custo** (ordem 2).

**Grupos x Produtos** exibe a árvore `Classe - Grupo`, com a contagem de
produtos cadastrados, e a listagem com pesquisa, ordenação, status,
visibilidade, exclusão e edição, sem a coluna de custos. **Sem Custo** reutiliza
a mesma listagem sem a árvore e mantém somente produtos cujo
`costPriceProduct` é zero.

A edição ocorre em modal local e, após salvar, a tela preserva a navegação
atual, a pesquisa, o grupo selecionado e a ordenação. A listagem compartilhada
fica em `src/tools/product-list-view.js`; novas Views devem reutilizar esse
componente em vez de duplicar tabela e eventos. Como essa área é frontend-only,
não é necessário reiniciar a API após alterações nela.

### Backup e restauração

O item **Ferramentas > Backup e restauração** cria arquivos
`pdv-backup-AAAAMMDD-HHMMSS.json.gz` no diretório de backup do servidor da API.
O conteúdo é um snapshot compactado das tabelas do banco; as credenciais do
MariaDB nunca são enviadas ao terminal.

O destino pode ser definido por `PDV_BACKUP_DIR`. Sem essa variável, o ambiente
de produção tenta primeiro `backups` dentro da pasta da aplicação da API e,
se essa pasta não for gravável (por exemplo, uma instalação protegida em
`Program Files`), usa `%LOCALAPPDATA%\\PDV Zanzibar\\backups`. Em
desenvolvimento, o padrão é `%LOCALAPPDATA%\\PDV Zanzibar\\backups`, evitando
gravar no workspace. A tela exibe o destino efetivo utilizado.

O operador não informa o destino na tela. O terminal recebe apenas a indicação
de que o destino é controlado pelo servidor e nunca recebe o caminho físico.

As configurações gerais ficam na tabela `general_settings`. Além de
booleanos, ela aceita valores `text`, `number` e `json` por meio de
`valueGeneralSetting`, enquanto `typeGeneralSetting` identifica o tipo do
valor. As fontes NCM e CEST são inicializadas com defaults seguros e podem ser
alteradas pela tela de Configurações Gerais; a API mantém os defaults enquanto
o banco ainda não estiver preparado.

Perguntas que interrompem ações, como exclusões e restaurações, usam o modal
reutilizável `src/ui/confirmation-modal.js`. Ele substitui `window.confirm`
por uma confirmação no padrão visual do projeto, com consequência descrita,
botão principal nomeado, cancelamento explícito e suporte a teclado.

A restauração exige confirmação explícita, valida a versão e as tabelas do
arquivo, desativa temporariamente as verificações de chave estrangeira e
substitui os dados em uma transação. Não restaure um arquivo sem confirmar a
origem e a data do backup. O servidor deve possuir espaço suficiente para o
arquivo compactado e para a operação transitória.

Ao fechar o aplicativo Tauri, o terminal pergunta se deve criar um backup.
Escolher **Não** fecha sem criar arquivo; escolher **Sim** cria o backup no
servidor e só então conclui o encerramento. Se a API estiver indisponível, o
operador decide explicitamente entre cancelar o fechamento ou fechar mesmo
assim.

Como o incremento ocorre antes da compilação, um build que falhar ainda
consome o número da versão. Isso mantém cada tentativa de artefato identificada
de forma única e evita reutilizar uma versão potencialmente distribuída.

### Instalação sem cargas padrão

Uma instalação nova cria somente a estrutura das tabelas. Tipos de produto,
unidades, catálogos fiscais, formas de pagamento, impressoras, configurações,
empresa e navegação não são inseridos automaticamente pela API nem pelo
`database/schema.sql`. Esses registros devem ser cadastrados explicitamente pelas telas
correspondentes. Essa decisão evita que uma exclusão feita pelo usuário seja
desfeita por uma rotina de inicialização e mantém o banco sob controle da loja.

Registros existentes não são removidos por essa regra. A remoção de dados de
uma instalação já utilizada deve ser feita por uma migração específica,
revisada e autorizada.

Quando uma mudança alterar API, banco ou fluxo de cadastro, inclua cobertura
para sucesso, entradas inválidas, erros explícitos e efeitos relevantes no
estado persistido.

Clientes exigem somente o nome. Ao criar um Cliente, a API cria o Consumidor
correspondente na mesma transação; consumidores avulsos continuam permitidos.
Um Consumidor vinculado a Cliente pode ter nome, apelido, telefone e observações
alterados na tela de Consumidores; o vínculo não é alterado por essa tela.
O cadastro de Cliente não possui prazo próprio: o vencimento de um Vale é a
data da venda, e a coluna legada `paymentTermCustomer` não deve ser recriada.
O histórico financeiro de Vale fica vinculado ao Cliente e o histórico de
consumo deve ser exibido somente na área de Consumidores. O fechamento de uma
venda em Vale valida o cliente ativo, o limite disponível e grava o débito
junto com a venda.

O cadastro de operações fiscais é uma camada de parametrização. Ele armazena
CFOP, regime, tipo de entrada/saída, contexto fiscal, situações tributárias,
modalidades de base, PIS, COFINS, IPI, FCP, benefício fiscal e base legal.
Esses dados ainda não significam emissão de NFC-e/NF-e nem cálculo tributário
automático; a integração fiscal deverá consumir essa configuração em etapa
posterior.

### Variáveis adicionais do servidor

Além das variáveis de banco e rede, a API pode usar:

| Variável | Finalidade |
| --- | --- |
| `PDV_CERTIFICATE_ENCRYPTION_KEY` | Chave base64 de 32 bytes para proteger certificado A1 e senha no servidor |
| `PDV_NCM_SOURCE_URL` | Fonte configurável para atualização do catálogo NCM |
| `PDV_CEST_SOURCE_URL` | Fonte configurável para atualização do catálogo CEST |

Esses valores são locais e nunca devem aparecer em documentação com conteúdo
real. A chave de criptografia é obrigatória para salvar certificado A1 e usar
os testes NFC-e.

As listas usadas pelas operações fiscais são persistidas em `fiscal_catalog_items`
e possuem telas CRUD separadas. O campo `catalogFiscalCatalogItem` identifica
cada catálogo, permitindo administrar CFOP, CST/CSOSN, alíquotas de ICMS e as
demais tabelas sem manter opções fiscais somente no frontend.

### Visualização por seleção de linha

Nas telas que combinam formulário à esquerda e listagem à direita, clicar no
corpo de uma linha deve carregar o registro correspondente no formulário em
modo de visualização. Nesse modo:

- os campos ficam bloqueados para evitar alterações acidentais;
- os botões **Salvar** e **Limpar** ficam ocultos;
- os botões de editar, excluir e alterar status da própria linha continuam
  independentes e não devem ser acionados pelo clique na linha;
- o cabeçalho do formulário oferece **Novo cadastro** para sair da
  visualização e retornar ao formulário vazio;
- clicar novamente na linha selecionada também encerra a visualização.

O comportamento compartilhado fica em
`src/ui/form-row-preview.js`. Novas telas CRUD devem marcar as linhas com
`data-view-record` contendo o JSON do registro e chamar
`bindFormRowPreview` depois de renderizar o formulário e a tabela. O conteúdo
do registro deve usar os mesmos nomes dos campos do formulário, para que o
preenchimento seja automático. Ações interativas dentro da linha devem ficar
em botões ou controles próprios; o helper ignora esses elementos ao detectar o
clique de visualização.

### Diretriz de edição em modal

A edição de registros deve seguir o padrão de modal sobre a listagem, nunca
reaproveitar o formulário de inclusão no mesmo bloco visual da tela. O fluxo
padronizado é:

- formulário de cadastro/entrada permanece fixo à esquerda ou acima da lista;
- clicar em uma linha carrega o registro em modo de visualização;
- clicar em **Editar** abre um modal com o mesmo cadastro em contexto de
  alteração;
- o formulário de edição usa o mesmo conjunto de campos, mas em uma camada
  separada e com foco no modal;
- o modal fecha com **Cancelar** ou clique fora, retornando ao estado anterior.

Essa regra vale para todos os CRUDs do PDV e elimina a mistura entre
"inclusão" e "alteração" no mesmo estado visual. O padrão foi consolidado
nas telas de classes, grupos, produtos, pagamento e operação fiscal.

### Feedback e continuidade dos formulários

Mensagens de sucesso, tanto ao incluir quanto ao editar, devem ser exibidas
como um modal temporário fixo e centralizado na viewport, fora do fluxo de
layout do formulário de inclusão ou do modal de edição. O modal não pode
receber foco nem alterar a posição de rolagem da tela.
O feedback deve usar o helper compartilhado em `src/ui/feedback.js`, possuir
`role="status"`, esmaecer ao entrar e sair e desaparecer automaticamente após
aproximadamente 2,5 segundos. Mensagens de erro permanecem visíveis até
uma nova ação ou correção.
Quando somente a mensagem temporária desaparecer, todas as telas devem remover
o elemento de feedback sem reconstruir o formulário inteiro. Use
`clearRenderedFeedback(root)` no callback de `createFeedbackTimer`; um `render()`
nesse temporizador remove o foco do campo em que o operador pode já ter
iniciado o próximo cadastro.
Essa regra vale para cadastros, configurações, importações, backups,
impressão, consultas e qualquer outra tela que exiba o feedback compartilhado.

Depois de cadastrar um novo registro, o formulário de inclusão deve retornar
ao estado vazio e pronto para o próximo cadastro. Após editar um registro, o
modal deve ser encerrado sem deixar a mensagem de sucesso no formulário de
inclusão. Novas telas e alterações em formulários devem preservar esse
comportamento, sem criar um fluxo visual diferente.

### Preservação de rascunhos durante renderizações

Formulários do frontend podem ser reconstruídos por `root.innerHTML` quando
uma carga assíncrona termina, um filtro muda ou o estado de uma tela é
atualizado. Essa reconstrução não pode apagar o que o usuário já digitou.

Novos formulários e alterações em formulários existentes devem:

- capturar os valores atuais antes de chamar `render()` novamente;
- restaurar inputs, selects, textareas, checkboxes e radios após a
  reconstrução;
- preservar campos mascarados no valor que está visível no formulário;
- não capturar o formulário em modo de visualização como rascunho de inclusão;
- respeitar ações explícitas: **Limpar** deve zerar o rascunho, **Cancelar**
  deve fechar ou abandonar a edição, e o sucesso do salvamento deve devolver o
  formulário de inclusão ao estado vazio;
- manter formulários de inclusão e edição modal com estados independentes.

Use o helper compartilhado `src/ui/form-draft.js` sempre que a tela fizer
reconstrução completa do formulário. O helper registra cada formulário e seus
campos nomeados, incluindo o estado marcado de checkboxes e radios, chama a
função de renderização e restaura os valores correspondentes. Quando a tela
possuir regras específicas de estado, como um formulário parametrizado ou
campos sem `name`, complemente o helper com um rascunho explícito da tela.

O teste mínimo deve comprovar a preservação de texto, seleção e estado
booleano durante uma renderização. Também valide os caminhos de limpeza,
cancelamento e salvamento quando eles existirem. A referência automatizada
está em `tests/unit/form-draft.test.js`.

#### Checklist obrigatório para novos formulários

Antes de adicionar ou alterar um formulário que reconstrói o DOM, confirme:

1. A função de carregamento preserva o rascunho somente durante renderizações
   intermediárias e não o recaptura depois de uma ação concluída.
2. O botão **Limpar** zera o estado explícito do rascunho antes de renderizar
   novamente, usando uma opção equivalente a `captureDraft: false` quando a
   tela possuir esse controle.
3. Após um cadastro incluído com sucesso, o formulário de inclusão é
   reconstruído vazio; após uma edição, o modal é fechado e não preenche o
   formulário de inclusão.
4. Falhas da API mantêm os valores digitados para permitir correção e nova
   tentativa, sem apresentar sucesso falso.
5. Visualização de linha, inclusão e edição modal não compartilham
   inadvertidamente a mesma fonte de estado.
6. O teste da tela ou do helper cobre, quando aplicável, renderização
   assíncrona, **Limpar**, **Cancelar**, inclusão, edição e falha de
   salvamento.
7. Temporizadores de feedback usam `clearRenderedFeedback(root)` e nunca
   chamam `render()` apenas para apagar uma mensagem temporária.

Não use `renderPreservingFormDraft` como substituto de uma ação explícita de
limpeza. O helper deve preservar somente uma digitação ainda ativa; depois de
**Salvar** ou **Limpar**, a tela precisa informar ao renderizador que o
rascunho foi descartado. Ao revisar uma tela existente, procure especialmente
o ciclo `submit() -> load() -> renderPreservingFormDraft()`, pois ele pode
recapturar os valores recém-salvos e fazer o formulário parecer não limpo.

### Navegação de Produtos

A tela **Mercadoria para Revenda**, além de **Classes** e **Grupos**, pertence
ao item **Cadastros > Produtos** e compartilha sua barra contextual. O item
**Produtos** é apenas o agrupador no menu principal, sem rota própria; ao
acessá-lo, a navegação abre o primeiro filho, **Mercadoria para Revenda**.
**Produtos Acabados** é o segundo filho e usa a mesma tela parametrizada, com
tipo de produto **Produto Acabado** e operação fiscal padrão **Venda de
produção**.

Mercadoria para Revenda usa o prefixo inicial **REV-** para novos SKUs. A
listagem é apresentada como **Mercadorias para Revenda**. Produtos importados
ou cadastrados como Mercadoria para Revenda devem permanecer nesse tipo e não
podem ser convertidos automaticamente para Produtos Acabados.
A barra é renderizada por `src/catalog/product-navigation.js`; o título
permanece no cabeçalho da tela, sem repetir o título ou inserir separador
vertical na barra.

### Cadastro de Produtos

O `pdvCodeProduct` de novos produtos é atribuído pela API com o mesmo valor do
`idProduct` gerado. O Código PDV não é editável e não é importado do CSV.
Produtos já cadastrados preservam o valor existente, inclusive durante edição;
`barcodeProduct` continua sendo migrado para `pdvCodeProduct` sem descartar
esses valores. Cada produto pode referenciar uma
operação fiscal de saída (`idFiscalOperationSaleProduct`), um tipo em
`product_types` e uma unidade tributável em `units`. As tabelas auxiliares são
criadas de forma idempotente e permanecem sem registros até o usuário
cadastrá-los.

Os campos `controlsStockProduct`, `isFractionalProduct` e
`showsInPdvProduct` são booleanos validados pela API. O campo `printsPlace`
define o destino de impressão e aceita somente `Não Imprimir`, `Bar`, `Copa` ou
`Cozinha`; o padrão é `Não Imprimir`. O campo aparece nos formulários de
**Mercadoria para Revenda** e **Produtos Acabados**, ao lado de Estoque. Para
Matérias-primas, Embalagens e Material de Uso e Consumo, a API grava sempre
`Não Imprimir`. O editor de produtos em **Views** mantém o campo disponível
para edição.
`showsInPdvProduct` inicia como verdadeiro e controla se o produto aparece na
frente de caixa. O estoque inicial é
inteiro para produtos não fracionados e aceita até três casas decimais para
produtos fracionados. **Zero é permitido em qualquer configuração**. Quando a
configuração `allowNegativeStock` está ativa, o valor também pode ser negativo;
quando está desativada, o formulário e a API exigem valor maior ou igual a zero.
A quantidade vendida pode aceitar até três casas decimais para produtos
fracionados. Quando `controlsStockProduct` é falso, o item e o pagamento são
persistidos normalmente; antes da baixa, o serviço verifica esse campo e não
valida disponibilidade nem altera `stockQuantityProduct` quando ele está
desativado. Produtos
legados com `printsKitchenProduct = 1` são convertidos para `Cozinha` pela
evolução idempotente do schema; os demais recebem `Não Imprimir`. A alteração
do schema e da API exige publicar a API atualizada e reiniciar o serviço
`PDV-API`; não exige reinstalar o terminal inteiro.

Na consulta de produtos da Frente de Caixa, a disponibilidade só restringe
produtos que controlam estoque quando `allowNegativeStock` está desativado.
Com `Permitir estoque negativo` ativado, produtos com estoque zero ou negativo
continuam sendo renderizados; produtos que não controlam estoque também
continuam disponíveis. Consultas administrativas com `includeInactive=1` não
usam esse filtro.

Na importação de produtos por CSV, o modelo inclui `printsPlace` e
`isActiveProduct`. O local aceita `Não Imprimir`, `Bar`, `Copa` ou `Cozinha`,
aceitando também variações de caixa e a forma sem acento de `Não Imprimir`;
o status aceita `ATIVO` ou `INATIVO` (também `1`/`0`, `sim`/`não`) e usa
`ATIVO` como padrão. A tela de importação disponibiliza os arquivos
`referencia-locais-de-impressao.md` e `referencia-status-produtos.md`.

Na barra de navegação de terceiro nível de **Cadastros > Produtos**, os
cadastros de **Tipo de Produto** e **Unidade tributável** ficam disponíveis
como submenus próprios. O formulário
de Produtos mantém Grupo e Operação fiscal de venda na mesma linha, e Tipo de
Produto e Unidade tributável na linha seguinte. Para novos produtos, o padrão
é **Mercadoria para Revenda** e **UN**, quando esses registros estiverem
disponíveis.

O cadastro de **Tipos de Produtos** possui o campo opcional **Código SPED**,
exibido como primeiro campo do formulário e primeira coluna da listagem. A API
aplica capitalização de título aos textos humanos, limita o código a 30
caracteres e preserva `NULL`
quando o tipo ainda não possui código informado. A coluna é criada em bases
novas pelo `database/schema.sql` e adicionada de forma idempotente em bases existentes.

O campo **Unidade tributável** dos produtos lista somente unidades com
`isTaxableUnit = 1`; medidas culinárias gerais permanecem disponíveis apenas
onde o fluxo culinário exige `isCulinaryUnit = 1`.

### Cadastro de Fornecedores

Fornecedores são mantidos em uma tela própria no menu **Cadastros**. O
cadastro cobre pessoa jurídica e pessoa física, documento, razão social/nome,
nome fantasia, contato, telefone, e-mail, endereço completo, UF e observações.
O país não é solicitado na tela e a API mantém `Brasil` como padrão. CNPJ/CPF,
telefone e CEP recebem máscara durante a digitação; e-mails são normalizados
sem espaços e em minúsculas. O documento é armazenado sem máscara e possui
unicidade por tipo de pessoa; a interface apresenta o valor formatado.
Os campos textuais humanos usam capitalização de título, mantendo preposições e
conjunções curtas em minúscula, como em **Colher de Sopa**. No salvamento, a API
também aplica trim, normalização de espaços e validações de
tamanho/obrigatoriedade; e-mails continuam em minúsculas por regra técnica.

No formulário de novo fornecedor, o botão ao lado do CNPJ consulta a BrasilAPI
e preenche razão social, nome fantasia, contato, telefone, e-mail e endereço
quando os dados estiverem disponíveis. O botão ao lado do CEP consulta o
ViaCEP e preenche logradouro, bairro, cidade e UF. As consultas são apenas
auxiliares: os dados retornados devem ser revisados antes do salvamento e uma
falha de consulta não impede o preenchimento manual.

A tabela `suppliers` é criada de forma idempotente pela API e já está definida
no `database/schema.sql`. A tela segue o padrão de listagem com pesquisa, edição em
modal, exclusão, ativação/inativação e feedback após cada operação.

### Consulta de NFC-e para testes

A Retaguarda possui a tela **Consulta de NFC-e** para validar o fluxo antes
da implementação de entradas de compras. Ela exibe uma demonstração baseada
em uma NFC-e consultada no portal de Minas Gerais, permite selecionar itens
para o desenho futuro da entrada e abre a consulta oficial para uma chave
informada pelo operador.

O portal oficial continua responsável pelo desafio Cloudflare Turnstile. A
aplicação não tenta contorná-lo, não captura automaticamente a página externa
e não grava os dados demonstrativos no banco. A próxima etapa pode reutilizar
os itens selecionados para vincular produtos existentes ou iniciar cadastros
durante o lançamento de uma compra.

### Importação de cadastros

Em **Ferramentas > Importar cadastros**, o painel **Importar Produtos** oferece
um modelo CSV, a validação do arquivo antes do envio e a importação em lote.
O modelo baixado usa cabeçalhos em português, incluindo **Preço de venda** e
**Preço de custo**. A tela também aceita o cabeçalho técnico anterior para
preservar compatibilidade com arquivos já preparados. O arquivo referencia
grupo, operação fiscal, tipo de produto e unidade pelos nomes já cadastrados.
A API valida cada linha e grava todo o lote em uma única transação; se uma
linha falhar, nenhum produto do lote é persistido.
A tela disponibiliza downloads em Markdown com as listas atuais de **Grupos**,
**Operações Fiscais de Venda**, **Tipos de Produto** e **Unidades**, indicando a
coluna do CSV e os valores aceitos. Para operação fiscal, a importação aceita a
descrição ou o CFOP; para tipo de produto, a descrição ou o Código SPED; e
para unidade, o código ou a descrição. Grupo continua sendo informado pela
descrição, pois não possui código próprio no cadastro. O campo de nome/descrição do produto usa capitalização de título durante a
importação. Os campos textuais de cadastros existentes também usam essa forma
na inicialização da API. O SKU e o código técnico `units.codeUnit` são
convertidos obrigatoriamente para maiúsculas; a descrição da unidade usa
capitalização de título. NCM e CEST podem
ser informados com pontuação, como `0201.30.00` e `0603.10.00`; a API remove a
formatação antes de validar e persistir os códigos.

### Migração de capitalização existente

Para normalizar os textos humanos já armazenados no MariaDB e converter os SKUs
e códigos `units.codeUnit` para maiúsculas, execute no
ambiente do servidor:

```powershell
npm.cmd run migrate:uppercase
```

O comando usa a credencial armazenada no Credential Manager quando disponível;
caso contrário, solicita no terminal a senha do `pdv_app` com entrada mascarada
e suporte a Ctrl+V. Em seguida, verifica as tabelas existentes e executa a
alteração em uma única transação. Antes da alteração, verifica colisões após
`UPPER(skuProduct)` e aborta sem modificar dados se encontrar duplicidades. A
migração é idempotente e não altera códigos técnicos, e-mails, URLs, credenciais
ou identificadores.

Antes da escrita, o comando verifica colisões nos campos textuais com índice
único, como classe, grupo, tipo de produto e forma de pagamento. Se dois valores
distintos se tornarem iguais após a conversão, a migração é interrompida sem
alterar o banco e informa a tabela e a coluna conflitantes. Não execute a
migração com a API em processo de atualização concorrente; faça backup conforme
o procedimento operacional do servidor antes de uma primeira execução em
produção.

### Distribuição do PDV Zanzibar

O comando `npm.cmd run release:client -- --api-url=http://192.168.1.200:3000`
usa diretamente os ícones atuais de `src-tauri/icons`, sem consultar o ícone
cadastrado na API, e compila o projeto nativo **PDV Zanzibar** em MSI/EXE.
Os dois instaladores usam escopo por máquina. O MSI mantém um `UpgradeCode`
fixo e o NSIS usa o mesmo escopo, permitindo atualizar a instalação existente
sem exigir uma desinstalação manual. Não alterne entre instalações antigas de
escopo por usuário e os novos bundles; nesse caso, o Windows pode solicitar a
remoção da instalação anterior uma única vez.
O endereço da API é embutido no frontend para a execução do terminal e pode
ser substituído explicitamente com `--api-url`. O comando não faz push ou
deploy. Os arquivos finais são renomeados para o padrão curto
`pdv-zanzibar.msi` e `pdv-zanzibar.exe`; a versão continua registrada
internamente no aplicativo, mas não aparece no nome publicado em
`dist\releases`. O metadata fica em `pdv-zanzibar-metadata.json`.
O instalador deve ser gerado novamente após trocar o ícone. Na máquina do
cliente, instale o arquivo recém-gerado e crie um novo atalho; o Windows pode
manter em cache o ícone de atalhos antigos. O arquivo `*-metadata.json` gerado
junto aos instaladores registra o nome do projeto, a API usada e a origem dos
ícones para conferência da distribuição. Para regenerar os ícones durante o
release, acrescente `--refresh-icons`; isso só deve ser usado depois de alterar
`src-tauri/icons/icon.png`.

### Fluxo de documentação, commit e publicação

Uma alteração funcional deve atualizar os documentos diretamente relacionados
na mesma mudança. Para esta base, o fluxo recomendado é:

1. revisar `README.md` somente quando a visão geral mudar;
2. registrar regras operacionais em `docs/DEVELOPMENT.md` ou
   `docs/DEPLOYMENT.md`;
3. registrar marcos funcionais e decisões consolidadas em
   `docs/PROJECT-HISTORY.md`;
4. atualizar automaticamente os documentos Markdown diretamente relacionados
   quando a alteração de código mudar contrato, operação, arquitetura,
   validação, segurança ou comportamento visível;
5. executar os testes e verificações aplicáveis;
6. conferir `git diff --check` e garantir que `.env`, credenciais, dumps,
   backups, `node_modules`, `dist`, `src-tauri/target` e
   `.playwright-mcp` e `.agents` não estejam no escopo;
7. criar um commit com uma mensagem objetiva no padrão adotado pelo projeto;
8. abrir o pull request contra `main`, descrevendo comportamento alterado,
   validações e eventuais passos de reinício da API;
9. fazer o merge somente após revisar o diff e o resultado das verificações;
10. publicar a API e os bundles do cliente usando somente o procedimento
   documentado em `docs/DEPLOYMENT.md`.

O hook `prebuild` e o fluxo `prerelease:client` podem acionar o versionamento
automático quando o build é executado. Um commit apenas documental ou uma
correção pontual não deve gerar uma nova versão sem uma decisão explícita de
SemVer. Alterações em `src/server/` exigem reiniciar ou
reinstalar o serviço `PDV-API` antes da validação; alterações somente em
frontend, documentação ou scripts locais não exigem reinício da API.

### Correções recentes de formulários e cadastros

Ao alterar uma tela que reconstrói o formulário com `root.innerHTML`, capture o
rascunho antes do render e restaure-o somente quando houver edição real do
operador. Dados recebidos pela API devem substituir um snapshot inicial vazio.
Seleções de logo e ícone também são rascunhos reais. Feedback temporário deve
usar o seletor dedicado `[data-success-feedback]` e ser removido por
`clearRenderedFeedback(root)`, sem apagar mensagens de consulta ou reconstruir
o formulário.

No cadastro de Clientes e Consumidores, status de Cliente e Consumidor
vinculado deve ser sincronizado na mesma transação. O switch de um Consumidor
vinculado permanece visível, mas desabilitado, e a API deve rejeitar uma
alteração direta com erro explícito. Alterações independentes feitas no
Consumidor não devem ser sobrescritas por um salvamento do Cliente que não
mudou aquele campo.

O cadastro da empresa é um singleton lógico: consultas e atualizações devem
selecionar o menor `idCompanySetting` existente, criando uma linha apenas
quando a tabela estiver vazia. Não reintroduza a dependência de
`idCompanySetting = 1` nem execute migrações destrutivas durante leituras.

### Painéis introdutórios e rotas administrativas

As telas de Ferramentas e Configurações usam o componente visual
`.backoffice-home-heading` para apresentar categoria, título e descrição da
função antes do formulário ou da listagem. O CSS compartilhado faz o painel
ocupar a linha inteira quando necessário e mantém margem inferior de 20 px
antes do conteúdo seguinte. A tela Atualizar NCM / CEST usa
`.ncm-cest-update-panel` para ocupar 100% da largura. A tela Dados da
Empresa mantém o formulário diretamente no conteúdo, sem painel introdutório
adicional.

Operações Fiscais e Consulta de NFC-e possuem aliases diretos no roteamento
principal (`fiscal-operations` e `nfce-query`), além dos handlers usados pelos
menus e barras contextuais. Ao criar uma nova entrada persistida, o
`keyNavigationItem` deve apontar para um handler registrado em `src/main.js`,
ou a entrada deve informar uma `routeNavigationItem` que possa ser resolvida
pelo roteamento compartilhado.

Na tela **Matérias-primas**, um novo cadastro inicia com SKU `MP-`, sem operação
fiscal de venda, **Controla estoque** desmarcado e **Exibe no PDV** desmarcado.
O prefixo é apenas um valor inicial editável; o servidor não exige padrões como
`MP-`, `EMB-`, `REV-` ou `PROD-`. Nas quatro telas de produto, ao desmarcar **Controla
estoque**, o campo de estoque fica somente leitura e desabilitado; o valor
existente é preservado ao salvar uma edição.

O cadastro é uma tela parametrizada por tipo de produto. **Produtos** é a
entrada do menu principal; **Matérias-primas**, **Embalagem** e **Material de
Uso e Consumo** ficam disponíveis na barra contextual dessa tela. Cada tela
envia o filtro `productType` para `GET /api/products`, fixa o tipo no

formulário e mantém o mesmo contrato de gravação. Isso permite adicionar
campos e regras específicas por tipo em uma etapa posterior sem duplicar a
camada de API. **Outros Insumos** não faz parte da navegação.

Matérias-primas, embalagens e materiais de uso e consumo não são produtos para
venda. Nessas três telas, o formulário exibe somente **Preço de custo**; as
listagens não exibem a coluna de custos. A API grava `priceProduct` com o
mesmo valor de `costPriceProduct` para manter o contrato de preço e impedir
divergência entre os campos.

Na listagem de produtos, **Duplicar** prepara um novo cadastro sem persistir
alterações no produto original. A ação reaproveita os dados cadastrais, gera
um nome com o sufixo ` - cópia` (numerado quando necessário), limpa SKU e
estoque, descarta vínculos com Receitas/Composições e inicia o novo produto
inativo e oculto no PDV. O SKU deve ser informado antes de salvar; ao salvar,
a API atribui ao novo produto um Código PDV igual ao seu ID. Produtos antigos
preservam o Código PDV existente em edições, embora ele não seja exibido no
formulário.

Classes possuem a referência `idFiscalOperationClass`, migrada de forma
compatível para bases existentes. A API valida a operação fiscal ativa ao criar
ou editar uma classe, e a tela exibe sua descrição na listagem. Grupos são
retornados inicialmente em ordem alfabética por `descriptionGroup` e possuem o
booleano `showsInPdvGroup`, exibido como **Exibir no PDV**. Novos grupos iniciam
com essa opção desmarcada.

A hierarquia também é persistida no MariaDB em `navigation_menus` e
`navigation_items`. O campo `typeNavigationItem` diferencia itens do menu,
submenus e entradas da barra (`item`, `submenu` e `bar`), enquanto
`orderNavigationItem` controla a ordem. O booleano
`showsInBackofficeHomeNavigationItem` define se o registro também aparece como
painel de atalho na tela inicial da Retaguarda. A API expõe a leitura dessa estrutura
em `GET /api/navigation`. A tela **Configurações > Impressoras > Construtor
de menu** permite administrar essa estrutura sem editar SQL: cria menus
principais, itens, submenus e barras contextuais, altera nomes e ordem e
define os atalhos da tela inicial e desativa entradas sem apagar o histórico.
O campo `descriptionNavigationItem` armazena o texto opcional exibido abaixo do
atalho; quando vazio, a interface usa uma descrição padrão compatível com a
chave técnica.

Os menus técnicos `tools` (Ferramentas) e `settings` (Configurações), bem como
todos os itens e submenus vinculados a eles, não podem ser desativados. Essa
regra é aplicada na interface e validada também pela API.

Itens principais podem ser arrastados entre menus pelo contêiner visual do menu
de destino. A troca de menu e a nova ordem ficam pendentes até **Salvar ordem**;
o servidor valida o menu de destino e a relação com eventual item pai antes de
persistir a alteração.

A conexão entre navegação e telas é resolvida por uma rotina compartilhada:
primeiro pelo `keyNavigationItem` e, como fallback, por
`routeNavigationItem`. Isso permite que novos itens, submenus e atalhos
reutilizem handlers já registrados, inclusive em submenus aninhados, sem
alterações específicas na tela da Retaguarda.

Quando um divisor é inserido após um item que possui categorias filhas, ele
continua persistido como irmão do item, mas o construtor o exibe logo abaixo
da linha do item e antes das categorias filhas. Assim, a posição visual da
ação corresponde ao botão **Adicionar divisor abaixo** sem alterar a
hierarquia persistida.

O cadastro de **Dados da Empresa** também mantém o ícone visual do aplicativo em
`projectIconMimeCompany` e `projectIconDataCompany`. A interface carrega esse
ícone em tempo de execução, usa-o no título das telas, atualiza o favicon e
aplica o mesmo arquivo à janela nativa do Tauri, refletindo-se na barra de
tarefas quando o sistema operacional aceitar a atualização. O ícone do
executável e do instalador continua sendo definido pelos arquivos empacotados
em `src-tauri/icons` e só muda em uma nova compilação.

As alterações usam `PUT` em `/api/navigation/menus` e
`/api/navigation/items`. Novos registros não podem ser criados pela interface
nem pelos endpoints `POST`, que respondem com `405`. Os nomes exibidos podem
ser alterados livremente dentro dos limites do banco. O frontend carrega
somente menus e itens ativos, enquanto o construtor consulta também os
registros inativos para permitir manutenção. A inicialização da API pode
corrigir chaves e rótulos legados, mas preserva o estado ativo/inativo dos
menus editáveis; somente menus fixos, como **Frente de Caixa**, mantêm o estado
ativo obrigatório.

### Estrutura dos menus e barras contextuais

Os menus do PDV seguem três níveis de navegação:

1. **Menu**: agrupador principal da barra, como **Cadastros**.
2. **Item do menu**: entrada que representa uma área de cadastro, como
   **Produtos**, **Operações Fiscais** ou **Financeiros**.
3. **Subitens do item**: telas relacionadas àquela área, exibidas em uma barra
   contextual própria, como **Classes**, **Grupos** e **NCM / CEST** dentro de
   **Produtos**.

Ao clicar em um item do menu, a aplicação abre automaticamente o primeiro
subitem na tela e exibe, na barra contextual, os links para os demais
subitens. A tela ativa é destacada nessa barra. O título do grupo permanece no
cabeçalho da tela e não deve ser repetido como um subitem ou como uma segunda
 divisão visual da barra.

Esse padrão deve ser mantido para novos grupos:

```text
Cadastros
└── Produtos           ← agrupador sem rota própria
    ├── Mercadoria para Revenda ← primeira tela aberta ao clicar no item
    ├── Produtos Acabados
    ├── Classes
    ├── Grupos
    └── NCM / CEST

Cadastros
└── Operações Fiscais
    ├── Operações Fiscais
    ├── CFOP
    ├── CST / CSOSN
    └── demais catálogos fiscais

Cadastros
└── Financeiros
    ├── Formas de pagamento  ← primeira tela aberta ao clicar no item
    └── demais tabelas financeiras

Configurações
├── Impressoras
├── Configurações Gerais
├── Dados da Empresa
└── NFC-e

Ferramentas
├── Atualizar NCM / CEST
├── Status da API
├── Impressão térmica
├── Consulta de NFC-e
├── Importar cadastros
├── Backup e restauração
└── Grupos x Produtos
```

### Grupos x Produtos

Em **Ferramentas > Views > Grupos x Produtos**, a tela consulta os grupos e
produtos pela API e mantém uma árvore com **Classe - Grupo** no painel
esquerdo, ordenada por classe e grupo. Cada grupo exibe entre parênteses a
quantidade de produtos cadastrados, incluindo produtos inativos ou ocultos no
PDV. **Todos os produtos** restaura a listagem completa; clicar em um grupo
filtra a listagem do painel direito. A listagem mantém pesquisa, ordenação,
status, visibilidade, exclusão e edição. O botão de edição abre um modal local
com o formulário de manutenção e mantém o operador nessa mesma View.

As contagens e a listagem usam `GET /api/groups?includeInactive=1` e
`GET /api/products?includeInactive=1`, sem endpoint ou migração adicional.
Alterações nessa tela usam os endpoints existentes e não exigem reinício do
serviço `PDV-API`.

A tela **Configurações > Configurações Gerais** persiste regras operacionais na
tabela `general_settings`. O booleano `allowNegativeStock`, exibido como
**Permitir estoque negativo**, é criado somente quando o usuário salva a
configuração. A leitura e a alteração são feitas pela API em
`GET /api/general-settings` e `PUT /api/general-settings`.
Os rótulos dessas preferências usam capitalização de título, sem conversão
automática para maiúsculas.

O construtor exibe a árvore completa para facilitar a manutenção, mas não
permite criar novos menus principais, itens ou submenus. A manutenção fica
restrita à edição, ativação, atalhos e ordenação da estrutura existente. Ele
também não transforma automaticamente uma barra contextual em submenu visual
dentro do menu principal. Itens como **Produtos** e **Views** permanecem
entradas diretas do menu principal; seus filhos são telas relacionadas
renderizadas na barra contextual específica da tela.

Na barra contextual, filhos ativos com rota são tratados como telas de cadastro
relacionadas ao item pai, independentemente de serem registrados como `item`,
`submenu` ou `bar`. Assim, a ativação feita no construtor de menu é respeitada
sem exigir que cada tela cadastral seja criada com um tipo técnico específico.

Portanto, um novo cadastro relacionado a um grupo não deve criar um menu
principal independente nem uma tela intermediária do grupo. Ele deve ser
registrado como subitem do grupo, incluído na barra contextual correspondente,
receber uma rota de navegação e ter sua ordem persistida em
`navigation_items`.

As telas de **Operações Fiscais** e dos catálogos fiscais compartilham a barra
contextual do item **Cadastros > Operações Fiscais**, na ordem **Operações
Fiscais**, **CFOP**, **CST / CSOSN**, **Alíquotas ICMS**, **Regimes**, **Tipos**,
**Contextos**, **Origens**, **IPI**, **PIS / COFINS**, **Bases** e
**Desoneração**. A barra é renderizada por
`src/catalog/fiscal-navigation.js`.

No Construtor, o item de menu **Operações Fiscais** permanece um `item` de
ordem 6. A entrada **Operações Fiscais** da barra contextual é um registro
filho separado, do tipo `bar` e ordem 1; isso evita misturar a posição do menu
com a posição da barra contextual.

O item **Cadastros > Financeiros** abre a primeira tela do grupo, **Formas de
pagamento**, e renderiza a barra contextual financeira. A empresa não pertence
mais a essa barra: seu cadastro fica exclusivamente em **Configurações > Dados
da Empresa**. Assim como em
**Cadastros > Produtos**, o título **Financeiros** é o item de entrada e os
cadastros financeiros são links da barra contextual. A barra é renderizada por
`src/catalog/financial-navigation.js`; novos cadastros devem ser acrescentados
nela e na navegação persistida, sem criar um menu principal paralelo.

A tela **Configurações > Dados da Empresa** mantém um único registro em
`company_settings`, e reúne somente identificação, endereço, contatos, e-mail,
site, logotipo e ícone do aplicativo. A API sempre consulta e atualiza o único
registro disponível, sem depender de um valor específico de ID.
CNPJ ou CPF,
inscrição estadual, CNAE, CEP e telefones usam máscaras brasileiras; o CEP pode
consultar a base ViaCEP e preencher logradouro, bairro, cidade e UF. O campo de
logotipo aceita PNG, JPEG, WebP ou GIF de até 2 MB. O ícone do aplicativo aceita
os mesmos formatos até 512 KB e é carregado em tempo de execução. Ambos são
armazenados no servidor e retornados junto ao cadastro; o logotipo é destinado
a relatórios e cupons, enquanto o ícone atualiza o favicon e a identidade
visual das telas.

Os campos textuais desse cadastro usam capitalização de título. A API aplica
também `trim` e validação de tamanho/obrigatoriedade; documentos, UF, códigos,
telefones, credenciais e parâmetros fiscais mantêm suas validações próprias.

A tela **Configurações > NFC-e** administra os parâmetros da NFC-e modelo 65
para Minas Gerais: UF de emissão `MG`, ambiente de homologação ou produção,
série, próximo número, contingência, CSC e ID Token por ambiente, tipo/local e
validade do certificado ICP-Brasil e número de série do certificado. A tabela
da tela resume os ambientes de produção e homologação sem exibir os segredos
completos. O CSC e o ID Token devem ser obtidos no credenciamento da empresa
na SEF/MG; homologação é para testes e produção possui validade fiscal.

Ela utiliza o mesmo registro singleton `company_settings`, mas mantém esses
campos separados visualmente dos dados cadastrais. A tela cadastral usa
`GET /api/company` e `PUT /api/company`, enquanto a tela fiscal usa
`GET /api/company/nfce` e `PUT /api/company/nfce`. O endpoint fiscal atualiza
somente as colunas NFC-e, sem tocar nos dados cadastrais, logotipo ou outros
campos da empresa. O
cadastro da empresa mantém cidade e código IBGE do município separadamente;
para Patos de Minas, o código é `3148004`, usado no XML como `cMunFG` e
`enderEmit/cMun`. O
certificado não é enviado como arquivo nesta etapa e sua senha não é
persistida pelo cadastro. A autorização ainda depende do credenciamento e da
integração fiscal com os webservices da SEF/MG.

Os campos CSC, ID Token e senha do certificado são mascarados e possuem
controle de visualização temporária. O certificado A1 pode ser selecionado em
arquivo `.pfx` ou `.p12`; o conteúdo e a senha são criptografados com
`PDV_CERTIFICATE_ENCRYPTION_KEY` antes de serem armazenados. Ao enviar um novo
certificado A1, a API lê automaticamente a validade e o número de série do
PKCS#12; a API também tenta preencher esses metadados para certificados
antigos que estejam armazenados sem esses campos.

A tela consulta as formas ativas pela rota `GET /api/payment-methods`,
compartilhada com o fluxo de pagamento da venda. A hierarquia também é
registrada em `navigation_menus` e `navigation_items`, usando
`typeNavigationItem = 'item'` para **Financeiros** e
`typeNavigationItem = 'bar'` para **Formas de pagamento** e futuras tabelas.

O botão **Testar emissão em homologação** executa somente quando o ambiente
NFC-e está em homologação. A API descriptografa o certificado A1 no servidor,
seleciona o primeiro produto ativo com NCM válido, gera e assina uma NFC-e de
teste, envia o XML à SEF/MG e exibe o código de retorno, mensagem, protocolo e
chave. O certificado, a senha e o XML assinado não são devolvidos ao terminal.
O teste não é permitido no ambiente de produção.

O botão **Gerar XML para diagnóstico** usa os mesmos dados e validações, mas
somente gera e assina o XML no servidor; ele não faz chamada à SEF/MG nem
persiste o documento. O XML é exibido apenas para conferência local de
estrutura, assinatura, data/hora, município e QR Code. A emissão continua
dependendo do botão de teste em homologação.

A emissão integrada da Frente de Caixa é opcional por venda. Quando o payload
de `POST /api/sales` contém `emitNfce: true`, a API reserva número e cria um
documento `pending` na mesma transação da venda; após o commit, autoriza na
SEF/MG e persiste `authorized`, `rejected` ou `unknown`, além de XML, chave,
protocolo, cStat e mensagem quando disponíveis. Sem solicitação, a venda fica
`completed` com `fiscalStatus: "not_requested"` e não consome numeração. A
integração continua restrita à homologação nesta etapa.

### Auditoria dos campos NFC-e — 2026-11-02

A revisão do formulário, da API, do schema e do serviço de teste classificou os
campos NFC-e da seguinte forma:

| Campo | Situação atual | Classificação |
| --- | --- | --- |
| `nfceCertificateDataCompany` e `nfceCertificatePasswordCompany` | Usados para extrair a chave privada, o certificado público, assinar o XML e autorizar o teste. | Necessários para o fluxo A1 atual. |
| `nfceCscCompany`, `nfceTokenCompany`, `nfceHomologationCscCompany` e `nfceHomologationTokenCompany` | Usados na composição do QR Code e no credenciamento por ambiente. | Necessários para emissão por ambiente. |
| `nfceCertificateExpiresCompany` | Extraído do PKCS#12 e exibido como metadado; não bloqueia emissão nem é usado na assinatura. | Não é requisito técnico da emissão, mas é útil para diagnóstico e manutenção. Deve ser mantido até existir uma rotina de verificação/alerta de expiração. |
| `nfceCertificateSerialCompany` | Extraído e exibido como identificação do certificado; não participa da emissão. | Metadado útil, não requisito técnico. |
| `nfceCertificateNameCompany` | Exibe no formulário o nome do arquivo A1 armazenado. | Apenas UX; pode ser mantido ou substituído por um indicador genérico. |
| `nfceCertificatePathCompany` | Não há campo ativo no formulário, o servidor não acessa esse caminho e o fluxo atual armazena apenas valor vazio. | Removido do código e do schema; instalações antigas precisam executar a migração de remoção. |
| `nfceCertificateTypeCompany` | O produto utiliza somente A1 em arquivo PKCS#12; a tela e a API aceitam exclusivamente A1. | Necessário para o fluxo atual; A3 não faz parte do produto. |
| `nfceStateCompany` e `nfceModelCompany` | A API aceita somente MG/modelo 65 e o XML atual usa esses valores fixos. | Redundantes na implementação atual, mas podem representar uma futura expansão; não remover sem decidir o escopo fiscal. |
| `nfceSeriesCompany` | É usada na chave de acesso e no XML. | Necessária. |
| `nfceInitialNumberCompany` | É persistida, mas o teste gera número temporário e a venda atual não emite NFC-e. | Sem efeito operacional no fluxo atual; deve ser revisada junto com a futura numeração transacional. |
| `nfceContingencyCompany` | É persistida e exibida, mas o serviço atual não implementa emissão offline. | Preparatória; não deve ser tratada como recurso funcional até existir emissão e reconciliação offline. |

A validade do certificado, portanto, não é necessária para assinar ou enviar uma
NFC-e no fluxo atual; ela é um metadado derivado do arquivo A1. Removê-la agora
reduziria a visibilidade operacional e exigiria recalcular a validade em cada
consulta. A recomendação é mantê-la, adicionar futuramente alerta/bloqueio de
certificado expirado e só então avaliar sua necessidade como dado persistido.

`nfceCertificatePathCompany` foi removido do código e do schema inicial. Para
instalações existentes, após confirmar backup SQL ou outro procedimento de
recuperação, execute:

```powershell
npm.cmd run migrate:remove-nfce-certificate-path
```

A migração é idempotente e remove somente a coluna legada. A API deve ser
reiniciada após a migração para garantir que nenhum processo antigo mantenha o
contrato anterior. O produto utiliza somente certificado A1 em arquivo PKCS#12;
A3 não é uma opção funcional nem é aceito pela API.

### Auditoria de numeração e contingência NFC-e — 2026-11-02

A configuração persiste `nfceInitialNumberCompany`,
`nfceNextNumberCompany` e `nfceContingencyCompany`. A integração de venda usa
`nfceNextNumberCompany` com bloqueio da linha de configuração para reservar a
sequência sem manter a transação aberta durante a rede. Documentos são
armazenados em `sale_fiscal_documents`; ainda não existem envio posterior,
cancelamento/inutilização fiscal ou reconciliação de contingência offline.

Conclusão: o número inicial e a contingência são preparatórios e não devem
ser apresentados como emissão fiscal funcional. Uma implementação futura deve
reservar a numeração dentro da mesma transação da emissão, registrar chave e
protocolo, e modelar o ciclo offline/online antes de habilitar o modo
`offline`. Essa alteração exige decisão de escopo fiscal, migração revisada e
testes de concorrência e recuperação.

### FK de estado físico dos produtos — 2026-11-02

`products.idPhysicalStateProduct` passou a usar `NULL` para representar
produto sem estado físico. O schema inicial agora declara a FK
`fkProductsPhysicalState` para `physical_states(idPhysicalState)`, e o
servidor/frontend foram ajustados para não enviar nem interpretar o sentinela
`0`. Para instalações existentes, a migração idempotente
`npm.cmd run migrate:products-physical-state-fk` converte `0` e referências
inválidas para `NULL`, torna a coluna anulável e adiciona a FK.

O checkout não conseguiu executar essa migração porque o usuário
`pdv_app` não possui senha disponível no `.env` (`using password: NO`).
Em 2026-11-02, a migração foi executada com sucesso no DBeaver por uma conta
autorizada, após a normalização dos dados. A coluna foi tornada anulável e a
FK `fkProductsPhysicalState` foi criada. A execução abaixo permanece como
referência operacional para novas instalações:

```sql
UPDATE products p
LEFT JOIN physical_states s
  ON s.idPhysicalState = NULLIF(p.idPhysicalStateProduct, 0)
SET p.idPhysicalStateProduct = NULL
WHERE p.idPhysicalStateProduct = 0
   OR (p.idPhysicalStateProduct IS NOT NULL AND s.idPhysicalState IS NULL);

ALTER TABLE products
  MODIFY COLUMN idPhysicalStateProduct INT NULL DEFAULT NULL,
  ADD CONSTRAINT fkProductsPhysicalState
    FOREIGN KEY (idPhysicalStateProduct)
    REFERENCES physical_states (idPhysicalState)
    ON DELETE RESTRICT;
```

O cadastro de **Formas de pagamento** segue o padrão dos demais cadastros:
possui formulário de inclusão, edição por ícone de lápis e exclusão por ícone
de lixeira. Cada registro mantém o nome, a conta do Fluxo de Caixa
(**Banco** ou **Caixa**), os dias/prazo, a taxa de desconto e o acréscimo.
Desconto e acréscimo possuem valor e unidade independente, podendo ser
percentual ou valor fixo em reais. A API valida esses campos no servidor e a
tabela `payment_methods` recebe as colunas correspondentes por meio da
migração compatível executada por `ensurePaymentMethodSchema`.

### Contratos de configuração

`GET /api/company` e `PUT /api/company` trabalham no único registro disponível
em `company_settings`, sem depender de um ID fixo. O cadastro valida tipo de
pessoa, documento, razão/nome, país, município, código IBGE e e-mail. O
logotipo aceita imagem de até 2 MB e é mantido no servidor.

`GET /api/company/nfce` e `PUT /api/company/nfce` trabalham somente nas
colunas fiscais. O modelo é fixo em 65 e a implementação atual atende MG.
Ambiente, série, número inicial, contingência, CSC, tokens e metadados do
certificado são validados no servidor. O arquivo A1 e a senha são recebidos
em base64/texto controlado, criptografados com
`PDV_CERTIFICATE_ENCRYPTION_KEY` e nunca retornados ao terminal. Sem essa
chave no ambiente do servidor, não se deve habilitar o fluxo de teste fiscal.

`GET /api/printer-settings` e `PUT /api/printer-settings` trabalham no registro
singleton de `printer_settings`. O contrato persiste
`receiptPrinterName`, `reportsPrinterName` e `receiptLayout`; o layout aceita
no máximo 80 linhas dos tipos campo, texto e divisor. A tela de montagem usa
`receiptPrinterName` sem permitir uma segunda escolha local de impressora.

Nos catálogos CFOP, CST/CSOSN, alíquotas, regimes, tipos, contextos, origens,
IPI, PIS/COFINS, bases e desoneração, o servidor aplica as regras específicas
de código: CFOP usa o formato `0.000`, CST/CSOSN exibe o código informado,
catálogos sem código visível recebem identificador gerado, e tipos de operação
usam slug derivado da descrição sem exibi-lo na tela.
Descrições que já vieram com o código no início são normalizadas para não
repeti-lo na tela. Na tela de Operações Fiscais, CST/CSOSN, origem, IPI,
desoneração e PIS/COFINS exibem as opções como `código - descrição`; o CFOP
exibe somente o código no dropdown e preenche a Natureza da Operação em modo somente leitura.
Código de benefício fiscal e base legal não fazem parte do formulário.
O grupo **Gerar Fundo de Combate à Pobreza** permite marcar FCP, FCP ST,
Utilizar Redução BC e Utilizar Redução BC ST; essas quatro opções são
persistidas na operação fiscal.
A tabela de operações não exibe a coluna Contexto. O catálogo CFOP inicial
inclui 5.102, 5.405, 6.102 e 6.403 com suas descrições oficiais.

### Cadastro NCM / CEST

O item **NCM / CEST** pertence à barra contextual de **Cadastros > Produtos**.
NCM e CEST são mantidos em tabelas próprias, relacionadas por
`ncm_cest_relations`, pois um NCM pode ter vários CESTs e um CEST pode abranger
vários NCMs. O cadastro exige os códigos sem pontuação (NCM com 8 dígitos e
CEST com 7 dígitos), mantém as descrições e o segmento do CEST e não infere
automaticamente uma relação apenas pelo código NCM.
No cadastro de produtos, o NCM é selecionado entre os códigos cadastrados e o
select de CEST é carregado somente com as relações possíveis para o NCM
escolhido; quando não há relação, o campo fica desabilitado e sem opções.
O servidor valida novamente essa relação antes de persistir o produto.

Na tela de cadastro **NCM / CEST**, os catálogos são exibidos em duas visões:
**NCM** e **CEST**. Os cartões de resumo mostram as quantidades carregadas, a
pesquisa filtra código, descrição e segmento, e a tabela possui paginação para
evitar renderizar milhares de registros de uma vez. As relações continuam
disponíveis pela API para o cadastro de produtos, mas não são uma aba de
manutenção nessa tela.

#### Atualização oficial dos catálogos

Em **Ferramentas > Atualizar NCM / CEST**, o backend executa uma carga
transacional dos catálogos oficiais. A NCM é obtida do JSON vigente do
Classif/Siscomex (Receita Federal). A fonte CEST é a legislação publicada pelo
CONFAZ e deve fornecer JSON, CSV, TSV ou tabela HTML com CEST, descrição,
segmento e, quando disponível, NCM para formar as relações.

As URLs podem ser configuradas no ambiente do servidor ou em
`general_settings` por `PDV_NCM_SOURCE_URL` e `PDV_CEST_SOURCE_URL`. Por
segurança, somente HTTPS nos hosts oficiais
`portalunico.siscomex.gov.br` e `www.confaz.fazenda.gov.br` é aceito; a API
também rejeita redirecionamentos para impedir que uma configuração de catálogo
seja usada para acessar destinos internos. A execução registra origem, status,
data, quantidade de NCMs, CESTs e relações em `ncm_cest_updates`.
Registros que não estão na edição vigente ficam inativos; relações anteriores
são substituídas somente depois que as duas fontes forem baixadas e
interpretadas com sucesso.

O banco atualmente contém uma carga inicial controlada de 10.507 NCMs, 947
CESTs e 620 relações. Essa carga foi feita a partir de um snapshot público da
NCM com vigência informada em 02/12/2025 e de um arquivo público derivado da
relação do Convênio ICMS 142/18; ela não deve ser apresentada como a edição
oficial vigente em 26/10/2026. A origem e o caráter derivado estão registrados
no histórico da execução. A próxima atualização deve ser feita pelas URLs
oficiais configuradas quando elas estiverem acessíveis.

NCM e CEST são catálogos nacionais e não substituem regras específicas de
ICMS de Minas Gerais. Essas regras devem ser mantidas nas operações fiscais
da empresa e em futuras configurações estaduais.

### Status da API

Em **Ferramentas > Status da API**, o terminal consulta `GET /api/health` para
exibir a disponibilidade da API, a conexão com o MariaDB, o início do processo,
o tempo de atividade e o endereço consultado. A tela informa que a recuperação
automática é responsabilidade do serviço Windows `PDV-API`. O terminal não
reinicia processos nem chama comandos administrativos; a manutenção manual
usa os scripts documentados em `docs/DEPLOYMENT.md`.

### Bancada de impressão térmica

A Retaguarda possui o menu **Ferramentas > Impressão térmica**. A tela funciona
como editor do cupom de venda: a biblioteca lateral inclui campos dinâmicos da
empresa, venda, itens, pagamentos e NFC-e; a lista central permite inserir,
remover e mover linhas; e o painel de formatação configura alinhamento,
tamanho, negrito, texto livre e divisores contínuos ou tracejados. Para cada
linha de texto, estão disponíveis as fontes `Courier New`, `Arial`, `Consolas`,
`Segoe UI`, `Tahoma` e `Verdana`, além de tamanhos entre 9 px e 28 px. O
preview usa papel de 80 mm e aproximadamente 48 colunas para manter a montagem
próxima do resultado térmico.

A montagem é salva pela API em `/api/printer-settings`, na coluna JSON
`receiptLayoutPrinterSetting`. O layout é uma lista ordenada de linhas e não
contém dados de uma venda específica: os campos são resolvidos somente no
momento da impressão. O botão de impressão usa o diálogo do sistema com
`@page size: 80mm`.

A impressão direta usa a camada Tauri e a impressora definida em
**Retaguarda > Configurações > Impressoras > Impressora padrão de Cupom**; não
há seleção de endereço de rede ou de formato de bytes na montagem. Se nenhuma
impressora de Cupom estiver configurada, a impressão direta é bloqueada antes
do envio.

No USB, família, tamanho em px, alinhamento e negrito são enviados por linha
ao renderizador GDI e aplicados pelo driver selecionado. A integração não deve
ser usada para confirmar vendas: a impressão deve ocorrer somente depois que a
API confirmar a venda e uma falha de impressão deve ser tratada como falha
operacional, sem repetir a venda. A impressora de Cupom usada pela bancada é
carregada e salva pela API em `/api/printer-settings`, junto com a impressora
padrão de Relatórios.

O `GET /api/printer-settings` retorna `receiptPrinterName`, `reportsPrinterName`
e `receiptLayout`. O `PUT /api/printer-settings` aceita os nomes das
impressoras e, opcionalmente, uma lista `receiptLayout` com no máximo 80 linhas.
Cada linha pode ser um campo, texto livre ou divisor. Linhas de texto persistem
`fontFamily`, `fontSize`, `align` e `bold`; a configuração é um modelo e não
contém dados de uma venda real.

O comando Tauri `print_receipt` renderiza linhas estruturadas com GDI e o
driver Windows. Alterações nesse contrato devem atualizar simultaneamente a
tela de montagem, o comando Tauri e o renderizador Rust.

### Navegação e Retaguarda

O construtor em **Retaguarda > Configurações > Impressoras > Construtor de
menu** administra menus e itens persistidos. Para conectar uma nova tela:

1. registre o handler em `src/main.js`;
2. associe a chave técnica ou a rota ao item de navegação;
3. marque o item como atalho somente quando houver handler resolvido;
4. use `descriptionNavigationItem` para substituir o texto do cartão;
5. mantenha `tools` e `settings` protegidos contra desativação.

Menus, itens e atalhos só são publicados depois de cadastrados pela loja.
Registros inativos permanecem no banco para manutenção e não aparecem na
navegação publicada.

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
entidade, começando pelo `database/schema.sql`, depois consultas SQL, serviço, rotas,
frontend e testes. Não aplicar substituições globais sem validar o contexto da
tabela.

### Schema diferente do banco em execução

O `database/schema.sql` já estava no padrão final, mas o MariaDB ainda tinha nomes do
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

### Impressoras padrão

As impressoras padrão de **Cupom** e **Relatórios** são configuradas em
**Retaguarda > Configurações**. A lista é obtida do spooler de impressoras do
Windows, mas a escolha é persistida no MariaDB pela API em
`/api/printer-settings`. A bancada de impressão térmica usa a impressora
definida para Cupom.
