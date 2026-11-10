# Histórico de versões

Este documento registra as mudanças funcionais e técnicas agrupadas por versão.
O número da versão deve ser incrementado antes da compilação quando a alteração
for distribuível. O hook `prebuild` e o fluxo `prerelease:client` podem acionar
o versionamento automático quando o build é executado.

## Próxima versão - correções de operação e Receitas

- Corrigida a preparação do caixa para instalações existentes cujo
  `idCashRegister` já ultrapassou o limite de `TINYINT UNSIGNED`: o schema
  inicial e a migração idempotente agora usam `SMALLINT UNSIGNED`, preservando a
  chave estrangeira de `cash_sessions` e permitindo a autenticação do operador.
- Ajustado o editor de componentes de Receitas para reservar `248px` no bloco
  de inclusão e `30px` de margem inferior no botão **Adicionar componente**.
- A suíte completa foi validada com 146 testes aprovados; não foi executado
  build porque a etapa não exigiu validação de bundle.

## Próxima versão - catálogo unificado de unidades

- Preparada a primeira etapa aditiva da migração para um catálogo unificado de
  unidades, com flags de uso tributável e culinário, mapa de IDs legados,
  conversões canônicas e validações de integridade.
- A API passa a ler e gravar unidades e conversões no catálogo unificado,
  traduzindo referências legadas de receitas por mapas de compatibilidade sem
  exigir regravação em massa.

## Próxima versão - formulário de Receitas

- A listagem de Receitas agora abre o registro selecionado no formulário
  principal em modo somente leitura. O botão **Editar** habilita o mesmo
  formulário inline com **Salvar**, enquanto **Nova receita** limpa o editor
  para um novo cadastro; o modal de edição foi removido.
- O status da Receita passou a ser editável no formulário, com os estados
  `draft` (Rascunho), `active` (Ativa) e `review_required` (Requer revisão).
  A listagem agora exibe as colunas Nome, Tipo, Status e Ações; registros
  arquivados continuam identificados como `archived` e podem ser consultados
  pelo carregamento histórico da tela.
- Adicionados filtros da listagem por status, com contadores para Todas,
  Rascunho, Ativas, Requer revisão e Arquivadas; o filtro funciona junto com a
  pesquisa textual.
- Removida a coluna Conversão da listagem de componentes para reduzir ruído
  visual; a conversão permanece disponível no cadastro e no modal de edição.
- Adicionada edição de componente em modal, com alteração do componente,
  unidade culinária, conversão, quantidade e perda sem abrir outro cadastro.
- Corrigido o custo de componentes com conversão: `800 g` convertido para
  quilograma usa fator `0,001` e passa a ser calculado como `0,800 kg`.
- Restringidas as conversões de componentes para que o destino corresponda à
  unidade tributável do Produto; a API também rejeita combinações incompatíveis.
- Memoizada a preparação do schema de Receitas durante a vida do processo,
  evitando repetir consultas de metadados a cada carregamento da listagem.
- Corrigida a edição de componentes para manter a conversão persistida no
  select e reposicionar o modal fora do formulário; o X e Cancelar agora fecham
  a edição sem inserir o modal no conteúdo do cadastro.
- Corrigida a leitura da API para retornar o fator da conversão junto aos
  componentes; sem esse campo, o custo era calculado com fator `1`, como se
  `800 g` fossem `800 kg`.
- Reduzido o tempo de atualização após salvar ou arquivar ao manter os
  catálogos auxiliares em memória e recarregar somente as Receitas.
- Protegido o salvamento contra submissões repetidas, evitando a exibição
  duplicada da mensagem de sucesso.
- Padronizado o cabeçalho do modo de visualização com o título
  **Visualização** e o botão **Novo cadastro**; o botão de novo cadastro foi
  removido do cabeçalho da listagem.
- Ajustado o formulário para exibir Tipo e Status na mesma linha, renomeado o
  status visível **Requer revisão** para **Revisão**, aplicado negrito aos
  status Rascunho e Revisão na listagem e alinhada a coluna Custo à direita.
- A rotação dos logs do serviço Windows `PDV-API` passou a ser diária, com um
  arquivo de saída e um arquivo de erro por dia, mantendo os últimos 14 dias.
  Isso evita a fragmentação em diversos arquivos pequenos causada pela rotação
  por tamanho.
