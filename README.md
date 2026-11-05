# PDV

Sistema de ponto de venda comercial para desktop, com operação centralizada
em rede local e impressão em impressoras térmicas de 80 mm.

## Arquitetura

O PDV usa um computador servidor na loja:

```text
Computador servidor
├── MariaDB Server
├── API Node.js
└── phpMyAdmin opcional

Computadores dos caixas
└── Aplicativo desktop Tauri
```

Os terminais acessam somente a API pela rede local. Eles não recebem
credenciais do MariaDB e não executam SQL diretamente.

## Estado atual

A fundação inicial já está criada:

- tela de frente de caixa em Vite;
- catálogo carregado pela API a partir do MariaDB;
- tela administrativa para cadastro de produtos;
- tela administrativa independente para classes;
- tela administrativa independente para grupos;
- tela administrativa independente para produtos;
- cadastro de operações fiscais com CFOP, CST, ICMS, IPI, PIS, COFINS e FCP;
- cadastros fiscais separados e persistidos para CFOP, CST/CSOSN, alíquotas de ICMS e demais listas das operações;
- editor de montagem de cupons de 80 mm na Retaguarda, com campos ordenáveis,
  textos livres, divisores, preview e formatação por linha;
- impressão direta por GDI usando o driver da impressora configurada para
  Cupom no Windows;
- seleção de fonte e tamanho em px por linha, com alinhamento e negrito
  aplicados também no caminho USB/GDI;
- busca e filtro por categoria;
- carrinho com quantidades;
- subtotal e total da venda;
- módulo compartilhado para cálculo dos totais;
- testes unitários iniciais;
- API Node.js com `GET /api/health`;
- API inicial com `GET /api/products`, incluindo o nome da categoria;
- endpoint transacional `POST /api/sales` com baixa de estoque;
- schema MariaDB para categorias, produtos, vendas, itens, pagamentos e formas
  de pagamento;
- schema MariaDB para operações fiscais, com contextos estaduais e IBS/CBS;
- projeto Tauri 2 compilável no Windows;
- configuração de empresa e NFC-e, incluindo diagnóstico local e teste de
  autorização em homologação;
- catálogos NCM/CEST persistidos e atualização controlada pela API;
- Receitas de Produção e Composições de Produto independentes de Produto
  comercial, com componentes, perdas, custos e revisões persistidos;
- vínculos quantificados entre Produtos comerciais e Receitas ou Composições;
- marcação de Produto Buffet, cuja venda não baixa estoque nem bloqueia o
  fechamento de caixa;
- impressão térmica de 80 mm com modelo de cupom persistido no servidor.
- visualização de cadastros por seleção da linha, com preenchimento do
  formulário e bloqueio das ações de gravação durante a consulta.
- retaguarda configurável com menus, submenus, barras contextuais, atalhos,
  descrições editáveis e proteção dos menus técnicos;
- configuração geral para permitir ou bloquear estoque negativo;
- tela de Status da API com reinício controlado e log visual;
- backup e restauração compactados do banco em Ferramentas;
- editor de ícone da empresa aplicado em runtime ao frontend e à janela Tauri.

O catálogo da interface depende da API e pode aparecer vazio até que produtos
sejam cadastrados no MariaDB. Uma venda só será considerada persistida quando o
endpoint de venda confirmar uma transação completa no MariaDB.

## Stack

- Node.js 22 ou superior;
- JavaScript com módulos ES;
- Vite;
- Tauri 2;
- Rust e Cargo;
- Visual Studio Build Tools com MSVC e Windows SDK;
- MariaDB Server;
- `mysql2`;
- DBeaver para administração opcional do banco;
- `node:test` para testes;
- impressão térmica pelo driver do Windows e pelo diálogo do sistema.

## Requisitos de desenvolvimento

- Node.js e npm;
- Rust e Cargo;
- WebView2;
- Visual Studio Build Tools com:
  - MSVC para C++ x64/x86;
  - Windows SDK;
- MariaDB Server quando for validar a persistência;
- phpMyAdmin opcional.

Verifique o ambiente Tauri com:

```powershell
npm.cmd exec tauri info
```

