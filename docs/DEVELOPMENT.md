# Convenções de desenvolvimento

O histórico consolidado da evolução funcional e técnica está em
[`PROJECT-HISTORY.md`](PROJECT-HISTORY.md). Atualize esse documento quando
uma etapa relevante alterar a arquitetura, os contratos ou o estado do
produto.

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

## Cadastros, tabelas e migrações

O `schema.sql` é o schema inicial reproduzível. A API também executa
verificações idempotentes ao iniciar ou ao acessar cada área, por meio das
funções `ensure...Schema` em `src/server/server.js`. Essas verificações criam
tabelas ausentes e adicionam colunas novas com `ALTER TABLE`; não devem apagar,
recriar ou truncar tabelas existentes.

As tabelas de cadastro e apoio atualmente são:

| Área | Tabelas | Conteúdo |
| --- | --- | --- |
| Produtos | `classes`, `groups`, `products`, `product_types`, `units` | Classificação, Código PDV, operação fiscal de venda, tipo, unidade, preço, estoque, flags operacionais e status |
| Fiscal do produto | `ncm_catalog`, `cest_catalog`, `ncm_cest_relations`, `ncm_cest_updates` | Catálogos NCM/CEST, relações e histórico das cargas |
| Financeiro | `payment_methods` | Forma de pagamento, conta Banco/Caixa, prazo, desconto, acréscimo e status |
| Operações fiscais | `fiscal_operations`, `fiscal_catalog_items` | Operações e listas de CFOP, CST/CSOSN, ICMS, IPI, PIS/COFINS e demais parâmetros |
| Configuração | `company_settings`, `printer_settings`, `general_settings` | Empresa, NFC-e, certificado protegido, impressoras, layout de cupom e regras operacionais gerais |
| Navegação | `navigation_menus`, `navigation_items` | Menus, barras contextuais, rotas e ordenação |
| Venda | `sales`, `sale_items`, `sale_payments` | Venda, itens congelados, pagamentos e idempotência |

As chaves e colunas persistidas seguem o padrão `nomeCampoEntidade`, por
exemplo `ncmProduct`, `receiptLayoutPrinterSetting`,
`nfceEnvironmentCompany` e `discountTypePaymentMethod`. As relações usam
foreign keys com `ON DELETE RESTRICT` quando a remoção poderia destruir
histórico; por isso a interface oferece inativação antes da exclusão
definitiva.

Ao alterar uma tabela, atualize nesta ordem: `schema.sql`, migração compatível
em `server.js`, consultas e validações da API, telas, testes e esta
documentação. Teste tanto uma instalação nova quanto um banco existente com
colunas da versão anterior. A migração deve preservar dados, índices e
restrições.

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

### Instalação sem cargas padrão

Uma instalação nova cria somente a estrutura das tabelas. Tipos de produto,
unidades, catálogos fiscais, formas de pagamento, impressoras, configurações,
empresa e navegação não são inseridos automaticamente pela API nem pelo
`schema.sql`. Esses registros devem ser cadastrados explicitamente pelas telas
correspondentes. Essa decisão evita que uma exclusão feita pelo usuário seja
desfeita por uma rotina de inicialização e mantém o banco sob controle da loja.

Registros existentes não são removidos por essa regra. A remoção de dados de
uma instalação já utilizada deve ser feita por uma migração específica,
revisada e autorizada.

Quando uma mudança alterar API, banco ou fluxo de cadastro, inclua cobertura
para sucesso, entradas inválidas, erros explícitos e efeitos relevantes no
estado persistido.

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
como um popup temporário fixo na tela, fora do fluxo de layout do formulário
de inclusão ou do modal de edição.
O feedback deve usar o helper compartilhado em `src/ui/feedback.js`, possuir
`role="status"`, esmaecer ao entrar e sair e desaparecer automaticamente após
aproximadamente quatro segundos. Mensagens de erro permanecem visíveis até
uma nova ação ou correção.