- Corrigida a consulta de Receitas no MariaDB: o alias SQL `conversion` foi
  substituído por `culinary_conversion`, evitando erro de sintaxe ao carregar
  os componentes das receitas.
- A leitura dos componentes de Receitas passou a ordenar por
  `idRecipeComponent`, compatível com bancos legados que ainda não possuem
  `orderRecipeComponent`, sem impedir a exibição dos cadastros existentes.
- O salvamento de Receitas e Composições agora usa o mesmo feedback modal de
  sucesso das demais telas e separa falhas de atualização da listagem do erro
  do formulário, evitando a apresentação simultânea de sucesso e erro antigo.
- Corrigida a pesquisa dos cadastros culinários para preservar a posição do
  cursor durante a atualização da listagem.
- Estados físicos agora retornam e exibem corretamente o status ativo/inativo.
- A migração de conversões elimina duplicidades por origem, destino e estado
  antes de criar a restrição única. Colher de café e colher de sobremesa
  passaram a possuir referências aproximadas para conversões de massa por
  estado físico compatível.
- As referências volumétricas das medidas culinárias foram alinhadas a fontes
  brasileiras e institucionais: colher de café `2,5 ml`, colher de chá `5 ml`,
  colher de sobremesa `10 ml`, colher de sopa `10 ml`, xícara de chá `200 ml`
  e dose/jigger `45 ml`. As conversões de volume foram completadas também para
  líquidos viscosos; conversões de volume para massa continuam específicas por
  estado físico e explicitamente aproximadas.

- O cadastro de Receita ou Composição passou a apresentar Nome antes de Tipo e
  usa textarea para Observações.
- Componentes podem ser localizados por busca sem diferenciar caixa ou acentos.
- Componentes de Produto exibem a unidade cadastrada e permitem selecionar
  Unidade Culinária e Conversão compatíveis com a unidade e o estado físico.
- A tela de Nova Receita foi reorganizada em três colunas, com editor em duas
  colunas e listagem em uma; o seletor de componente ocupa uma linha própria,
  os campos numéricos usam a máscara padrão e a lista permite reordenar
  componentes e consultar o custo total estimado.
- O cabeçalho da Receita informa o Rendimento e exige a Unidade final
  tributável. A listagem exibe Receita/Composição, Tipo e ações de edição e
  arquivamento; a edição da Receita ocorre no formulário principal.
- A ordem dos componentes é persistida, a tabela exibe o custo individual
  calculado pela quantidade bruta convertida para a unidade do Produto e o
  botão
  de confirmação usa o texto `Salvar`, com recuperação garantida após falhas.
- Medidas culinárias variáveis, como colheres, xícaras e doses, passaram a usar
  base **Comum** e categoria **Geral**; a conversão permanece dependente do
  estado físico do componente.
- O schema e a API persistem e validam a unidade final tributável, a ordem dos
  componentes e os identificadores de unidade e conversão dentro da transação
  de criação ou edição.
- A alteração envolve `src/server/`; a API publicada deve ser reiniciada antes
  da validação operacional. Não foi necessário executar build nesta etapa.
- A suíte completa foi executada com 114 testes aprovados; `node --check` e
  `git diff --check` também passaram.

## 0.11.0 - 2026-11-04

### Receitas, Composições e Produto Buffet

- Adicionadas as estruturas persistidas de Receitas, Composições, componentes,
  revisões e vínculos entre Produto comercial e Receita.
- Receitas podem existir de forma independente de Produto comercial, permitindo
  reutilização em pratos e outras estruturas sem criar produtos artificiais.
- Produtos Buffet registram a venda com preço próprio, sem baixa de estoque,
  Cardápio obrigatório ou bloqueio do fechamento de caixa.
- Adicionadas validações compartilhadas para perdas, custos, expansão de
  componentes e detecção de ciclos em estruturas culinárias.

### Navegação contextual persistida

- Ficha Técnica, Views, Produtos, Operações Fiscais, Financeiros e as telas
  relacionadas passaram a usar a navegação persistida como fonte principal.
- Ordens, labels, rotas, divisores, itens inativos e customizações de menus e
  pais permanecem após nova leitura, build ou reinício da API.