## Instalação

Instale as dependências:

```powershell
npm.cmd install
```

Inicie a interface:

```powershell
npm.cmd run dev
```

Gere o build web:

```powershell
npm.cmd run build
```

O comando `npm.cmd run build` aciona o versionamento automático antes de
compilar. `npm.cmd run release:client` também o aciona antes de gerar o
instalador. A classificação usa `patch` por padrão, `minor` somente com
`MINOR CHANGE:` ou `MINOR_CHANGE:`, e `major` somente com `BREAKING CHANGE:`
ou `BREAKING_CHANGE:`. A versão é sincronizada em `package.json`,
`package-lock.json` e `src-tauri\tauri.conf.json`, e passa a ser usada no
próximo artefato Tauri. O mesmo conjunto de alterações pendentes não é
incrementado novamente antes do commit.

O memorial das alterações de cada versão está em
[`docs/CHANGELOG.md`](docs/CHANGELOG.md). Consulte esse arquivo para saber o
que mudou entre uma versão e outra.

Compile o aplicativo desktop sem gerar instalador:

```powershell
npm.cmd run tauri -- build --no-bundle
```

O executável de desenvolvimento compilado é gerado em
`src-tauri\target\release\pdv.exe`. `dist/` e `src-tauri/target/` são artefatos
gerados e não devem ser versionados.

Para iniciar o Tauri em desenvolvimento no Windows sem abrir as janelas de
terminal usadas pelo `npm` e pelo Cargo, execute `pdv.vbs` com o Windows
Script Host. Esse launcher chama diretamente o CLI Tauri pelo Node, evitando
uma camada extra do `npm` e reduzindo o tempo de entrada. O arquivo `pdv.cmd`
continua disponível para diagnóstico quando for necessário acompanhar os logs
no console. Em produção, abra o executável Tauri instalado; ele já é
construído sem janela de console.

## Configuração do MariaDB

Para uma instalação limpa do servidor Windows, execute o instalador
automatizado. Ele cria o banco, o usuário da API, os segredos, o `.env`
operacional, o serviço Windows e as permissões necessárias:

```powershell
npm.cmd run install:windows-api
```

Durante a execução, informe a senha administrativa do MariaDB no prompt
oculto. Não é necessário copiar `.env`, gerar token ou executar SQL
manualmente. A instalação nova não recebe cargas automáticas de menus,
empresa, formas de pagamento, tipos, unidades, catálogos fiscais ou
configurações; esses registros devem ser cadastrados explicitamente.

Para desenvolvimento ou instalação manual, o `.env` deve conter:

```text
PDV_API_HOST=0.0.0.0
PDV_API_PORT=3000
PDV_API_TOKEN=(token forte compartilhado somente com os terminais autorizados)
PDV_API_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,tauri://localhost,http://tauri.localhost
PDV_DB_HOST=127.0.0.1
PDV_DB_PORT=3306
PDV_DB_NAME=pdv
PDV_DB_USER=pdv_app
# Somente para bootstrap/desenvolvimento; em produção Windows use o Credential Manager.
PDV_DB_PASSWORD=(senha definida localmente)
PDV_CERTIFICATE_ENCRYPTION_KEY=(chave base64 local de 32 bytes)
PDV_NCM_SOURCE_URL=(opcional; fonte oficial de NCM)
PDV_CEST_SOURCE_URL=(opcional; fonte de CEST)
```

O arquivo `.env` é ignorado pelo Git. Nunca envie senha, chave de criptografia,
certificado, token, XML assinado ou qualquer outro segredo pelo chat, Git,
logs ou screenshots. `PDV_CERTIFICATE_ENCRYPTION_KEY` é necessária para
armazenar certificados A1 e executar os testes NFC-e.

A API exige `PDV_API_TOKEN` em todas as rotas `/api`. O cliente de
desenvolvimento deve usar `VITE_PDV_API_TOKEN`; em uma distribuição Tauri,
informe o mesmo segredo localmente com `--api-token` ou
`VITE_PDV_API_TOKEN`. No terminal Windows, o token é protegido pelo DPAPI e
não fica armazenado em texto claro no `offline-config.json`. Não registre esse
token no metadata da release.