Depois de cadastrar um novo registro, o formulário de inclusão deve retornar
ao estado vazio e pronto para o próximo cadastro. Após editar um registro, o
modal deve ser encerrado sem deixar a mensagem de sucesso no formulário de
inclusão. Novas telas e alterações em formulários devem preservar esse
comportamento, sem criar um fluxo visual diferente.

### Navegação de Produtos

A tela **Mercadoria para Revenda**, além de **Classes** e **Grupos**, pertence
ao item **Cadastros > Produtos** e compartilha sua barra contextual. O item
**Produtos** é apenas o agrupador no menu principal, sem rota própria; ao
acessá-lo, a navegação abre o primeiro filho, **Mercadoria para Revenda**.
**Produtos Acabados** é o segundo filho e usa a mesma tela parametrizada, com
tipo de produto **Produto Acabado** e operação fiscal padrão **Venda de
produção**.

Mercadoria para Revenda usa o prefixo inicial **REV-** para novos SKUs. A
listagem é apresentada como **Mercadorias para Revenda**. Na migração para
Produtos Acabados, os produtos existentes mantêm seus SKUs atuais, mas recebem
o tipo **Produto Acabado** e a operação fiscal **Venda de produção**.
A barra é renderizada por `src/catalog/product-navigation.js`; o título
permanece no cabeçalho da tela, sem repetir o título ou inserir separador
vertical na barra.

### Cadastro de Produtos

O cadastro usa `pdvCodeProduct` como Código PDV. A inicialização da API migra
`barcodeProduct` para esse nome sem descartar os valores existentes e as
mensagens de duplicidade usam Código PDV. Cada produto pode referenciar uma
operação fiscal de saída (`idFiscalOperationSaleProduct`), um tipo em
`product_types` e uma unidade tributável em `units`. As tabelas auxiliares são
criadas de forma idempotente e permanecem sem registros até o usuário
cadastrá-los.

Os campos `controlsStockProduct`, `isFractionalProduct`,
`printsKitchenProduct` e `showsInPdvProduct` são booleanos validados pela API.
`showsInPdvProduct` inicia como verdadeiro e controla se o produto aparece na
frente de caixa. O estoque inicial é
inteiro para produtos não fracionados e aceita até três casas decimais para
produtos fracionados. **Zero é permitido em qualquer configuração**. Quando a
configuração `allowNegativeStock` está ativa, o valor também pode ser negativo;
quando está desativada, o formulário e a API exigem valor maior ou igual a zero.
A quantidade vendida pode aceitar até três casas decimais para produtos
fracionados. Quando `controlsStockProduct` é falso, o item e o pagamento são
persistidos normalmente, mas o estoque não é validado nem baixado. O campo
`printsKitchenProduct` fica disponível para o fluxo futuro de impressão de
cozinha.

Na barra de navegação de terceiro nível de **Cadastros > Produtos**, os
cadastros de **Tipo de Produto** e **Unidade tributável** ficam disponíveis
como submenus próprios. O formulário
de Produtos mantém Grupo e Operação fiscal de venda na mesma linha, e Tipo de
Produto e Unidade tributável na linha seguinte. Para novos produtos, o padrão
é **Mercadoria para Revenda** e **UN**, quando esses registros estiverem
disponíveis.

O cadastro de **Tipos de Produtos** possui o campo opcional **Código SPED**,
exibido como primeiro campo do formulário e primeira coluna da listagem. A API
normaliza o valor para maiúsculas, limita-o a 30 caracteres e preserva `NULL`
quando o tipo ainda não possui código informado. A coluna é criada em bases
novas pelo `schema.sql` e adicionada de forma idempotente em bases existentes.

### Cadastro de Fornecedores

