# Histórico do projeto

Este documento registra a evolução funcional e técnica do PDV desde a decisão
inicial do produto até o estado atual do workspace. Ele complementa o
`README.md`, que continua sendo a visão geral, e o
[`DEVELOPMENT.md`](DEVELOPMENT.md), que contém as convenções operacionais.

## 0. Estado mais recente

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

O versionamento deixou de ser alterado por builds. `npm.cmd run build` e
`npm.cmd run release:client` usam a versão atual; incrementos exigem
`version:patch`, `version:minor` ou `version:major`. Os instaladores finais
usam os nomes fixos `pdv-zanzibar.msi`, `pdv-zanzibar.exe` e
`pdv-zanzibar-metadata.json`, sem versão no nome do arquivo. O script de
release seleciona somente os artefatos da versão corrente e só regenera ícones
quando `--refresh-icons` é solicitado.

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

Os transportes implementados são:

- rede TCP RAW/ESC-POS, normalmente na porta 9100;
- USB por meio do driver Windows/GDI da impressora de Cupom configurada.

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
  formatação por linha, transporte TCP RAW/ESC-POS e USB/GDI pela impressora
  configurada.
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
  caixa, autenticação de operadores e emissão fiscal completa.

Este documento descreve o estado funcional conhecido no workspace atual. Ele
não substitui validação do Git, do banco ou do ambiente de execução. Antes de
uma publicação, execute os comandos documentados em
[`DEPLOYMENT.md`](DEPLOYMENT.md) e confirme que nenhum segredo, dump, backup ou
artefato gerado entrou no escopo.

## 14. Pendências conhecidas

Ainda não estão concluídos:

- autenticação e autorização de operadores;
- abertura, fechamento, sangria e suprimento de caixa;
- emissão fiscal completa em produção;
- cancelamento, inutilização e contingência NFC-e;
- política definitiva de atualização dos terminais;
- suíte de integração MariaDB em ambiente controlado;
- definição completa de auditoria e cancelamento de vendas.

As pendências não alteram a arquitetura atual nem autorizam procedimentos
improvisados fora de `docs/DEPLOYMENT.md`.