- Fallbacks locais ficaram restritos à indisponibilidade ou incompletude da API;
  uma resposta persistida válida não recebe itens locais injetados.
- Leituras iniciais da navegação usam retry antes de recorrer ao fallback.

### Validação e operação

- A suíte completa foi executada com 112 testes aprovados.
- Os arquivos JavaScript alterados passaram em `node --check` e
  `git diff --check`.
- Não foi executado build nesta etapa, pois a alteração não exigiu validação
  de bundle. Alterações em `src/server/` continuam exigindo publicar e
  reiniciar a API antes da validação operacional.

## 0.10.0 - 2026-11-04

### Persistência do Construtor de navegação

- `navigation_menus` e `navigation_items` passaram a ser a fonte de verdade
  das leituras normais da navegação. O frontend e a API não completam uma
  resposta válida com defaults nem reordenam registros persistidos.
- Rotas, labels, menus, pais, tipos, status, divisores e ordens personalizados
  permanecem como foram salvos pelo usuário.
- Defaults ficaram restritos ao bootstrap de registros ausentes e ao fallback
  explícito quando a API está indisponível.
- O arraste entre menus move a subárvore inteira e salva pais antes dos filhos,
  preservando a hierarquia durante a validação.
- A inicialização da API deixou de executar a rotina legada de normalização
  destrutiva da navegação.
- Corrigida a resolução de rotas persistidas no menu principal: chaves como
  `ncm-cest-update` agora encontram handlers no padrão `onNcmCestUpdate`,
  inclusive quando o acesso ocorre depois de entrar em Views.

### Validação e operação

- A etapa foi validada com 99 testes automatizados aprovados, `node --check`
  nos arquivos JavaScript alterados e `git diff --check`.
- A API foi publicada e reiniciada pelo operador; o serviço `PDV-API` está em
  execução e os bundles do cliente foram gerados. A chamada sem o token
  compartilhado foi rejeitada com HTTP 401, confirmando a proteção da API.
- O build oficial posterior ficou bloqueado por `EPERM` porque o aplicativo
  instalado mantém `dist\releases` em uso; a compilação Vite em diretório
  alternativo foi concluída com sucesso.
- A validação autenticada de banco não foi repetida neste ambiente porque o
  token operacional não está disponível nesta sessão; ele não deve ser
  registrado ou exposto.

### Correções de interface

- Corrigida a persistência do Construtor de navegação: rotas editadas,
  menus/pais movidos e ordens personalizadas não são substituídos pela
  mesclagem dos defaults nem pela inicialização da API.
- Corrigido o alinhamento da barra contextual de Views: ela ocupa a largura
  da tela e começa no extremo esquerdo, como as demais barras.
- Estabelecida largura mínima de operação de `1180px` para os conteúdos de
  retaguarda, sem alterar o limite máximo de `1440px`.
- Adicionado espaçamento entre painéis e ampliados os campos de URL de
  configurações; não há margem vertical adicional entre menu e barra contextual.
- Padronizado o espaçamento dos contêineres principais, preservando a
  centralização horizontal (`margin: 0 auto`) e os limites específicos de
  largura quando necessários para a composição de cada tela.
- Separados os painéis **Consulta oficial** e **Resultado demonstrativo** da
  NFC-e e uniformizada a altura mínima das linhas do Construtor de navegação.
- Removido o `padding-top` exclusivo do primeiro menu do Construtor, que
  deslocava **Frente de Caixa** em relação aos demais itens.
- Removido o `width: 100%` forçado dos painéis de Importar Cadastros e
  Atualizar NCM / CEST; os contêineres dessas telas preservam apenas o
  `min-width: 1180px`, assim como as demais telas operacionais indicadas.
- Corrigida a aplicação da regra: Status da API, Backup e Restauração,
  Configurações Gerais e Impressoras passaram a ter classes próprias para não
  herdar larguras inadequadas dos contêineres compartilhados.
- Ajustadas as seis telas para seguirem o limite operacional de Dados da
  Empresa, com `min-width: 1180px` e `max-width: 1180px`, em vez de
  expandirem até `1440px`.
