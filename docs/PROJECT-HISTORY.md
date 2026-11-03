# Histórico do projeto

Este documento registra a evolução funcional e técnica do PDV desde a decisão
inicial do produto até o estado atual do workspace. Ele complementa o
`README.md`, que continua sendo a visão geral, e o
[`DEVELOPMENT.md`](DEVELOPMENT.md), que contém as convenções operacionais.

## 0. Estado mais recente

### Consolidação funcional e versionamento — 2026-11-03

As alterações acumuladas em 2 e 3 de novembro consolidam uma nova capacidade
compatível e justificam a versão **0.9.0**: autenticação e sessão de operadores,
abertura e fechamento de caixa, cancelamento auditado, integração NFC-e em
homologação, cadastro/importação de produtos e destino de impressão, além das
regras de baixa e disponibilidade de estoque.

Na regra de estoque, `controlsStockProduct` é lido antes da validação e da
baixa. A configuração `allowNegativeStock` também é aplicada à consulta
padrão de produtos usada pela Frente de Caixa: quando ativa, produtos
controlados com estoque zero ou negativo permanecem visíveis; quando inativa,
eles só aparecem com estoque positivo. Produtos sem controle de estoque
continuam disponíveis. Consultas administrativas com `includeInactive=1`
preservam o catálogo completo.

O campo de destino de impressão foi consolidado como `printsPlace`, com
migração idempotente do campo booleano legado, valores fechados e padrão
`NÃO IMPRIMIR`. A importação CSV aceita também Status, com referências
operacionais geradas pela interface. A validação final desta etapa alcançou
90 testes aprovados, verificação de sintaxe JavaScript e `git diff --check`.
Não foi executado build, publicação ou reinício do serviço; alterações em
`src/server/` exigem publicar a API e reiniciar `PDV-API`, enquanto alterações
somente de frontend exigem novo bundle nos terminais.

As verificações idempotentes de banco foram extraídas de `server.js` para o
módulo profundo `src/server/schema-manager.js`, cuja interface recebe apenas
`pool` e `config` e devolve as operações de preparação usadas pelas rotas e
pelo startup. A preparação NCM/CEST foi concentrada em
`src/server/ncm-cest-update.js`; a inicialização e a atualização dos catálogos
agora reutilizam a mesma definição das quatro tabelas, eliminando a duplicação
de DDL entre o roteador e o atualizador fiscal.

Na continuidade da auditoria, os scripts de serviço Windows foram revisados
antes de qualquer execução operacional. `publish-windows-api-service.ps1` e
`configure-windows-service-account.ps1` não criam mais arquivo SQL temporário:
o SQL com a senha gerada é enviado por pipe ao cliente `mysql`. A criação ou
atualização da conta `PDVApiSvc` usa explicitamente o objeto
`SecureString` correspondente. Os scripts foram analisados pelo parser do
PowerShell, mas a publicação real e a alteração do serviço permaneceram
bloqueadas por falta de autorização explícita.

Esta etapa foi validada com 58 testes, `node --check` nos módulos JavaScript,
análise sintática dos scripts PowerShell e `git diff --check`. Não houve build
completo, deploy, publicação ou reinício da API; alterações somente em scripts
e documentação não exigem reinício.

Na auditoria de desempenho, a busca da Frente de Caixa deixou de reconstruir
o DOM completo a cada tecla. Somente o grid de produtos é atualizado, sem
alterar o contrato da API, o carrinho ou o modal de pagamento. A paginação do
catálogo permanece pendente de medição e decisão de contrato.

A tela de cadastro de produtos também deixou de baixar o catálogo completo de
NCMs durante a abertura. A lista fiscal agora é carregada ao abrir o modal de
consulta, sem cache persistente e sem alteração do contrato da API.

Na auditoria de interface e acessibilidade, o Lighthouse identificou
contraste insuficiente em textos secundários da Frente de Caixa, incluindo
textos auxiliares do carrinho. As cores foram ajustadas e os campos de pesquisa
receberam `name` explícito, sem alteração do fluxo de venda ou do contrato da
API.

A medição de volume dos catálogos encontrou 75 produtos, 19 grupos, 10.508
NCMs e 947 CESTs. Produtos e grupos permanecem pequenos o suficiente para
filtragem local; NCM/CEST deve ser considerado para consulta server-side em
etapa futura, pois a tela fiscal dedicada ainda carrega os catálogos completos.