Fornecedores são mantidos em uma tela própria no menu **Cadastros**. O
cadastro cobre pessoa jurídica e pessoa física, documento, razão social/nome,
nome fantasia, contato, telefone, e-mail, endereço completo, UF e observações.
O país não é solicitado na tela e a API mantém `Brasil` como padrão. CNPJ/CPF,
telefone e CEP recebem máscara durante a digitação; e-mails são normalizados
sem espaços e em minúsculas. O documento é armazenado sem máscara e possui
unicidade por tipo de pessoa; a interface apresenta o valor formatado.
Os dados retornados pelas consultas usam capitalização de palavras para
facilitar a revisão no formulário. No salvamento, a API preserva o texto
informado pelo operador, sem alterar maiúsculas e minúsculas.

No formulário de novo fornecedor, o botão ao lado do CNPJ consulta a BrasilAPI
e preenche razão social, nome fantasia, contato, telefone, e-mail e endereço
quando os dados estiverem disponíveis. O botão ao lado do CEP consulta o
ViaCEP e preenche logradouro, bairro, cidade e UF. As consultas são apenas
auxiliares: os dados retornados devem ser revisados antes do salvamento e uma
falha de consulta não impede o preenchimento manual.

A tabela `suppliers` é criada de forma idempotente pela API e já está definida
no `schema.sql`. A tela segue o padrão de listagem com pesquisa, edição em
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
O arquivo usa cabeçalho fixo e referencia grupo, operação fiscal, tipo de
produto e unidade pelos nomes já cadastrados. A API valida cada linha e grava
todo o lote em uma única transação; se uma linha falhar, nenhum produto do
lote é persistido.

Na tela **Matérias-primas**, um novo cadastro inicia com SKU `MP-`, sem operação
fiscal de venda, **Controla estoque** desmarcado e **Exibe no PDV** desmarcado.
O servidor também exige o prefixo `MP-` para produtos associados ao tipo
**Matéria-Prima**. Nas quatro telas de produto, ao desmarcar **Controla
estoque**, o campo de estoque fica somente leitura e desabilitado; o valor
existente é preservado ao salvar uma edição.

O cadastro é uma tela parametrizada por tipo de produto. **Produtos** é a
entrada do menu principal; **Matérias-primas**, **Embalagem** e **Material de
Uso e Consumo** ficam disponíveis na barra contextual dessa tela. Cada tela
envia o filtro `productType` para `GET /api/products`, fixa o tipo no
formulário e mantém o mesmo contrato de gravação. Isso permite adicionar
campos e regras específicas por tipo em uma etapa posterior sem duplicar a
camada de API. **Outros Insumos** não faz parte da navegação.

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

O cadastro de **Dados da Empresa** também mantém o ícone visual do aplicativo em
`projectIconMimeCompany` e `projectIconDataCompany`. A interface carrega esse
ícone em tempo de execução, usa-o no título das telas, atualiza o favicon e
aplica o mesmo arquivo à janela nativa do Tauri, refletindo-se na barra de
tarefas quando o sistema operacional aceitar a atualização. O ícone do
executável e do instalador continua sendo definido pelos arquivos empacotados
em `src-tauri/icons` e só muda em uma nova compilação.