- Padronizadas as barras contextuais singleton de Clientes, Consumidores,
  Fornecedores, Status da API, Consulta de NFC-e, Backup e restauração,
  Configurações Gerais, Dados da Empresa, NFC-e, Impressoras e Construtor de
  navegação.
- Os títulos da barra contextual e do painel introdutório agora usam o mesmo
  nome operacional da tela; o conteúdo das telas foi limitado a 1440px e a
  barra de Views permanece alinhada à esquerda.
- Os textos introdutórios passaram a ser lidos de `descriptionNavigationItem`
  em `navigation_items`; o Construtor de navegação permite editar esse texto
  para cada item que abre uma tela.
- A leitura normal da navegação passou a usar diretamente o estado persistido
  por `navigation_menus` e `navigation_items`. Defaults são usados somente no
  bootstrap do schema e no fallback explícito quando a API está indisponível.
- O arraste de um item principal para outro menu agora move também toda a sua
  subárvore, preserva a relação pai-filho e recalcula as ordens dos menus de
  origem e destino.
- Transformadas as mensagens de sucesso das telas administrativas em overlays
  modais temporários, centralizados e fora do fluxo de layout, com duração de
  aproximadamente 2,5 segundos.
- Corrigida a rolagem do Construtor de navegação após salvar alterações,
  incluindo a ação **Adicionar divisor abaixo**; a posição anterior da
  viewport é restaurada depois da atualização da árvore.

### Correções de operação e segurança

- Extraídas as rotinas idempotentes de preparação do banco para
  `src/server/schema-manager.js`, reduzindo a concentração de
  `src/server/server.js`.
- Centralizada a DDL de NCM/CEST em `src/server/ncm-cest-update.js`, usada tanto
  na inicialização quanto na atualização dos catálogos.
- Corrigidos os scripts de publicação e configuração do serviço Windows:
  a senha do `pdv_app` é enviada ao cliente `mysql` por pipe, sem arquivo SQL
  persistente, e a conta `PDVApiSvc` recebe a senha gerada corretamente.
- Atualizada a documentação operacional em `docs/DEVELOPMENT.md`,
  `docs/DEPLOYMENT.md`, `docs/PROJECT-HISTORY.md` e
  `docs/CONTINUITY-PROMPT.md`.
- Validação desta etapa: 58 testes automatizados aprovados, `node --check`,
  análise sintática dos scripts PowerShell e `git diff --check`.
- Não foram executados build completo, publicação, deploy, alteração de conta
  Windows ou reinício do serviço. Como a etapa atual alterou scripts e
  documentação, a API não precisa ser reiniciada.
- A busca da Frente de Caixa passou a atualizar somente o grid de produtos,
  evitando reconstruir o carrinho, o resumo e o modal a cada tecla.
- A carga do catálogo de NCMs no cadastro de produtos passou a ocorrer sob
  demanda, somente ao abrir a consulta.
- A auditoria de acessibilidade corrigiu contraste insuficiente na Frente de
  Caixa, incluindo textos auxiliares do carrinho, e adicionou nomes explícitos
  aos campos de pesquisa.
- A medição de catálogos confirmou 75 produtos e 19 grupos, sem justificativa
  atual para paginação. NCM/CEST ficou registrado como candidato a consulta
  server-side por possuir 10.508 NCMs e 947 CESTs.
- A tela dedicada de NCM/CEST passou a usar paginação e busca server-side,
  preservando o retorno completo legado dos endpoints quando nenhum parâmetro
  de paginação é informado.
- Registro intermediário: a API publicada permaneceu saudável, mas as rotas
  paginadas retornaram 404 enquanto `C:\ProgramData\PDV\app` ainda continha a
  publicação anterior.
- Registro intermediário: após um bundle inicial, a aplicação publicada ainda
  não continha `parseCatalogPagination`; a API continuava saudável, mas
  executava o conteúdo anterior.
- Corrigidos os comandos de criação/atualização da conta `PDVApiSvc` nos
  scripts de publicação Windows.
- Publicação da API concluída e validada: serviço em execução, health com
  banco conectado e rotas paginadas NCM/CEST respondendo HTTP 200.
- Auditoria registrou como pendência estrutural a autenticação de operadores,
  o controle de caixa e a auditoria/cancelamento de vendas; nenhuma regra foi
  adicionada somente no frontend.