O instalador automatizado provisiona a senha do MariaDB no Credential Manager.
Os terminais nunca recebem `PDV_DB_PASSWORD`; recebem somente a URL da API e o
token de API protegido pelo DPAPI.

O `offline-config.json` pertence exclusivamente ao terminal Tauri e armazena
preferências locais, atualmente `apiUrl` e `backupDirectory`. Ele não deve
receber `PDV_DB_HOST`, `PDV_DB_PORT`, `PDV_DB_NAME`, `PDV_DB_USER`,
`PDV_DB_PASSWORD`, `PDV_CERTIFICATE_ENCRYPTION_KEY`, URLs de fontes fiscais ou
configurações da API. O token do terminal fica em `api-token.bin`, protegido
pelo DPAPI, e não em texto claro nesse JSON.

### Dump para migração ao MariaDB

Foi gerado localmente o dump lógico:

```text
backups\pdv-migration-20261024.sql
```

O arquivo contém a estrutura e os dados atuais do banco `pdv`, com codificação
`utf8mb4`. Ele não contém usuários do MariaDB, permissões, certificados ou
senhas. A pasta `backups/` é ignorada pelo Git e não deve ser publicada.

Para importar em uma instalação MariaDB, use um usuário administrador:

```powershell
mariadb -u root -p < backups\pdv-migration-20261024.sql
```

Depois da importação, crie um usuário técnico separado para a API e configure
o `.env` do novo servidor. O dump representa o estado existente no momento da
geração; migrações posteriores devem ser aplicadas separadamente.

Inicie a API:

```powershell
npm.cmd run api
```

Sempre que houver alteração em `src/server/`, reinicie o processo da API antes
de testar pelo frontend. A interface não deve ser validada contra uma instância
antiga que permaneça ouvindo na porta `3000`.

Em uma instalação publicada como serviço Windows, use `api.cmd` na raiz do
checkout, em um terminal com privilégios de administrador, para parar e iniciar
novamente o serviço `PDV-API`. O procedimento completo está em
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Valide no servidor:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Resposta esperada:

```json
{"ok":true,"database":"connected"}
```

## Rede local

Libere a porta `3000` no Firewall do Windows somente para a rede privada da
loja. Não exponha a API diretamente à internet.

Não libere a porta `3306` para os terminais. Eles devem acessar:

```text
http://IP_DO_SERVIDOR:3000
```

Teste a partir de um terminal:

```powershell
Test-NetConnection IP_DO_SERVIDOR -Port 3000
Invoke-RestMethod http://IP_DO_SERVIDOR:3000/api/health
```

## Estrutura do projeto

```text
index.html                 # Entrada do frontend
src/
  main.js                  # Bootstrap da interface
  styles.css               # Estilos da aplicação
  backoffice/               # Tela inicial da Retaguarda
  sales/                   # Tela e fluxo inicial de venda
  catalog/                 # Telas administrativas de classes, grupos e produtos
  settings/                # Configurações e Construtor de navegação
  tools/                   # Ferramentas operacionais e Views
  ui/                      # Componentes visuais e navegação compartilhada
  shared/                  # Regras compartilhadas de domínio
  server/                  # API, configuração e acesso ao MariaDB
src-tauri/
  src/                     # Camada nativa do aplicativo desktop
  tauri.conf.json          # Configuração do Tauri
database/
  schema.sql               # Schema inicial do MariaDB
scripts/
  migrations/              # Migrações idempotentes do banco
tests/
  unit/                    # Regras isoladas e modelos
  integration/             # API, banco e contratos HTTP
docs/                      # Documentação operacional
```

Convenção: novos testes devem ser criados em `tests/unit/` ou
`tests/integration/`, conforme o nível do contrato. Novas documentações
operacionais ou decisões técnicas devem ser criadas em `docs/`. Consulte
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) antes de adicionar arquivos
auxiliares ao projeto.