Essa etapa implementou a consulta server-side de NCM/CEST na tela dedicada,
com `page`, `pageSize`, `search`, `total`, `pageCount` e preservação do formato
completo legado sem parâmetros. O formulário de produtos continua usando a
lista completa somente quando abre sua consulta sob demanda.

O reinício posterior da API publicada confirmou `/api/health` HTTP 200 e banco
conectado, mas as rotas paginadas retornaram 404 porque a aplicação em
`C:\ProgramData\PDV\app` ainda é a versão anterior. A publicação da alteração
permanece pendente de autorização explícita.

Após novo bundle, instalação e reinício informados pelo operador, a inspeção
confirmou que o arquivo publicado `src/server/server.js` ainda não contém
`parseCatalogPagination`. O serviço está saudável, porém o conteúdo instalado
continua anterior ao checkout.

O serviço Windows da API foi separado do checkout de desenvolvimento. A
instalação publicada mantém a aplicação em `C:\ProgramData\PDV\app`, o wrapper
WinSW em `C:\ProgramData\PDV\service` e os logs em
`C:\ProgramData\PDV\logs`. O serviço `PDV-API` executa com a conta local
dedicada `.\PDVApiSvc`, que recebe somente as permissões necessárias para ler a
aplicação e gravar logs. A senha do usuário `pdv_app` fica no Credential Manager
do perfil da conta de serviço; o `.env` não deve conter essa senha após o
provisionamento. O procedimento recomendado e a diferença em relação ao
instalador legado `LocalService` estão em [`DEPLOYMENT.md`](DEPLOYMENT.md).

O feedback de sucesso das telas administrativas é exibido em um overlay modal
temporário, centralizado e fora do fluxo de layout. O helper compartilhado
mantém o status acessível, remove o overlay após aproximadamente 2,5 segundos
e evita que a mensagem altere a rolagem ou o foco do operador.

O Construtor de navegação preserva a posição da viewport ao salvar alterações.
O mesmo helper é usado no fluxo de inclusão e exclusão de divisores, depois da
atualização da navegação persistida, evitando o retorno automático ao topo da
listagem.

Foi consolidada a diretriz global de navegação: o projeto não possui submenu
visual. Itens relacionados continuam podendo ser agrupados tecnicamente para
roteamento e ordenação, mas a interface deve apresentar essas telas apenas na
barra contextual correspondente, sem dropdown ou submenu aninhado no menu
principal.

As Views de produtos foram consolidadas sob o item direto **Ferramentas > Views**,
sem submenu visual no menu principal, seguindo o padrão de Produtos.
**Grupos x Produtos** usa a árvore ordenada por classe e grupo, enquanto
**Sem Custo** mostra somente produtos com custo zero. Ambas reutilizam
`src/tools/product-list-view.js`, com pesquisa, ordenação, status, visibilidade,
exclusão e edição. A edição agora permanece na própria View por meio de modal,
permitindo várias alterações sem retornar à tela de Produtos. A versão da
implementação foi incrementada para `0.7.0` por ser uma nova capacidade
compatível; correções posteriores de navegação levaram o cliente a `0.7.2`.

As correções mais recentes consolidaram o fluxo operacional do PDV Zanzibar.
O menu **Sair**, o botão de fechamento da janela e os eventos de encerramento
passaram a usar o fluxo nativo do Tauri, com permissões explícitas e
confirmação de backup quando aplicável. A navegação persistida agora é
deduplicada por identidade, menu e item pai, preserva itens personalizados e
mantém **Sair** como a última opção ativa.

Os formulários administrativos passaram a preservar rascunhos durante
carregamentos assíncronos sem restaurar um snapshot vazio sobre dados recebidos
da API. Após salvar ou cancelar, o formulário é limpo de forma explícita, e o
feedback temporário é removido sem reconstruir a árvore HTML nem perder o foco
do operador.