- Corrigida a aceitação de diretórios de backup enviados pelo terminal; a API
  agora usa somente o diretório configurado no servidor ou seu padrão.
- Auditoria do fluxo de vendas confirmou validação server-side, transação
  atômica, rollback, baixa de estoque e idempotência sem novo defeito.
- Auditoria de impressão confirmou restrição à rede local, timeouts e
  separação entre impressão e confirmação financeira.
- Removido o fluxo ESC/POS: a impressão direta agora usa somente o driver
  Windows/GDI configurado, e a pré-visualização usa o diálogo do sistema.
- Removidas dependências obsoletas de CORS/plugin HTTP e do seletor de
  diretório (`cors`, `@tauri-apps/plugin-http`, `rfd` e
  `tauri-plugin-http`), junto das permissões e comandos nativos sem uso.
- Auditoria de schema e migrações confirmou que o schema inicial e o
  gerenciador runtime não possuem tabelas divergentes; migrações de dados
  permanecem transacionais e documentadas.
- Auditoria de empacotamento Windows confirmou que os scripts usam apenas
  dependências declaradas, mantêm MSI/NSIS por máquina e sincronizam as versões
  dos manifests.
- Configurados os instaladores NSIS e WiX/MSI para português, sem seletor de
  idioma durante a instalação.

- A idempotência de vendas agora rejeita a reutilização de `clientIdSale` com
  itens, desconto ou pagamentos diferentes.
- Pagamentos mistos com Vale debitam somente o valor efetivamente pago nessa
  forma, preservando os demais pagamentos.
- A impressão térmica de rede aceita somente endereços locais e usa limites de
  conexão e escrita para evitar bloqueios indefinidos.
- O token da API salvo no terminal é protegido pelo armazenamento DPAPI do
  Windows, enquanto a URL e demais preferências permanecem no arquivo local.
- A Frente de Caixa informa explicitamente quando caixa e operador ainda não
  estão configurados.
- O cadastro de produtos passou a usar `printsPlace`, com os valores
  `NÃO IMPRIMIR`, `BAR`, `COPA` e `COZINHA`, migração do campo legado e valor
  padrão `NÃO IMPRIMIR`.
- A importação CSV passou a aceitar Local de Impressão e Status, com validação
  server-side, painel introdutório atualizado e referências para download.
- A importação CSV passou a aceitar Estado Físico para matérias-primas por ID,
  nome, código ou descrição, carregando os valores ativos pela API e
  oferecendo o download `referencia-estados-fisicos.md` com o ID de cada
  cadastro; o servidor grava o identificador do estado físico no produto.
- Após erro no teste do CSV, a seleção anterior é descartada e o painel oferece
  **Selecionar arquivo** para escolher outro arquivo ou selecionar novamente o
  mesmo arquivo.
- A importação normaliza `NAO IMPRIMIR` para `NÃO IMPRIMIR` e informa os valores
  aceitos quando um local de impressão realmente não for reconhecido.
- Removida a migração automática que alterava produtos de **Mercadoria para
  Revenda** para **Produto Acabado** durante a preparação do catálogo.
- A tela de login agora é exibida imediatamente na inicialização; navegação e
  ícone são carregados em segundo plano antes da entrada no ambiente autenticado,
  evitando a janela branca durante o carregamento inicial.
- A leitura da configuração offline deixou de bloquear a montagem inicial do
  login, e a janela Tauri recebeu fundo compatível com a tela de autenticação
  durante o carregamento do WebView.
- A configuração da janela Tauri mantém a maximização e o fundo compatível sem
  ocultar a janela durante o desenvolvimento, preservando a abertura do PDV.
- Corrigida a resolução dos itens de navegação de Fornecedores e Clientes no
  construtor de menus; a barra de Formas de pagamento não exibe mais o link
  redundante Financeiros.
- Corrigido o alias de Status da API na tela de Backup e restauração, que
  podia manter o usuário na própria tela de backup em vez de abrir o status.
- Corrigida a renderização dos divisores do construtor: eles respeitam a ordem
  persistida e não são mais deslocados para dentro da barra contextual de
  Ficha Técnica. A inicialização do schema deixou de reordenar automaticamente
  Produtos Acabados e os demais itens irmãos.