## API atual

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | Verifica a API e a conexão com o MariaDB |
| `GET` | `/api/products` | Lista produtos ativos |
| `GET` | `/api/classes` | Lista classes ativas |
| `GET` | `/api/groups` | Lista grupos ativos com sua classe |
| `GET` | `/api/payment-methods` | Lista formas de pagamento ativas |
| `GET` | `/api/fiscal-operations` | Lista operações fiscais |
| `GET` | `/api/product-types` | Lista tipos de produto ativos, ordenados por Código SPED |
| `GET` | `/api/suppliers` | Lista fornecedores ativos |
| `GET` | `/api/units` | Lista unidades tributáveis ativas |
| `GET` | `/api/fiscal-catalogs?catalog=...` | Lista itens de um cadastro fiscal |
| `GET` | `/api/ncm-cest/ncms` | Lista NCMs ativos |
| `GET` | `/api/ncm-cest/cests` | Lista CESTs ativos |
| `GET` | `/api/ncm-cest` | Lista relações NCM / CEST |
| `GET` | `/api/ncm-cest/options?ncm=...` | Lista CESTs relacionados a um NCM |
| `GET` | `/api/ncm-cest/update-status` | Consulta o histórico da atualização NCM / CEST |
| `GET` | `/api/printer-settings` | Consulta impressoras padrão e modelo do cupom |
| `GET` | `/api/general-settings` | Consulta configurações operacionais |
| `GET` | `/api/navigation` | Consulta a navegação publicada |
| `GET` | `/api/navigation?includeInactive=1` | Consulta a navegação completa para manutenção |
| `GET` | `/api/recipes` | Lista Receitas e Composições com seus componentes |
| `GET` | `/api/recipe-reviews` | Lista revisões pendentes de Fichas |
| `GET` | `/api/product-recipes?productId=...` | Consulta vínculos de Receitas de um Produto |
| `POST` | `/api/classes` | Cria uma classe |
| `POST` | `/api/groups` | Cria um grupo vinculado a uma classe |
| `POST` | `/api/products` | Cadastra um produto |
| `POST` | `/api/product-types` | Cadastra um tipo de produto e seu Código SPED opcional |
| `POST` | `/api/suppliers` | Cadastra um fornecedor |
| `POST` | `/api/units` | Cadastra uma unidade tributável |
| `POST` | `/api/ncm-cest` | Cria uma relação NCM / CEST |
| `POST` | `/api/ncm-cest/update` | Atualiza os catálogos NCM / CEST |
| `POST` | `/api/fiscal-operations` | Cadastra uma operação fiscal |
| `POST` | `/api/fiscal-catalogs` | Cadastra um item de catálogo fiscal |
| `POST` | `/api/recipes` | Cria uma Receita ou Composição com componentes |
| `PUT` | `/api/product-recipes` | Substitui os vínculos de Receitas de um Produto |
| `POST` | `/api/sales` | Registra uma venda e pagamentos; baixa o estoque somente para itens controlados |
| `POST` | `/api/company/nfce/diagnostic` | Gera XML NFC-e assinado sem transmitir |
| `POST` | `/api/company/nfce/test` | Testa autorização NFC-e somente em homologação |

As rotas de cadastro usam `POST` para inclusão, `PUT` para edição e
`DELETE` para exclusão quando a tela oferece essa operação. Classes, grupos,
produtos, formas de pagamento, catálogos fiscais, operações fiscais e
relações NCM/CEST também possuem rotas de status ou consulta com
`includeInactive=1`. O backend valida os dados antes do SQL e retorna erro
explícito quando há duplicidade, vínculo que impede exclusão ou payload
incompatível. Em Tipos de Produtos, `codeSpedProductType` é opcional, limitado
a 30 caracteres, normalizado para maiúsculas e usado como primeiro critério de
ordenação; registros sem código aparecem ao final.

Fornecedores usam `typeSupplier` (`juridica` ou `fisica`) e documento único por
tipo. A API valida o tamanho do documento, e-mail quando informado, UF e os
campos obrigatórios antes de persistir o cadastro.

O formulário aplica máscaras de CNPJ/CPF, telefone e CEP, oferece consulta
auxiliar de CNPJ pela BrasilAPI e de CEP pelo ViaCEP, inclusive na edição, e
apresenta os dados retornados em maiúsculas, preservando a acentuação. As
consultas não substituem a revisão do operador; no salvamento, os campos
textuais humanos são normalizados para maiúsculas pela API.