Clientes e Consumidores foram separados conceitualmente. Clientes mantêm o
histórico financeiro de Vale e criam o Consumidor vinculado na mesma transação;
Consumidores avulsos continuam disponíveis para operação. CPF/CNPJ e telefone
recebem máscara nas listagens, as colunas removidas não voltam a ser exibidas,
os switches de status permanecem visíveis e um Consumidor vinculado não pode
alterar o próprio status diretamente. Alterações independentes de nome,
apelido, telefone e observações não são sobrescritas pelo cadastro do Cliente.
O campo legado `paymentTermCustomer` não faz parte do schema inicial, e sua
migração compatível ocorre somente na inicialização da API.

O cadastro de **Dados da Empresa** seleciona deterministicamente o único
registro lógico sem depender do identificador `1`. A API cria a linha somente
quando a tabela está vazia, e a tela preserva apenas edições reais do operador,
incluindo logo e ícone, durante o carregamento. O painel introdutório de
Operações Fiscais foi removido para deixar o formulário da empresa diretamente
acessível.

O versionamento automático continua ligado ao hook `prebuild` e ao fluxo
`prerelease:client`: `npm.cmd run build` e `npm.cmd run release:client`
classificam e incrementam a versão quando há alteração pendente. Incrementos
manuais continuam disponíveis com `version:patch`, `version:minor` ou
`version:major`. Os instaladores finais
usam os nomes fixos `pdv-zanzibar.msi`, `pdv-zanzibar.exe` e
`pdv-zanzibar-metadata.json`, sem versão no nome do arquivo. O script de
release seleciona somente os artefatos da versão corrente e só regenera ícones
quando `--refresh-icons` é solicitado.

As vendas protegem a idempotência comparando itens, desconto e pagamentos
quando um `clientIdSale` já existe. Pagamentos mistos com Vale consomem somente
o valor associado à forma Vale. A impressão direta usa o driver Windows/GDI,
e o token da API persistido no terminal é protegido pelo DPAPI do Windows. A
Frente de Caixa não apresenta caixa ou operador como ativos antes da
implementação desses controles.

O Status da API exibe separadamente a versão do aplicativo, a versão da API e
o fingerprint do frontend. A API deriva sua versão do `package.json`, enquanto
o identificador do frontend contém somente o fingerprint. Assim, versões
diferentes entre terminal e servidor ficam explícitas quando os componentes
são publicados separadamente.

O cadastro de Fornecedores foi consolidado como tela própria de **Cadastros**,
com persistência na API, pesquisa, visualização lateral, edição em modal,
ativação/inativação e exclusão. O formulário usa select de UF, remove o campo
País da interface e mantém `BRASIL` como padrão no servidor. CNPJ/CPF, telefone
e CEP recebem máscaras na interface, enquanto o e-mail é normalizado sem
espaços e em minúsculas. Os campos textuais humanos são persistidos em
maiúsculas, preservando a acentuação.

Os campos textuais de **Configurações > Dados da Empresa** passaram a
preservar a capitalização informada pelo operador. A conversão automática para
maiúsculas continua aplicada somente aos cadastros e códigos que mantêm essa
regra de domínio; documentos, UF, códigos fiscais e credenciais seguem suas
validações específicas.

As consultas auxiliares de CNPJ (BrasilAPI) e CEP (ViaCEP) funcionam tanto no
novo cadastro quanto na edição. Os dados retornados são apresentados com
maiúsculas, preservando a acentuação, e o salvamento normaliza os campos textuais
de cadastro para maiúsculas. O construtor de menus é uma exceção e preserva sua
formatação própria. A tabela `suppliers` é preparada de forma
idempotente pela API, sem expor credenciais do MariaDB aos terminais.

Também foram implementados os cadastros separados de **Clientes** e
**Consumidores**. O nome é o único campo obrigatório; a criação de um Cliente
cria seu Consumidor correspondente dentro da mesma transação, enquanto
Consumidores avulsos continuam disponíveis para mesas e comandas. A forma de
pagamento **Vale** exige um cliente ativo, valida o limite disponível e grava o
débito atomicamente com a venda em `customer_vouchers`.

Foi criado o comando `npm.cmd run release:client -- --api-url=...` para gerar
distribuições do projeto **PDV Zanzibar**. O build usa diretamente os ícones
atuais de `src-tauri/icons`, sem depender do cadastro de ícone na API, embute
o endereço da API no frontend e produz MSI e NSIS com a identidade visual
versionada no projeto.

