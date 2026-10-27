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
- impressão de rede por TCP RAW/ESC-POS e impressão USB por GDI usando o driver
  da impressora configurada para Cupom no Windows;
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
- impressão térmica de 80 mm com modelo de cupom persistido no servidor.

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
- phpMyAdmin para administração opcional do banco;
- `node:test` para testes;
- ESC/POS para impressão térmica.

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

Compile o aplicativo desktop sem gerar instalador:

```powershell
npm.cmd run tauri -- build --no-bundle
```

O executável de desenvolvimento compilado é gerado em
`src-tauri\target\release\pdv.exe`. `dist/` e `src-tauri/target/` são artefatos
gerados e não devem ser versionados.

## Configuração do MariaDB

Importe `schema.sql` pelo phpMyAdmin ou pelo cliente `mariadb`. O script cria o
banco `pdv`, as tabelas iniciais e as formas de pagamento padrão.

Crie um usuário exclusivo para a API, substituindo a senha demonstrativa por
uma senha forte definida localmente:

```sql
CREATE USER 'pdv_app'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
GRANT SELECT, INSERT, UPDATE, DELETE ON pdv.* TO 'pdv_app'@'localhost';
FLUSH PRIVILEGES;
```

Copie o arquivo de exemplo:

```powershell
Copy-Item .env.example .env
```

Preencha `.env` somente localmente:

```text
PDV_API_HOST=0.0.0.0
PDV_API_PORT=3000
PDV_DB_HOST=127.0.0.1
PDV_DB_PORT=3306
PDV_DB_NAME=pdv
PDV_DB_USER=pdv_app
PDV_DB_PASSWORD=(senha definida localmente)
```

O arquivo `.env` é ignorado pelo Git. Nunca envie sua senha pelo chat, Git,
logs ou screenshots.

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
  sales/                   # Tela e fluxo inicial de venda
  catalog/                 # Telas administrativas de classes, grupos e produtos
  shared/                  # Regras compartilhadas de domínio
  server/                  # API, configuração e acesso ao MariaDB
src-tauri/
  src/                     # Camada nativa do aplicativo desktop
  tauri.conf.json          # Configuração do Tauri
schema.sql                 # Schema inicial do MariaDB
tests/                     # Testes automatizados
docs/                      # Documentação operacional
```

Convenção: novos testes devem ser criados em `tests/` e novas documentações
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
| `GET` | `/api/fiscal-catalogs?catalog=...` | Lista itens de um cadastro fiscal |
| `GET` | `/api/ncm-cest/ncms` | Lista NCMs ativos |
| `GET` | `/api/ncm-cest/cests` | Lista CESTs ativos |
| `GET` | `/api/ncm-cest` | Lista relações NCM / CEST |
| `GET` | `/api/ncm-cest/options?ncm=...` | Lista CESTs relacionados a um NCM |
| `GET` | `/api/ncm-cest/update-status` | Consulta o histórico da atualização NCM / CEST |
| `GET` | `/api/printer-settings` | Consulta impressoras padrão e modelo do cupom |
| `POST` | `/api/classes` | Cria uma classe |
| `POST` | `/api/groups` | Cria um grupo vinculado a uma classe |
| `POST` | `/api/products` | Cadastra um produto |
| `POST` | `/api/ncm-cest` | Cria uma relação NCM / CEST |
| `POST` | `/api/ncm-cest/update` | Atualiza os catálogos NCM / CEST |
| `POST` | `/api/fiscal-operations` | Cadastra uma operação fiscal |
| `POST` | `/api/fiscal-catalogs` | Cadastra um item de catálogo fiscal |
| `POST` | `/api/sales` | Registra uma venda, pagamentos e baixa o estoque |
| `POST` | `/api/company/nfce/diagnostic` | Gera XML NFC-e assinado sem transmitir |
| `POST` | `/api/company/nfce/test` | Testa autorização NFC-e somente em homologação |

Na frente de caixa, use **Retaguarda** para abrir a tela
administrativa. O cadastro exige nome, SKU, grupo, preço e estoque inicial.
O backend valida os dados e rejeita SKU ou código de barras duplicados.

Na retaguarda, o controle de Status inativa ou reativa classes, grupos e
produtos. A lixeira faz a exclusão definitiva quando não há produtos ou vendas
vinculados que impeçam a remoção. Use o Status para preservar registros que
precisam permanecer no histórico.

Em **Operações fiscais**, cada lista possui seu próprio cadastro persistido no
MariaDB. CFOP, CST/CSOSN, alíquotas de ICMS, regimes, contextos, origens,
situações tributárias de IPI/PIS/COFINS, modalidades de base e motivos de
desoneração são administrados em telas separadas e consumidos pela tela da
operação fiscal.

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
cria um segundo registro. Nesta primeira versão, quantidades fracionadas são
rejeitadas até que o cadastro de produtos tenha uma regra explícita para esse
comportamento.

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

## Impressão térmica

A tela **Retaguarda > Ferramentas > Impressão térmica** permite montar e
persistir o modelo do cupom em `printer_settings.receiptLayoutPrinterSetting`.
O modelo contém linhas de campos, textos livres e divisores. Linhas de texto
podem usar `Courier New`, `Arial`, `Consolas`, `Segoe UI`, `Tahoma` ou
`Verdana`, com tamanhos entre 9 px e 28 px, alinhamento e negrito.

No transporte USB, a tela usa exclusivamente a impressora definida em
**Retaguarda > Configurações > Impressoras > Impressora padrão de Cupom**. O
Tauri renderiza o cupom por GDI através do driver Windows; não envia ESC/POS
para a fila USB. No transporte de rede, o Tauri envia ESC/POS por TCP RAW,
normalmente na porta 9100. O caminho de impressão não confirma vendas: a venda
deve estar persistida antes da impressão e uma falha de impressão não pode
duplicar a operação.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm.cmd run dev` | Inicia o frontend Vite |
| `npm.cmd run api` | Inicia a API Node.js |
| `npm.cmd run build` | Compila o frontend |
| `npm.cmd test` | Executa os testes com `node:test` |
| `npm.cmd exec tauri info` | Verifica o ambiente nativo |
| `npm.cmd run tauri -- build --no-bundle` | Compila o aplicativo Tauri |

Validação padrão:

```powershell
npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check
```

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
- O servidor ainda não possui script oficial de publicação.

Consulte:

- [Convenções de desenvolvimento](docs/DEVELOPMENT.md)
- [Ferramentas e assistência de IA](docs/AI-TOOLS.md)
- [Automações](docs/AUTOMATIONS.md)
- [Prompts das automações](docs/AUTOMATION-PROMPTS.md)
- [Prompt de continuidade](docs/CONTINUITY-PROMPT.md)
- [Instalação e publicação](docs/DEPLOYMENT.md)