As configurações de empresa e NFC-e são separadas: `/api/company` mantém os
dados cadastrais e `/api/company/nfce` mantém os parâmetros fiscais. Os campos
textuais de Dados da Empresa preservam a capitalização digitada; a
normalização automática para maiúsculas permanece restrita aos cadastros que
exigem essa convenção. A API não devolve o conteúdo do certificado A1 nem sua
senha. A configuração de
impressoras em `/api/printer-settings` contém somente os nomes das filas e o
modelo do cupom; o layout persistido não contém dados reais de venda.

Na frente de caixa, use **Retaguarda** para abrir a tela administrativa. O
cadastro de Produtos usa **Código PDV** (a migração preserva a antiga coluna de
código de barras), operação fiscal de venda, tipo de produto, unidade
tributável, preço e estoque. Os tipos e unidades são mantidos nas tabelas
`product_types` e `units`, cadastrados explicitamente pela loja. Os flags
**Controla estoque**, **Produto fracionado**, **Imprime cozinha** e **Exibe no
PDV** também são
persistidos; o estoque inicial aceita apenas inteiros em produtos não fracionados
e até três casas decimais em produtos fracionados, a venda pode usar quantidades
fracionadas quando habilitada, e produtos sem controle de estoque não geram baixa.
O backend valida os dados e rejeita SKU ou Código PDV duplicados.

O cadastro usa quatro telas especializadas: **Produtos** (Mercadoria para
Revenda), **Matérias-primas**, **Embalagem** e **Material de Uso e Consumo**.
Somente **Produtos** aparece como item do menu principal; as outras três telas
ficam disponíveis na barra contextual de Produtos. Cada tela fixa o tipo
correspondente e lista somente os produtos daquele tipo, mantendo o mesmo
contrato da API para que os campos diferenciais sejam adicionados
progressivamente. **Outros Insumos** não faz parte da navegação.

Em **Configurações > Configurações Gerais**, a regra **Permitir estoque
negativo** é persistida em `general_settings` e começa habilitada para a base.

O cadastro de **Classes** exige uma Operação Fiscal ativa, disponibilizada em
um campo de seleção e exibida também na listagem. A listagem de **Grupos**
começa ordenada alfabeticamente pela descrição do grupo.

Na retaguarda, o controle de Status inativa ou reativa classes, grupos e
produtos. A lixeira faz a exclusão definitiva quando não há produtos ou vendas
vinculados que impeçam a remoção. Use o Status para preservar registros que
precisam permanecer no histórico.

Em **Operações fiscais**, cada lista possui seu próprio cadastro persistido no
MariaDB. CFOP, CST/CSOSN, alíquotas de ICMS, regimes, contextos, origens,
situações tributárias de IPI/PIS/COFINS, modalidades de base e motivos de
desoneração são administrados em telas separadas e consumidos pela tela da
operação fiscal.

Em **Cadastros > Ficha Técnica > Receitas e Composições**, uma Receita de
Produção ou Composição de Produto recebe nome próprio e pode usar Produtos ou
outras Receitas como componentes. O Produto comercial não é obrigatório para
criar a estrutura; o vínculo é definido posteriormente no cadastro do Produto,
com quantidade e perda. Produtos marcados como **Produto Buffet** registram a
venda pelo preço cadastrado sem baixar estoque e sem exigir Cardápio para o
fechamento do caixa.

Exemplo de fechamento de venda:

```json
{
  "clientIdSale": "8d6f4c2a-2d1f-4b7f-9e10-123456789abc",
  "items": [
    { "idProduct": 1, "quantitySaleItem": 2 }
  ],
  "payments": [
    { "idPaymentMethod": 1, "amountSalePayment": "11.00" }
  ],
  "discountSale": "0.00"
}
```

O `clientIdSale` funciona como chave de idempotência: repetir a mesma venda não
cria um segundo registro. Quantidades fracionadas são aceitas somente quando o
produto está marcado como fracionado; produtos não fracionados continuam
limitados a quantidades inteiras. O estoque negativo depende da configuração
**Permitir estoque negativo**.

