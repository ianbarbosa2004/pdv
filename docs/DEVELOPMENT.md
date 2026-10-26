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

O cadastro de operações fiscais é uma camada de parametrização. Ele armazena
CFOP, regime, tipo de entrada/saída, contexto fiscal, situações tributárias,
modalidades de base, PIS, COFINS, IPI, FCP, benefício fiscal e base legal.
Esses dados ainda não significam emissão de NFC-e/NF-e nem cálculo tributário
automático; a integração fiscal deverá consumir essa configuração em etapa
posterior.

As listas usadas pelas operações fiscais são persistidas em `fiscal_catalog_items`
e possuem telas CRUD separadas. O campo `catalogFiscalCatalogItem` identifica
cada catálogo, permitindo administrar CFOP, CST/CSOSN, alíquotas de ICMS e as
demais tabelas sem manter opções fiscais somente no frontend.

### Navegação de Produtos

As telas de **Produtos**, **Classes** e **Grupos** pertencem ao item
**Cadastros > Produtos** e compartilham a mesma barra contextual, sempre na
ordem **Produtos**, **Classes**, **Grupos**. A barra é renderizada por
`src/catalog/product-navigation.js`; o título permanece no cabeçalho da tela,
sem repetir o título ou inserir separador vertical na barra.

A hierarquia também é persistida no MariaDB em `navigation_menus` e
`navigation_items`. O campo `typeNavigationItem` diferencia itens do menu,
submenus e entradas da barra (`item`, `submenu` e `bar`), enquanto
`orderNavigationItem` controla a ordem. A API expõe a leitura dessa estrutura
em `GET /api/navigation`.

As telas de **Operações Fiscais** e dos catálogos fiscais compartilham a barra
contextual do item **Cadastros > Operações Fiscais**, na ordem **Operações
Fiscais**, **CFOP**, **CST / CSOSN**, **Alíquotas ICMS**, **Regimes**, **Tipos**,
**Contextos**, **Origens**, **IPI**, **PIS / COFINS**, **Bases** e
**Desoneração**. A barra é renderizada por
`src/catalog/fiscal-navigation.js`.

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

Na tela de cadastro **NCM / CEST**, os catálogos são exibidos em três visões:
**NCM**, **CEST** e **Relações NCM / CEST**. Os cartões de resumo mostram as
quantidades carregadas, a pesquisa filtra código, descrição e segmento, e a
visão de relações mantém as ações de edição e exclusão. A tela consulta os
catálogos separadamente para não confundir um registro individual com uma
relação entre tabelas.

#### Atualização oficial dos catálogos

Em **Ferramentas > Atualizar NCM / CEST**, o backend executa uma carga
transacional dos catálogos oficiais. A NCM é obtida do JSON vigente do
Classif/Siscomex (Receita Federal). A fonte CEST é a legislação publicada pelo
CONFAZ e deve fornecer JSON, CSV, TSV ou tabela HTML com CEST, descrição,
segmento e, quando disponível, NCM para formar as relações.

As URLs podem ser substituídas no ambiente do servidor por
`PDV_NCM_SOURCE_URL` e `PDV_CEST_SOURCE_URL`. A execução registra origem,
status, data, quantidade de NCMs, CESTs e relações em `ncm_cest_updates`.
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

### Bancada de impressão térmica

A Retaguarda possui o menu **Ferramentas > Impressão térmica**. A primeira
etapa é uma bancada visual para validar caracteres, alinhamento, negrito,
tamanhos e largura de papel de 80 mm. O botão de impressão usa o diálogo do
sistema com `@page size: 80mm`, e o botão de download gera um arquivo ESC/POS
mínimo para testes controlados.

Esta etapa não presume um modelo de impressora nem envia dados diretamente por
USB ou rede. A bancada agora usa a camada Tauri para dois transportes diretos:
rede TCP RAW, normalmente na porta 9100, e USB por meio do spooler RAW do
Windows para uma impressora já instalada no sistema. O texto de teste seleciona
CP850 no comando ESC/POS e usa uma tabela compatível com os caracteres
portugueses mais comuns. O modo direto de compatibilidade usa somente
inicialização, seleção de CP850, espaçamento padrão e quebras `CRLF`; não envia
corte, alinhamento ou tamanho de fonte. O final acrescenta cinco quebras de
linha reais. O transporte mantém o socket aberto por um curto período depois
do `flush`, permitindo que a impressora drene o buffer antes de encerrar a
conexão. O envio TCP também é dividido em blocos de 128 bytes com uma pausa
curta entre eles, para evitar que firmwares compatíveis descartem a segunda
metade de um payload enviado em uma única rajada.

O nome da impressora USB é o mesmo exibido nas impressoras do Windows. Para
rede, informe o IP ou nome DNS e a porta RAW configurada no equipamento. A
integração não deve ser usada para confirmar vendas: a impressão deve ocorrer
somente depois que a API confirmar a venda e uma falha de impressão deve ser
tratada como falha operacional, sem repetir a venda. No modo USB, a tela
consulta o spooler do Windows e apresenta uma lista das impressoras instaladas;
use **Atualizar impressoras** depois de instalar ou conectar um novo
equipamento. O envio USB usa uma página GDI Unicode no driver selecionado,
em vez de enviar bytes ESC/POS RAW; assim as configurações do POS-80, como
largura, fonte, tabela de caracteres e corte, ficam sob responsabilidade do
driver instalado. A bancada permite escolher família e tamanho da fonte no
preview; no USB, essas escolhas também são aplicadas ao texto renderizado pelo
driver. A impressora de Cupom usada pela bancada é carregada e salva pela API
em `/api/printer-settings`, junto com a impressora padrão de Relatórios.

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

### Impressoras padrão

As impressoras padrão de **Cupom** e **Relatórios** são configuradas em
**Retaguarda > Configurações**. A lista é obtida do spooler de impressoras do
Windows, mas a escolha é persistida no MariaDB pela API em
`/api/printer-settings`. A bancada de impressão térmica usa a impressora
definida para Cupom.