A política de maiúsculas foi aplicada aos registros existentes do MariaDB por
meio do comando `npm.cmd run migrate:uppercase`. A migração normaliza textos
humanos de cadastros, preserva acentuação, ignora o construtor de menus e não
altera códigos, e-mails, URLs ou identificadores técnicos. O processo verifica
colisões em campos únicos antes da escrita, executa em transação e pode ser
repetido com segurança; a execução inicial normalizou 11.871 valores em 38
colunas.

As telas administrativas também passaram a usar painéis introdutórios
padronizados, com espaçamento entre a introdução e o conteúdo seguinte. O
painel de Atualizar NCM / CEST ocupa toda a largura da tela e o cadastro de
Dados da Empresa passou a exibir a mesma introdução das demais telas. Foram
registrados aliases diretos para Operações Fiscais e Consulta de NFC-e no
roteamento principal, permitindo que os itens persistidos nesses menus abram
as telas tanto em desenvolvimento quanto no build.

Foi padronizada a preservação de rascunhos dos formulários durante
renderizações assíncronas. O helper `src/ui/form-draft.js` captura e restaura
valores de inputs, selects, textareas, checkboxes e radios quando a árvore do
formulário é reconstruída. A diretriz também exige que as ações explícitas de
Limpar, Cancelar e salvamento mantenham seus significados, sem preservar
indevidamente um rascunho de inclusão em modo de visualização ou edição modal.
Novos formulários devem seguir o checklist de
[`DEVELOPMENT.md`](DEVELOPMENT.md), cobrindo o ciclo
`submit() -> load() -> renderPreservingFormDraft()` e testando que a limpeza
após inclusão, edição ou cancelamento não recapture valores antigos.
O desaparecimento automático do feedback também foi padronizado em todas as
telas: `clearRenderedFeedback(root)` remove somente o aviso e não reconstrói o
formulário, preservando o foco do próximo campo digitado.

## 1. Direção inicial

O projeto começou com o objetivo de criar um PDV comercial semelhante ao
sistema utilizado pelo usuário, com frente de caixa, retaguarda, estoque,
pagamentos, banco centralizado e impressão térmica de 80 mm.

Arquivos Markdown de um projeto de análise financeira foram avaliados como
referência. Foram aproveitadas somente práticas pertinentes, como separação de
camadas, validação ponta a ponta, testes, migrações não destrutivas e proteção
de credenciais. Funcionalidades específicas daquele projeto, como análise
financeira, OAuth, Telegram, WhatsApp, cPanel e Passenger, não foram
incorporadas.

## 2. Arquitetura consolidada

A arquitetura escolhida foi:

```text
Terminais Tauri → API Node.js na rede local → MariaDB no servidor
```

O computador servidor hospeda a API e o MariaDB. Os terminais acessam somente
a API e nunca recebem credenciais nem executam SQL diretamente. O fluxo
obrigatório para escritas é:

```text
interface → API → validação → transação MariaDB → nova leitura → interface
```

Operações compostas, especialmente vendas, devem ser atômicas. A confirmação
da venda ocorre somente depois da persistência de itens, pagamentos e baixa de
estoque. A impressão é posterior e independente da confirmação financeira.

## 3. Fundação técnica

Foram estabelecidos:

- frontend em Vite e JavaScript com módulos ES;
- API Node.js em `src/server/`;
- regras compartilhadas em `src/shared/`;
- camada nativa Tauri 2 em `src-tauri/`;
- acesso ao MariaDB por `mysql2`;
- configuração por variáveis `PDV_*`;
- testes com `node:test`;
- build web com Vite;
- build desktop para Windows com Rust, Cargo, MSVC, Windows SDK e WebView2;
- documentação operacional em `docs/`;
- instruções, agentes e prompts específicos do PDV em `.github/`.

O Tauri foi configurado com o identificador `com.ianbarbosa2004.pdv`, e a
primeira compilação nativa foi concluída com sucesso. Os artefatos `dist/` e
`src-tauri/target/` permanecem fora do versionamento.

## 4. Frente de caixa e persistência

A primeira frente de caixa foi criada com catálogo, busca, filtros,
quantidades, carrinho, subtotal e total. A regra compartilhada de totais foi
extraída e coberta por testes.

Em seguida, a persistência foi transferida de uma ideia inicial de SQLite
local para o modelo centralizado com MariaDB e API Node.js. Foram criados:

- `database/schema.sql`;
- pool MariaDB com `utf8mb4`;
- `GET /api/health`;
- `GET /api/products`;
- `POST /api/sales`;
- tabelas de produtos, classes, grupos, vendas, itens, pagamentos e formas de
  pagamento;
- idempotência por `clientIdSale`;
- rollback transacional e validações de estoque e pagamentos.

O backend passou a preservar nome e preço do produto no item da venda, impedir
duplicidade pelo identificador do cliente e distinguir produtos que controlam
estoque daqueles que não controlam.

## 5. Retaguarda e cadastros

Foi criada uma tela de Retaguarda separada da Frente de caixa. Os cadastros
foram organizados em telas independentes para:

- Classes;
- Grupos;
- Produtos;
- Tipos de Produto;
- Unidades tributáveis;
- Operações Fiscais;
- Catálogos fiscais;
- NCM / CEST;
- Formas de pagamento;
- Dados da Empresa;
- NFC-e;
- Configurações Gerais;
- Impressoras;
- Ferramentas.

As listagens receberam pesquisa, ordenação, paginação onde necessária,
edição, exclusão, status independente por registro e visualização por seleção
de linha. O helper `src/ui/form-row-preview.js` padroniza o modo Visualização:
campos bloqueados, ações de gravação ocultas e retorno explícito para Novo
cadastro.

Classes e grupos não podem ser excluídos quando há produtos vinculados,
inclusive inativos. Produtos já inativos têm exclusão lógica idempotente.
Inativar uma classe, grupo ou produto não altera o status dos demais registros.

## 6. Produtos, estoque e configurações

O cadastro de produtos foi ampliado com:

- Código PDV;
- operação fiscal de venda;
- tipo de produto;
- unidade tributável;
- NCM e CEST relacionados;
- controle de estoque;
- produto fracionado;
- impressão de cozinha;
- exibição no PDV;
- status próprio.

Matérias-primas, embalagens e materiais de uso e consumo são variações do
cadastro de produtos disponíveis na barra contextual. **Outros Insumos** não
faz parte da navegação atual.

A tabela `general_settings` e a tela Configurações Gerais introduziram a
regra `allowNegativeStock`. Zero é sempre permitido; valores negativos só são
aceitos quando a configuração está ativa. O estoque inicial é inteiro,
enquanto a quantidade vendida pode ter até três casas decimais quando o
produto for fracionado.

As cargas padrão foram removidas por decisão do usuário. Uma instalação nova
cria a estrutura das tabelas, mas não insere automaticamente tipos, unidades,
catálogos fiscais, formas de pagamento, empresa, configurações, impressoras,
menus ou itens de navegação. Esses dados devem ser cadastrados explicitamente
pelas telas ou por ações operacionais documentadas.

## 7. Fiscal, NCM/CEST e NFC-e

O cadastro fiscal foi separado em operações e catálogos persistidos. Foram
incluídos CFOP, CST/CSOSN, ICMS, IPI, PIS/COFINS, FCP, regimes, contextos,
origens, bases e desoneração.

NCM e CEST possuem tabelas próprias, relações NCM/CEST e histórico de
atualizações. A tela oferece pesquisa, resumo e paginação. A atualização
controlada usa as fontes configuráveis por:

- `PDV_NCM_SOURCE_URL`;
- `PDV_CEST_SOURCE_URL`.

O cadastro de Dados da Empresa foi separado do cadastro de NFC-e. A
configuração fiscal atual suporta geração de XML assinado e teste de
autorização somente em homologação para NFC-e modelo 65 de Minas Gerais. O
certificado A1 e seus segredos permanecem no servidor, protegidos por
`PDV_CERTIFICATE_ENCRYPTION_KEY`, e não são devolvidos ao terminal.

O fluxo fiscal ainda não é um emissor de produção completo. Permanecem
pendentes, entre outros, persistência da autorização, cancelamento,
inutilização, contingência, reenvio e impressão fiscal pós-autorização.

## 8. Impressão térmica

Foi criada a bancada de impressão térmica para montar e persistir um modelo de
cupom de 80 mm. O layout suporta campos dinâmicos, textos livres, divisores,
ordenação, alinhamento, tamanho, negrito e fontes compatíveis.