As próximas rotas devem ser específicas por operação, usar SQL parametrizado e
confirmar a transação antes de atualizar visualmente o frontend.

## Regras de venda e persistência

- Uma venda sem itens deve ser rejeitada.
- Preços e quantidades devem ser validados no servidor.
- Estoque e pagamentos devem ser atualizados em uma transação MariaDB.
- Falhas devem fazer rollback e retornar erro explícito.
- O nome e o preço do produto devem ser preservados no item da venda.
- Vendas canceladas não devem ser apagadas fisicamente sem regra de auditoria.
- O frontend só confirma uma operação após sucesso da API.
- Uma falha de impressão não pode duplicar uma venda já confirmada.

## Construtor do menu principal

Em **Retaguarda > Configurações > Impressoras > Construtor de menu**, é
possível administrar a navegação persistida do sistema: nomes dos menus,
itens, submenus, barras contextuais, rotas, ordem, ativação e a exibição de
atalhos na tela inicial da Retaguarda, incluindo o texto descritivo exibido
abaixo de cada atalho. A configuração é
armazenada nas tabelas `navigation_menus` e `navigation_items` e aplicada pelo
frontend ao iniciar o terminal.

Os menus técnicos **Ferramentas** (`tools`) e **Configurações** (`settings`),
incluindo seus itens e submenus, permanecem sempre ativos e não podem ser
desativados pelo construtor.

O construtor gera as chaves técnicas como slugs a partir do nome exibido,
valida o formato no servidor e desativa registros em vez
de removê-los fisicamente. A estrutura continua respeitando três níveis:
menu principal, item do menu e barra contextual. Assim, itens como **Classes**,
**Grupos** e **NCM / CEST** permanecem na barra contextual de **Produtos**, sem
criar um submenu visual incompatível com a navegação do PDV.

Itens ativos são conectados automaticamente pelo `keyNavigationItem`. Quando
essa chave representar um alias visual diferente da rota cadastrada, a rotina
também tenta `routeNavigationItem`. Dessa forma, novos itens e submenus podem
reutilizar telas existentes sem alterações manuais na Retaguarda; apenas rotas
que não possuem handler registrado precisam de uma nova implementação.

As telas administrativas usam um painel introdutório comum com categoria,
título e descrição funcional. O painel ocupa a linha inteira quando a tela
combina introdução com formulário ou listagem e mantém espaçamento visual
antes do conteúdo seguinte. Esse padrão também é aplicado a Dados da Empresa,
Operações Fiscais, Atualizar NCM / CEST, Importar cadastros, Impressão térmica,
Consulta de NFC-e e Configuração NFC-e.

## Impressão térmica

A tela **Retaguarda > Ferramentas > Impressão térmica** permite montar e
persistir o modelo do cupom em `printer_settings.receiptLayoutPrinterSetting`.
O modelo contém linhas de campos, textos livres e divisores. Linhas de texto
podem usar `Courier New`, `Arial`, `Consolas`, `Segoe UI`, `Tahoma` ou
`Verdana`, com tamanhos entre 9 px e 28 px, alinhamento e negrito.

A tela usa exclusivamente a impressora definida em
**Retaguarda > Configurações > Impressoras > Impressora padrão de Cupom**. O
Tauri renderiza o cupom por GDI através do driver Windows. A pré-visualização
usa o diálogo de impressão do sistema. O caminho de impressão não confirma
vendas: a venda deve estar persistida antes da impressão e uma falha de
impressão não pode duplicar a operação.

## Estado fiscal e NFC-e

O cadastro de operações fiscais e seus catálogos é parametrização: CFOP,
CST/CSOSN, ICMS, IPI, PIS/COFINS, FCP, origem, regime, contexto, bases e
desoneração ficam persistidos para serem usados pelo futuro fluxo fiscal.
Essa parametrização, sozinha, não significa que toda venda já seja emitida
como NFC-e.