As alterações usam `POST` e `PUT` em `/api/navigation/menus` e
`/api/navigation/items`. As chaves técnicas são geradas como slugs a partir dos nomes exibidos,
removendo acentos e convertendo espaços e pontuação em hífens. O servidor
aceita somente letras minúsculas, números e hífen; os nomes exibidos podem ser
alterados livremente dentro dos limites do banco. O frontend carrega somente menus e itens ativos, enquanto o
construtor consulta também os registros inativos para permitir manutenção.

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
└── Consulta de NFC-e
```

A tela **Configurações > Configurações Gerais** persiste regras operacionais na
tabela `general_settings`. O booleano `allowNegativeStock`, exibido como
**Permitir estoque negativo**, é criado somente quando o usuário salva a
configuração. A leitura e a alteração são feitas pela API em
`GET /api/general-settings` e `PUT /api/general-settings`.

O construtor exibe a árvore completa para facilitar a manutenção, mas não
transforma automaticamente uma barra contextual em submenu visual dentro do
menu principal. O terceiro nível continua sendo renderizado pela barra
contextual específica da tela, preservando a convenção do PDV.

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

O item **Cadastros > Financeiros** abre a primeira tela do grupo, **Formas de
pagamento**, e renderiza a barra contextual financeira. A empresa não pertence
mais a essa barra: seu cadastro fica exclusivamente em **Configurações > Dados
da Empresa**. Assim como em
**Cadastros > Produtos**, o título **Financeiros** é o item de entrada e os
cadastros financeiros são links da barra contextual. A barra é renderizada por
`src/catalog/financial-navigation.js`; novos cadastros devem ser acrescentados
nela e na navegação persistida, sem criar um menu principal paralelo.

A tela **Configurações > Dados da Empresa** mantém um único registro em
`company_settings`, identificado por `idCompanySetting = 1`, e reúne somente
identificação, endereço, contatos, e-mail, site, logotipo e ícone do aplicativo.
CNPJ ou CPF,
inscrição estadual, CNAE, CEP e telefones usam máscaras brasileiras; o CEP pode
consultar a base ViaCEP e preencher logradouro, bairro, cidade e UF. O campo de
logotipo aceita PNG, JPEG, WebP ou GIF de até 2 MB. O ícone do aplicativo aceita
os mesmos formatos até 512 KB e é carregado em tempo de execução. Ambos são
armazenados no servidor e retornados junto ao cadastro; o logotipo é destinado
a relatórios e cupons, enquanto o ícone atualiza o favicon e a identidade
visual das telas.

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

O cadastro de **Formas de pagamento** segue o padrão dos demais cadastros:
possui formulário de inclusão, edição por ícone de lápis e exclusão por ícone
de lixeira. Cada registro mantém o nome, a conta do Fluxo de Caixa
(**Banco** ou **Caixa**), os dias/prazo, a taxa de desconto e o acréscimo.
Desconto e acréscimo possuem valor e unidade independente, podendo ser
percentual ou valor fixo em reais. A API valida esses campos no servidor e a
tabela `payment_methods` recebe as colunas correspondentes por meio da
migração compatível executada por `ensurePaymentMethodSchema`.

### Contratos de configuração

`GET /api/company` e `PUT /api/company` trabalham no registro singleton
`company_settings` com `idCompanySetting = 1`. O cadastro valida tipo de
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
`@page size: 80mm`, e o botão de download gera o arquivo ESC/POS do layout
atual para testes controlados.

Esta etapa usa a camada Tauri para dois transportes diretos: rede TCP RAW,
normalmente na porta 9100, e USB por meio do driver instalado no Windows. No
USB, o conteúdo é renderizado como uma página GDI Unicode pelo driver da
impressora selecionada, permitindo que o spooler e o driver POS-80 controlem
largura, fonte e a comunicação com a porta USB. A rede continua usando bytes
ESC/POS, seleção de CP850, quebras `CRLF` e envio em blocos de 128 bytes com
uma pausa curta entre eles.

Para rede, informe o IP ou nome DNS e a porta RAW configurada no equipamento.
Para USB, a tela usa exclusivamente a impressora definida em
**Retaguarda > Configurações > Impressoras > Impressora padrão de Cupom**; não
há uma segunda seleção de impressora na montagem. Se nenhuma impressora de
Cupom estiver configurada, a impressão USB é bloqueada antes do envio.

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

O transporte USB usa o comando nativo legado `send_raw_print`, mas isso não
significa que a fila USB receba ESC/POS: quando `transport` é `usb`, o Rust
renderiza linhas estruturadas com GDI e o driver Windows; quando
`transport` é `network`, envia o payload ESC/POS por TCP. Alterações nesse
contrato devem atualizar simultaneamente a tela de montagem, o comando Tauri
e o renderizador Rust.

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