O transporte direto usa o driver Windows/GDI da impressora de Cupom
configurada. A pré-visualização usa o diálogo de impressão do sistema.

A impressão ocorre localmente no terminal e somente depois da confirmação da
venda. Uma falha de impressão deve ser informada sem duplicar nem desfazer
automaticamente a venda.

## 9. Empresa, ícone e operação da API

Dados da Empresa passaram a aceitar logotipo e ícone configurável em runtime.
O ícone pode atualizar favicon, identidade visual e janela nativa Tauri; o
ícone embutido no executável continua dependendo de nova compilação.

Foi criada a tela Status da API, com:

- disponibilidade da API;
- conexão com o MariaDB;
- início do processo;
- uptime;
- endereço consultado;
- indicação da recuperação automática pelo serviço Windows.

O reinício interno foi removido quando a API passou a operar sob o serviço
Windows `PDV-API`. Depois de qualquer alteração em `src/server/`, o serviço deve
ser reinstalado ou reiniciado pelos procedimentos administrativos e validado
por `GET /api/health` antes do teste pela interface.

## 10. Navegação configurável

A navegação persistida foi organizada em:

```text
menu principal → item → submenu/barra contextual
```

`navigation_menus` e `navigation_items` armazenam menus, itens, submenus,
rotas, ordem, status, descrição e exibição como atalho na Retaguarda.

O Construtor de Menu permite:

- criar e editar menus e itens;
- alterar ordem;
- mover itens entre menus;
- definir item pai;
- ativar e desativar registros;
- definir atalhos da tela inicial;
- editar a descrição exibida abaixo do atalho;
- salvar a ordem explicitamente.

Ferramentas (`tools`) e Configurações (`settings`), incluindo seus itens e
submenus, são protegidos contra desativação tanto na interface quanto na API.
Registros desativados permanecem disponíveis no construtor para manutenção,
mas não são publicados no menu ativo.

Foi adicionada a tela **Ferramentas > Grupos x Produtos**, uma consulta de
produtos organizada por classe e grupo. A árvore lateral mostra a quantidade
de produtos cadastrados por grupo e a seleção filtra a listagem do lado
direito; a listagem mantém as ações de Produtos, incluindo edição, status,
visibilidade e exclusão.

O módulo `src/ui/navigation-routing.js` resolve handlers primeiro por
`keyNavigationItem` e depois por `routeNavigationItem`. Assim, novos registros
podem reutilizar telas existentes. Uma rota inédita ainda exige a criação e o
registro de um handler em `src/main.js`.

A tela inicial da Retaguarda monta atalhos a partir da navegação persistida.
Descrições vazias usam o fallback textual correspondente à chave técnica.
Itens marcados como atalho, mas sem handler resolvido, não são exibidos como
cartões executáveis.

Após o login, a seleção de ambiente passou a separar **Vendas**, **Caixa** e
**Retaguarda**. A tela inicial da Retaguarda usa somente os itens marcados como
atalho no Construtor e ordena os cartões pela mesma ordem persistida de menus e
itens. O cabeçalho consulta o operador autenticado e o estado real do caixa;
alertas não são simulados quando não existe fonte correspondente na API.

Na continuação desse fluxo, a seleção passou a usar cards de módulos com ícones
Lucide para Vendas, Caixa e Retaguarda. Os títulos das telas reutilizam o operador autenticado, e as barras
contextuais não exibem links de retorno.
Operações Fiscais mantém o item pai como primeiro item da barra contextual,
seguido pelos cadastros fiscais.

A seleção pós-login foi organizada em uma grade de módulos inspirada na
referência visual fornecida. A grade mantém somente os três ambientes
aprovados — Vendas, Caixa e Retaguarda — e deixa Trocar usuário como ação
auxiliar fora da grade.

Na auditoria da navegação persistida, **Operações Fiscais** foi separado em
duas entradas: o item principal do menu permanece `item` na ordem 6, enquanto
a entrada homônima da barra contextual é um filho `bar` na ordem 1. A
sincronização de defaults cria a entrada contextual ausente sem renumerar
itens existentes; a seleção da barra usa essa entrada sem duplicar o item
principal.

## 11. Refinamentos de interface

Durante a evolução da Retaguarda foram corrigidos:

- menus dropdown com largura baseada no conteúdo;
- quebra de linha em menus e barras contextuais;
- tabelas com cabeçalhos e bordas padronizados;
- paginação reutilizável;
- navegação por hover, clique e clique fora;
- formulários em popup;
- pesos tipográficos e campos desabilitados no modo Visualização;
- toggles de status e visibilidade;
- atualização otimista dos toggles sem substituir toda a árvore HTML;
- remoção do piscar da tela ao alternar status;
- ícones de editar e excluir;
- switch de atalho alinhado ao padrão visual do sistema.

## 12. Marcos registrados

Os checkpoints internos do desenvolvimento foram:

1. diretrizes do PDV;
2. migração do banco;
3. edições em popup;
4. Retaguarda e status;
5. nomenclatura dos campos;
6. formulário fiscal;
7. impressão direta;
8. impressão USB;
9. menu principal;
10. renumeração do catálogo fiscal;
11. NCM e CEST;
12. atualização NCM/CEST;
13. pesquisa NCM;
14. menu financeiro;
15. formas de pagamento;
16. configurações da empresa;
17. proteção NFC-e;
18. teste NFC-e;
19. município da NFC-e;
20. autorização NFC-e e cupons;
21. documentação do PDV e impressão;
22. cadastro ampliado de produtos;
23. navegação de Produtos;
24. layout e espaçamento;
25. arraste e persistência;
26. cadastros fiscais;
27. estoque e configurações;
28. telas por tipo;
29. classes e navegação;
30. ícone do aplicativo;
31. navegação e identidade visual;
32. remoção de cargas padrão;
33. toggles de visibilidade;
34. tabelas e menus;
35. eliminação do piscar dos toggles;
36. formulário de atalhos.

## 13. PR e estado documental