A configuração atual gera XML assinado e executa teste de autorização somente
em homologação. O fluxo comercial completo ainda precisa persistir a
numeração autorizada, XML e protocolo, além de implementar cancelamento,
inutilização, consulta, contingência, reenvio e impressão pós-autorização antes
de ser considerado pronto para produção.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm.cmd run dev` | Inicia o frontend Vite |
| `npm.cmd run api` | Inicia a API Node.js |
| `npm.cmd run build` | Compila o frontend |
| `npm.cmd test` | Executa os testes com `node:test` |
| `npm.cmd run migrate:culinary-units` | Cria/atualiza referências culinárias |
| `npm.cmd run migrate:uppercase` | Normaliza textos humanos existentes no MariaDB |
| `npm.cmd run release:client -- --api-url=...` | Gera instaladores MSI/EXE com a API informada |
| `npm.cmd exec tauri info` | Verifica o ambiente nativo |
| `npm.cmd run tauri -- build --no-bundle` | Compila o aplicativo Tauri |

Validação mínima:

```powershell
npm.cmd test
git diff --check
```

Execute `npm.cmd run build` quando a alteração envolver o bundle do frontend,
configuração Vite/Tauri, versionamento ou quando uma validação de produção for
necessária. Para alterações em JavaScript, use também `node --check` nos
arquivos modificados. Não é necessário recompilar o projeto inteiro a cada
alteração.

`app.js` e `server.js` não existem na raiz deste repositório; o frontend é
iniciado por Vite e a API fica em `src/server/server.js`.

## Segurança e arquivos protegidos

Nunca versione ou envie:

- `.env`;
- senhas, tokens e chaves privadas;
- dados reais de clientes, vendas ou estoque;
- dumps e backups do MariaDB;
- `node_modules/`;
- `dist/`;
- `src-tauri/target/`.

O banco de produção deve possuir backup verificável antes de alterações de
schema ou migrações. Não execute `DROP`, `TRUNCATE` ou migração destrutiva sem
estratégia de recuperação e autorização explícita.

## Diretrizes operacionais

- O checkout de desenvolvimento é a fonte única.
- As automações pertencem ao projeto `pdv`.
- As automações são manuais, locais e usam workspace `branch`.
- Não use worktrees, cópias temporárias ou checkouts alternativos nas
  automações.
- Não configure `remote_branch` em ambiente local.
- Push direto é permitido somente para `main`, quando autorizado.
- Nunca use `--force`, `--force-with-lease` ou exclusão de branch.
- Não faça commit, push, merge ou deploy por inferência.
- A instalação limpa e a publicação inicial recomendadas usam
  `scripts/install-windows-api.ps1`, ou `npm.cmd run install:windows-api`.
  O script solicita apenas a senha administrativa do MariaDB e executa as
  etapas restantes automaticamente.

Consulte:

- [Convenções de desenvolvimento](docs/DEVELOPMENT.md)
- [Histórico completo do projeto](docs/PROJECT-HISTORY.md)
- [Ferramentas e assistência de IA](docs/AI-TOOLS.md)
- [Automações](docs/AUTOMATIONS.md)
- [Prompts das automações](docs/AUTOMATION-PROMPTS.md)
- [Automação de consolidação documental](docs/AUTOMATIONS.md#consolidar-documentação-do-pdv)
- [Prompt de continuidade](docs/CONTINUITY-PROMPT.md)
- [Instalação e publicação](docs/DEPLOYMENT.md)
- [Instalação automatizada da API no Windows](scripts/install-windows-api.ps1)
- [Instalação compatível do serviço Windows](scripts/install-windows-service.ps1)
- [Publicação da API como serviço dedicado](scripts/publish-windows-api-service.ps1)

O executável Tauri local consulta a API em `http://127.0.0.1:3000`. Para um
terminal apontar para o servidor da loja durante a compilação, prefira:

```powershell
npm.cmd run release:client -- --api-url=http://IP_DO_SERVIDOR:3000
```

Para um build Tauri sem o fluxo de distribuição, ainda é possível definir
`VITE_PDV_API_URL` antes de executar `npm.cmd run tauri -- build`.

O teste de emissão NFC-e no servidor também requer o OpenSSL instalado. A
instalação do serviço Windows detecta o executável e configura
`PDV_OPENSSL_PATH` automaticamente.