- Vendas só validam e baixam estoque quando `controlsStockProduct` está ativo.
  Produtos sem controle de estoque não são bloqueados por estoque insuficiente.
- A Frente de Caixa respeita `allowNegativeStock` na listagem: com a opção
  ativada, produtos controlados com estoque zero ou negativo continuam
  disponíveis; com a opção desativada, somente produtos com estoque positivo
  são exibidos.
- A suíte de testes foi consolidada com 94 casos aprovados, incluindo os
  cenários de estoque e importação.

## 0.8.10 - 2026-11-01

### Correções

- Removida também da navegação persistida a cópia do **Construtor de menu**
  que aparecia duplicada em **Ferramentas**. O acesso oficial permanece em
  **Configurações > Construtor de navegação**.
- Alinhado o escopo dos instaladores MSI e NSIS para atualização por máquina.
- Fixado o identificador de upgrade do MSI para preservar a instalação entre
  versões.
- Criadas e carregadas as tabelas de unidades culinárias, estados físicos e
  conversões de medidas para uso futuro no controle de insumos.
- Adicionadas as Views **Sem Estado Físico** e as telas de **Ficha Técnica**
  para unidades culinárias, estados físicos e conversões.
- O Construtor de navegação permite inserir divisores visuais entre itens de
  qualquer menu, com ordenação configurável.
- Ajustadas as listagens da Ficha Técnica para ocultar códigos e status,
  traduzir categorias e aceitar fatores no padrão decimal brasileiro.
- Incluídas conversões identidade para grama, mililitro e unidade.
- Refinada a tabela de estados físicos: o estado sólido foi separado em
  inteiro, fatiado, picado/cubos e ralado/triturado, com inclusão de
  **Congelado**.
- Incluídas conversões aproximadas para os novos estados físicos, usando os
  fatores de referência `10 g` por colher de sopa e `115 g` por xícara de chá.
- Adicionadas as unidades culinárias `kg`, `l`, colher de café, colher de
  sobremesa e dúzia, com conversões para grama, mililitro ou unidade quando
  o relacionamento é determinístico.
- A View **Sem Estado Físico** passou a permitir definir o estado físico no
  modal de edição.
- Removido o link **Retaguarda** da barra contextual da Ficha Técnica.
- Removido o link **Retaguarda** das demais barras contextuais; o botão do
  cabeçalho da Frente de Caixa permanece disponível, pois não é contextual.
- Corrigido o botão de divisor do Construtor de navegação: ele agora aparece
  em cada item existente e insere o divisor imediatamente abaixo do item,
  sem reabrir a criação livre de itens ou submenus.
- Normalizada a numeração de ordem da navegação por nível e item pai, evitando
  que itens de menu e barras contextuais compartilhem uma sequência global.

## 0.8.9 - 2026-11-01

### Correções

- O Construtor de navegação passou a manter somente a edição da estrutura
  existente: não permite criar menus principais, itens ou submenus.
- A API também recusa novas criações de menus e itens, inclusive para clientes
  antigos que tentem chamar os endpoints diretamente.
- Removido o acesso duplicado ao Construtor de menu na tela de Impressoras.
- Preferências operacionais deixam de ser normalizadas automaticamente para
  maiúsculas e o rótulo de estoque negativo permanece em linguagem natural.

## 0.8.8 - 2026-11-01

### Segurança

- Adicionada autenticação obrigatória por token em todas as rotas da API.
- CORS passou a aceitar somente origens configuradas.
- Segredos CSC e tokens NFC-e deixaram de ser retornados pelos endpoints de
  leitura; valores existentes são preservados quando a tela envia campos vazios.
- Restauração de backup passou a validar banco, tabelas e colunas e criar uma
  cópia de segurança automática antes da substituição.

## 0.8.7 - 2026-11-01

### Novidades

- Adicionado **Frente de Caixa** como primeiro item fixo do menu principal.
- O item permanece ativo, na ordem `0`, abre `showSales` e é protegido contra
  renomeação, reordenação, substituição ou desativação pela API e pelo
  Construtor de navegação.

## 0.8.6 - 2026-11-01

### Correções