A PR [#4](https://github.com/ianbarbosa2004/pdv/pull/4) foi mesclada em
`main` em 27/10/2026. Desde essa consolidação, os commits funcionais
`9ba7df6`, `b398642` e `438c5b7`, seguidos pela integração `2a4a221`,
registraram a evolução abaixo, que também foi conferida contra o workspace
atual:

- **Arquitetura e persistência:** catálogos fiscais, configurações de empresa,
  NFC-e, impressão, navegação e regras gerais passaram a ter contratos
  persistidos no MariaDB e migrações idempotentes na API.
- **Cadastros e estoque:** foram adicionados tipos de produto, unidades,
  Código PDV, operação fiscal de saída, NCM/CEST relacionado, flags de estoque,
  fração, cozinha e exibição no PDV; a regra de estoque negativo ficou
  configurável e a instalação nova deixou de inserir cargas padrão. Tipos de
  Produtos passaram a possuir Código SPED opcional, com migração idempotente,
  normalização para maiúsculas e listagem ordenada por esse código.
- **Fiscal e NFC-e:** operações e catálogos fiscais ganharam telas próprias;
  NFC-e mantém dados cadastrais separados, protege o certificado no servidor e
  limita diagnóstico e autorização ao fluxo previsto de homologação.
- **Impressão:** o layout de cupom de 80 mm ganhou campos, texto, divisores,
  formatação por linha e impressão USB/GDI pela impressora configurada.
- **Navegação e Retaguarda:** menus, itens, submenus, barras contextuais,
  atalhos, descrições, ordem e status passaram a ser administráveis; os menus
  técnicos permanecem protegidos.
- **Interface e operação:** visualização por seleção de linha, paginação,
  toggles sem reconstrução da árvore, Status da API, reinício controlado e
  ícone configurável em runtime foram consolidados.
- **Testes e operação:** os testes `node:test` cobrem domínio, API, vendas,
  NCM/CEST e formatação NFC-e. O serviço Windows `PDV-API`, seus scripts de
  instalação/status/remoção e o procedimento de publicação estão documentados
  em `docs/DEPLOYMENT.md`. Continuam pendentes integração MariaDB controlada,
  emissão fiscal completa, integração visual do cancelamento e política
  definitiva de atualização dos terminais.

Este documento descreve o estado funcional conhecido no workspace atual. Ele
não substitui validação do Git, do banco ou do ambiente de execução. Antes de
uma publicação, execute os comandos documentados em
[`DEPLOYMENT.md`](DEPLOYMENT.md) e confirme que nenhum segredo, dump, backup ou
artefato gerado entrou no escopo.

## 14. Pendências conhecidas

Ainda não estão concluídos:

- emissão fiscal completa em produção, incluindo numeração transacional,
  armazenamento de XML/chave e reconciliação;
- cancelamento, inutilização e contingência NFC-e;
- política definitiva de atualização dos terminais;
- suíte de integração MariaDB em ambiente controlado;
- integração operacional publicada e validada com banco de teste controlado.

As pendências não alteram a arquitetura atual nem autorizam procedimentos
improvisados fora de `docs/DEPLOYMENT.md`.

### Auditoria de operadores e caixa — 2026-11-02

A implementação foi concluída em schema, API, interface e testes: existem
operadores, sessões expiráveis, papéis, abertura/fechamento de caixa,
suprimento, sangria e vínculo da venda com operador e sessão de caixa. O
cancelamento auditado foi implementado posteriormente como uma fatia própria.

Foi aprovada como opção pós-auditorias a detecção do papel servidor/terminal
por capacidades informadas pela API, com controle de telas no frontend e
autorização server-side. A futura implementação deverá evitar usar somente
`127.0.0.1` ou uma configuração local como critério de segurança.

Na auditoria de 2026-11-03, confirmou-se que essa capacidade ainda não existe:
a API não diferencia o computador servidor dos terminais que acessam o mesmo
endpoint com o token compartilhado. O resultado foi mantido como decisão
consciente de não criar uma flag de frontend ou confiar em hostname/endereço
local. A proteção de backup permanece válida porque o caminho físico é decidido
somente no servidor.

### Auditoria de NFC-e e certificado — 2026-11-03

A inconsistência de certificado A3 foi encerrada: a interface e a API aceitam
somente certificado A1 em arquivo PKCS#12 (`.pfx`/`.p12`), que é o único formato
processado pelo backend. A3 não é apresentado como recurso disponível.

A primeira etapa de integração foi definida para permitir a escolha por venda:
`emitNfce: true` cria uma reserva numérica e um documento fiscal `pending`
dentro da transação da venda; a chamada à SEF/MG ocorre após o commit e grava
XML, chave, protocolo, cStat e mensagem quando disponíveis. Os estados são
`authorized`, `rejected` e `unknown`; sem solicitação, a venda fica
`completed` com estado fiscal `not_requested` e não consome numeração. Essa
etapa continua restrita à homologação. Cancelamento/inutilização,
contingência offline, reenvio e reconciliação posterior permanecem pendentes.

### Primeira etapa de cancelamento auditado — 2026-11-03

Foi implementada a primeira fatia vertical do cancelamento de vendas:

- somente supervisor e admin podem cancelar;
- o motivo é obrigatório e deve ter pelo menos cinco caracteres;
- a venda não é apagada; recebe status cancelado, operador, horário e motivo;
- o estoque controlado é reposto na mesma transação;
- pagamentos da conta Caixa geram movimento `sale_cancellation` e reduzem o
  valor esperado do caixa;
- Vale aberto é marcado como cancelado;
- venda já cancelada é tratada de forma idempotente;
- falhas de persistência fazem rollback completo.

A rota protegida é `POST /api/sales/:idSale/cancel`. A migração idempotente
adiciona os campos de auditoria da venda, a chave estrangeira do operador que
cancelou e o novo tipo de movimento de caixa. A interface ainda não apresenta
o comando visual de cancelamento; a próxima fatia deve cobrir esse fluxo e
seus testes de contrato HTTP.

### Integração visual do cancelamento — 2026-11-03

A Frente de Caixa passou a oferecer a consulta sob demanda de vendas recentes.
O modal lista as últimas vendas, mostra o estado e o operador responsável e,
para `supervisor`/`admin`, permite iniciar o cancelamento com confirmação e
motivo em formulário próprio. O frontend não usa diálogos nativos.

A API ganhou `GET /api/sales?limit=20`, limitado a cem registros, para
alimentar essa consulta. O cancelamento continua usando a rota transacional
`POST /api/sales/:idSale/cancel`. A validação automatizada passou a 77 testes.
Ainda é necessário gerar e distribuir um novo bundle para validar a tela no
terminal; a API publicada também precisa receber esta versão antes da
validação integrada.