- Corrigados no banco os 20 produtos da classe **EMBALAGENS** e grupo
  **DESCARTÁVEIS**:
  - classe/grupo: **USO E CONSUMO / USO E CONSUMO**;
  - tipo de produto: **MATERIAL DE USO E CONSUMO**;
  - prefixo de SKU: `EMB-` para `USO-`.
- Adicionada a rotina transacional
  `scripts/migrations/migrate-embalagens-to-uso-consumo.mjs` para registrar a correção.

## 0.8.5 - 2026-11-01

### Correções

- Corrigida e testada a conversão dos valores booleanos da importação CSV.
  `não`/`nao`, `n`, `false`, `0` e `no` resultam explicitamente em falso,
  incluindo o campo **Controla estoque**.
- Valores booleanos desconhecidos agora são rejeitados com erro de validação,
  em vez de serem tratados silenciosamente como falso.

## 0.8.4 - 2026-11-01

### Correções

- Corrigido o botão **Testar arquivo** para reabrir o seletor quando a leitura
  do arquivo selecionado não produziu linhas válidas.
- A seleção anterior é limpa antes da nova escolha, permitindo selecionar
  novamente o mesmo arquivo.

## 0.8.3 - 2026-11-01

### Correções

- Corrigida a validação de arquivos CSV após a seleção. O botão **Testar
  arquivo** reutiliza as linhas já lidas, evitando uma segunda leitura da
  referência `File` que podia falhar no WebView/Tauri.

## 0.8.2 - 2026-11-01

### Correções

- Corrigidos os rótulos da primeira coluna da lista de valores aceitos do CSV,
  que agora seguem os mesmos nomes em português do cabeçalho do modelo.

## 0.8.1 - 2026-11-01

### Ajustes

- A importação CSV passou a aceitar, nas colunas relacionadas, tanto
  descrições quanto códigos cadastrados nas referências:
  - operação fiscal de venda: descrição ou CFOP;
  - tipo de produto: descrição ou Código SPED;
  - unidade: código ou descrição.
- Arquivos que continuam usando as descrições anteriores permanecem
  compatíveis.

## 0.8.0 - 2026-11-01

### Novidades

- Adicionada à tela **Importar cadastros** uma lista com os valores aceitos
  para cada coluna do CSV, incluindo aliases de campos booleanos, formatos
  numéricos, padrões de códigos e valores padrão.

## 0.7.3 - 2026-11-01

### Ajustes

- Ajustado o layout da View **Sem Custo** para uma única coluna.
- A listagem de **Sem Custo** passou a ocupar 100% da largura disponível.

## 0.7.2 - 2026-11-01

### Correções

- Corrigida a navegação de **Views** no menu **Ferramentas**.
- **Views** passou a ser um item direto, seguindo o padrão de **Produtos**.
- Removido o submenu visual de Views; **Grupos x Produtos** e **Sem Custo**
  são acessados pela barra contextual da tela.

## 0.7.1 - 2026-11-01

### Correções

- Corrigido o clique no item **Views** quando a navegação era renderizada como
  submenu.
- Adicionado teste de regressão para a renderização clicável da entrada.

## 0.7.0 - 2026-11-01

### Novidades

- Criada a área **Ferramentas > Views**.
- Criada a View **Grupos x Produtos**, com árvore `Classe - Grupo`,
  contagem de produtos, pesquisa, ordenação e filtros.
- Criada a View **Sem Custo**, filtrada por produtos com custo igual a zero.
- Extraída a listagem reutilizável para `src/tools/product-list-view.js`.
- Adicionadas ações de status, visibilidade, exclusão e edição na listagem.
- A edição passou a ocorrer em modal local, sem sair da View.

### Documentação e validação

- Atualizada a documentação operacional e o histórico funcional da área Views.
- Adicionados testes para navegação, árvore de grupos e filtro de custo zero.

## 0.6.1 - 2026-11-01

### Ajustes

- Refinada a tela inicial de Views com o nome **Grupos x Produtos**.
- A árvore passou a exibir `Classe - Grupo` ordenado por classe e grupo.
- O painel introdutório foi dividido visualmente.
- A listagem recebeu pesquisa, ordenação, status, visibilidade, exclusão e
  ação de edição.
