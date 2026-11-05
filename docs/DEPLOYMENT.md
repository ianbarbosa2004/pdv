# Instalação e publicação na rede local

Este documento descreve a operação do **PDV** com um único computador servidor
na loja. O servidor hospeda o MariaDB e a API Node.js; os terminais executam o
aplicativo Tauri e acessam somente a API pela rede local.

```text
Computador servidor
├── MariaDB Server
├── API Node.js do PDV
└── phpMyAdmin opcional

Computadores dos caixas
└── Aplicativo PDV/Tauri
```

## Requisitos do servidor

- Windows com usuário administrativo para instalar serviços;
- Node.js 22 ou superior;
- MariaDB Server em execução;
- Rust, Cargo, MSVC e Windows SDK somente se o servidor também compilar o
  aplicativo Tauri;
- IP local fixo ou reserva DHCP;
- firewall configurado para permitir a API somente na rede privada.

O phpMyAdmin é uma ferramenta administrativa opcional. A API usa diretamente
o MariaDB por meio do pacote `mysql2`, compatível com o protocolo do MariaDB.

## Configuração do banco

Na instalação limpa, `scripts/install-windows-api.ps1` cria o banco, o usuário
exclusivo da API e aplica `database/schema.sql` por meio do fluxo de instalação.
Não há cargas automáticas de menus, cadastros, empresa, formas de pagamento ou
configurações.

Para manutenção manual ou desenvolvimento, o banco pode ser preparado com:

```sql
CREATE USER 'pdv_app'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
GRANT SELECT, INSERT, UPDATE, DELETE ON pdv.* TO 'pdv_app'@'localhost';
FLUSH PRIVILEGES;
```

Se a API e o MariaDB permanecerem no mesmo computador, mantenha o host do banco
como `127.0.0.1`. Não conceda acesso administrativo à aplicação e não
distribua a senha do MariaDB aos terminais.

## Configuração da API

Para uma instalação limpa, use o instalador automatizado. Ele cria o
`C:\ProgramData\PDV\app\.env`, gera o `PDV_API_TOKEN`, cria o usuário da API no
MariaDB, provisiona a senha no Credential Manager, instala o serviço Windows e
inicia a API. Não é necessário copiar `.env` nem gerar token manualmente.

Durante a execução, o instalador solicita a senha administrativa existente do
MariaDB em um campo oculto. Ela não é escrita em argumentos, variáveis de
ambiente ou arquivos permanentes:

```powershell
.\scripts\install-windows-api.ps1
```

Essa é a única credencial que precisa ser fornecida durante a instalação; os
demais segredos são gerados automaticamente.

Configuração mínima:

```text
PDV_API_HOST=0.0.0.0
PDV_API_PORT=3000
PDV_API_TOKEN=(token forte compartilhado somente com os terminais autorizados)
PDV_API_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,tauri://localhost,http://tauri.localhost
PDV_DB_HOST=127.0.0.1
PDV_DB_PORT=3306
PDV_DB_NAME=pdv
PDV_DB_USER=pdv_app
PDV_DB_PASSWORD=(senha definida localmente)
PDV_CERTIFICATE_ENCRYPTION_KEY=(chave base64 local de 32 bytes)
PDV_NCM_SOURCE_URL=(opcional)
PDV_CEST_SOURCE_URL=(opcional)
```

O bloco acima serve apenas como referência para instalações manuais ou
desenvolvimento. A instalação limpa automatizada não exige a criação desse
arquivo no checkout.

O instalador automatizado provisiona a senha do MariaDB no Credential Manager.
O script auxiliar `set:database-credential` permanece disponível para
manutenção manual e desenvolvimento, mas não faz parte da instalação limpa.
As dependências Node.js são instaladas diretamente em
`C:\ProgramData\PDV\app`; o instalador não executa `npm ci` no checkout de
desenvolvimento, evitando conflito com Vite, esbuild ou editores em execução.

Nunca versione ou envie `.env`. Para executar o fluxo automatizado pelo npm:

```powershell
npm.cmd run install:windows-api
```

O token configurado em `PDV_API_TOKEN` é obrigatório para todas as rotas da
API. Para desenvolvimento com Vite, defina também `VITE_PDV_API_TOKEN`.
Distribuições Tauri devem receber o mesmo segredo localmente:

```powershell
npm.cmd run release:client -- --api-url=http://IP_DO_SERVIDOR:3000 --api-token=TOKEN_LOCAL
```

Não publique o token em repositórios, logs, screenshots ou arquivos de
metadata. O servidor deve permanecer em `127.0.0.1` quando não houver
necessidade de acesso remoto; se usar `0.0.0.0`, proteja a rede e restrinja
`PDV_API_ALLOWED_ORIGINS` às origens realmente utilizadas.

No terminal Windows, o token fornecido à distribuição Tauri é protegido pelo
DPAPI do usuário e armazenado separadamente das demais preferências. O
`offline-config.json` mantém a URL e configurações locais, mas não contém o
token em texto claro. Neste cenário de rede local controlada, HTTP continua
aceito para a API privada; não exponha a porta para redes não confiáveis.

O executável Tauri usa `http://127.0.0.1:3000` por padrão quando é executado
no próprio servidor da loja. Para gerar um executável de um terminal que deve
acessar outro computador, informe o endereço da API no build:

```powershell
npm.cmd run release:client -- --api-url=http://IP_DO_SERVIDOR:3000 --api-token=TOKEN_LOCAL
```

Esse comando gera os bundles MSI e NSIS/EXE em `dist\releases`, copia os
instaladores atuais com nomes curtos, como
`pdv-zanzibar.msi` e `pdv-zanzibar.exe`, e grava
`pdv-zanzibar-metadata.json` com o endereço da API e a origem dos ícones.
O MSI e o NSIS são gerados com instalação por máquina e identidade de upgrade
estável. Para atualizar sem desinstalação manual, use o mesmo formato que já
está instalado; uma instalação antiga por usuário pode exigir remoção única
antes da migração para o novo escopo.

Os textos dos instaladores são gerados em português: o NSIS usa o idioma
`Portuguese` e o MSI/WiX usa a cultura `pt-BR`. O seletor de idioma permanece
desativado, portanto os bundles distribuídos para a loja não oferecem troca
de idioma durante a instalação. A configuração está em
`src-tauri/tauri.conf.json`.

Para preparar as tabelas de unidades culinárias no banco do servidor, execute:

```powershell
npm.cmd run migrate:culinary-units
```

A migração usa as credenciais do `.env`, é idempotente e não exige reiniciar a
API. O comando deve ser executado no servidor que hospeda o MariaDB, antes de
qualquer funcionalidade que consuma essas tabelas.
A execução não altera a versão interna do aplicativo nem inclui esse número nos
nomes dos arquivos publicados. Para regenerar os ícones após trocar
`src-tauri/icons/icon.png`, acrescente `--refresh-icons`:

```powershell
npm.cmd run release:client -- --api-url=http://IP_DO_SERVIDOR:3000 --refresh-icons
```
Para gerar somente um build Tauri sem instaladores, defina
`VITE_PDV_API_URL` e use `npm.cmd run tauri -- build --no-bundle`.

As tabelas de Receitas, Composições, componentes, revisões e vínculos
Produto–Receita são garantidas idempotentemente por `src/server/schema-manager.js`
durante o startup e nas rotas do domínio. Depois de publicar uma versão que
altere `src/server/`, reinicie o serviço `PDV-API` para executar essa preparação
no banco existente antes de validar as telas de Ficha Técnica ou os vínculos do
cadastro de Produtos. Não execute SQL destrutivo nem remova tabelas existentes.

Não use o endereço do frontend Vite como endereço da API. Se a aplicação
receber uma página HTML no lugar de JSON, confirme essa variável e valide
`http://IP_DO_SERVIDOR:3000/api/health`.

Também é possível configurar o endereço por terminal em **Configurações >
Configurações Gerais > Conexão com o servidor**. Informe a URL base da API,
por exemplo `http://192.168.0.10:3000`, e salve. Esse valor fica armazenado
localmente no arquivo JSON de configuração da aplicação Tauri e tem prioridade
sobre o endereço padrão do executável. Use **Restaurar padrão** para remover o
arquivo local e voltar ao valor definido pelo build ou pelo ambiente. No
navegador de desenvolvimento, o endereço fica somente em memória durante a
execução. O arquivo é um `offline-config.json` geral, destinado a concentrar
outras preferências locais do terminal no futuro. A gravação nativa faz merge
das propriedades e substitui o arquivo de forma atômica; portanto, salvar uma
configuração não descarta as demais. O token da API é a exceção: ele fica no
armazenamento DPAPI separado e nunca é gravado nesse JSON. O bundle de
instalação não contém esses arquivos: eles permanecem no diretório de dados da
aplicação e não são sobrescritos pela compilação ou atualização do executável.

O arquivo do terminal não substitui a configuração do servidor. Ele pode conter
somente a preferência local `apiUrl`. Não copie
para ele variáveis `PDV_*` do servidor, credenciais do MariaDB, a chave de
criptografia de certificados, URLs de fontes fiscais ou arquivos `.env`.
`VITE_PDV_API_URL` e `VITE_PDV_API_TOKEN` são variáveis de desenvolvimento/build
e também não devem ser distribuídas como `offline-config.json`. Ao executar
`build.cmd` em uma máquina com a instalação limpa, o token é lido
automaticamente de `C:\ProgramData\PDV\app\.env`; não use o token do `.env` do
checkout para gerar o bundle. Para outro servidor, informe explicitamente
`--api-url` e `--api-token` ao script `release:client`.

As URLs das fontes NCM e CEST são configurações do servidor, armazenadas em
`general_settings` com `typeGeneralSetting = 'text'` e
`valueGeneralSetting`. Elas não são copiadas para o terminal. A API usa os
defaults oficiais durante a inicialização e consulta esses valores no banco
depois que o schema está disponível.

Os backups compactados ficam no diretório exibido pela tela
**Ferramentas > Backup e restauração**. Defina `PDV_BACKUP_DIR` para escolher
um destino fixo. Em produção, sem essa variável, o serviço tenta a pasta
`backups` dentro da instalação da API e usa
`%LOCALAPPDATA%\\PDV Zanzibar\\backups` quando a pasta da instalação não for
gravável. Inclua o diretório efetivo na rotina de cópia externa do servidor,
sem versioná-lo no Git. A restauração deve ser executada pela tela
**Ferramentas > Backup e restauração** somente após confirmar que o arquivo é
da loja e da data corretas.

Em **Ferramentas > Status da API**, o campo **Identificador do frontend** mostra
somente o fingerprint da versão compilada. Ele é calculado a partir do commit e
das alterações locais presentes no código no momento da execução do Vite. Dev e
bundle gerados a partir da mesma árvore de código devem exibir o mesmo
identificador; valores diferentes indicam que o `.exe` foi gerado de outra
versão. A tela também informa se o menu veio da API ou da contingência local.

O campo **Versão do aplicativo** mostra a versão SemVer embutida no build,
como `0.1.4`. **Versão da API** mostra a versão do `package.json` do servidor.
Os valores devem coincidir quando API e terminal forem publicados a partir da
mesma versão, mas podem ser diferentes quando os componentes forem atualizados
separadamente. Use o identificador do frontend para distinguir builds da mesma
versão ou investigar diferenças no código compilado.

Se a instalação usar NFC-e ou armazenar certificado A1, configure
`PDV_CERTIFICATE_ENCRYPTION_KEY` antes de iniciar a API. A chave deve ser
mantida somente no servidor e não pode ser recuperada a partir do banco.

Valide no próprio servidor:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

O resultado esperado é:

```json
{"ok":true,"database":"connected"}
```

Para validar o serviço e a API com a autenticação configurada, use:

```powershell
.\scripts\status-windows-service.ps1
```

O script lê `PDV_API_TOKEN` somente do `.env` da instalação publicada e não
exibe o token.

## Firewall e acesso dos terminais

Libere a porta `3000` no Firewall do Windows somente para o perfil **Privado**
e para a sub-rede local da loja. Não exponha a API diretamente à internet.

Não libere a porta `3306` para os terminais. Eles devem acessar:

```text
http://IP_DO_SERVIDOR:3000
```

Confirme a conectividade a partir de um terminal:

```powershell
Test-NetConnection IP_DO_SERVIDOR -Port 3000
Invoke-RestMethod http://IP_DO_SERVIDOR:3000/api/health
```

Se o servidor trocar de IP, configure uma reserva DHCP ou atualize a
configuração dos terminais de forma controlada.

## Execução como serviço

A API opera como o serviço Windows `PDV-API`, usando o wrapper WinSW. Em uma
instalação publicada, o serviço executa com a conta local dedicada
`.\PDVApiSvc`, sem depender das permissões do usuário que mantém o checkout.
Essa conta não recebe acesso administrativo e possui somente leitura dos
arquivos da aplicação e escrita nos logs.

A estrutura operacional publicada fica fora do checkout:

| Caminho | Finalidade | Conta do serviço |
| --- | --- | --- |
| `C:\ProgramData\PDV\app` | Cópia executável da API, `.env` e dependências | Leitura |
| `C:\ProgramData\PDV\service` | WinSW (`PDV-API.exe`) e XML do serviço | Gerenciado pelo administrador |
| `C:\ProgramData\PDV\logs` | Logs da API e do wrapper, com rotação | Escrita |
| `C:\Users\...\copilot-worktrees\...` | Checkout de desenvolvimento, não usado diretamente pelo serviço publicado | Sem dependência |

O `.env` permanece somente em `C:\ProgramData\PDV\app` no servidor e nunca
deve ser copiado para terminais. A senha do MariaDB não precisa ficar nesse
arquivo em produção: ela é armazenada no Windows Credential Manager para a
conta `PDVApiSvc`, usando o serviço `pdv-mariadb` e a conta derivada da
conexão.

Abra o PowerShell como administrador no checkout publicado e execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows-service.ps1
```

Esse script é o instalador de compatibilidade: ele configura o serviço para
`LocalService` e usa diretamente o checkout informado. Para a instalação
recomendada, publique a API fora do perfil pessoal e configure a conta
dedicada:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\publish-windows-api-service.ps1
```

Ao executar a publicação diretamente, o script solicita a senha administrativa
do MariaDB no início da execução, em prompt oculto. A senha é usada apenas para
redefinir a credencial do usuário da API e o arquivo temporário criado para o
cliente `mysql` é removido ao final. Quando chamado pelo instalador, o script
recebe o arquivo temporário já preparado e não solicita a senha novamente.

O script de publicação copia a aplicação para `C:\ProgramData\PDV\app`,
preservando o `.env` operacional e excluindo `.git`, `.env`, `dist`,
`src-tauri\target` e `backups`, concede as permissões
mínimas à conta `PDVApiSvc`, redefine o usuário `pdv_app` recebendo o SQL
somente por pipe para o cliente `mysql`, provisiona a credencial do MariaDB no
perfil correto e atualiza o working directory do WinSW. A senha não é gravada
em arquivo SQL persistente. A conta deve possuir o
direito local **Fazer logon como um serviço**; em computadores sujeitos a
Política de Grupo, essa permissão pode precisar ser atribuída novamente pelo
administrador.

O arquivo `C:\ProgramData\PDV\app\.env` deve existir antes da publicação. O
script interrompe a execução se ele não existir e nunca o substitui pelo `.env`
do checkout. Assim, `PDV_API_TOKEN` e demais configurações operacionais
permanecem preservados durante atualizações.

O serviço depende do `MariaDB`, inicia automaticamente com atraso e possui
três tentativas de reinício com atrasos de 10, 30 e 60 segundos. Os logs ficam
fora do repositório em `C:\ProgramData\PDV\logs`, com rotação por tamanho e
data. O estado configurado pelo Service Control Manager (`.\PDVApiSvc`) é a
referência operacional; o XML do WinSW deve permanecer coerente com o diretório
publicado quando o serviço for reinstalado.

O teste de emissão NFC-e exige o executável `openssl.exe` no servidor. O
instalador procura uma instalação disponível e registra o caminho no serviço
como `PDV_OPENSSL_PATH`. Se o OpenSSL for instalado depois do serviço, execute
novamente o instalador para atualizar essa configuração.

Para reiniciar somente a API já publicada como serviço, abra um terminal como
administrador na raiz do checkout e execute:

```powershell
.\api.cmd
```

Esse comando para e inicia o serviço `PDV-API` e exibe o estado final. Ele não
inicia a API de desenvolvimento pelo `npm.cmd run api`; para desenvolvimento,
use `npm.cmd run api` em um terminal separado. Após alterações em
`src/server/`, reinicie a instância correspondente antes de validar o
frontend. Alterações somente em documentação ou scripts locais, como o
`api.cmd`, não exigem reinício da API.

Verifique o serviço e a API:

```powershell
.\scripts\status-windows-service.ps1
```

Para remover somente o serviço, preservando checkout, `.env` e logs:

```powershell
.\scripts\uninstall-windows-service.ps1
```

Esse comando remove o serviço, `C:\ProgramData\PDV\service`,
`C:\ProgramData\PDV\app`, `C:\ProgramData\PDV\logs`, a conta `PDVApiSvc` e a
credencial do MariaDB no Credential Manager. O banco MariaDB e seus dados são
preservados: o script não executa `DROP DATABASE`, não remove o serviço do
MariaDB e não apaga seus diretórios de dados. Faça backup antes de uma
desinstalação completa. Se `C:\ProgramData\PDV` ficar vazio, o próprio
diretório raiz também é removido; ele será preservado caso contenha outros
arquivos não pertencentes à instalação.

Não versionar o executável WinSW, `.env`, logs ou backups. O serviço lê o
`.env` somente no servidor e não distribui credenciais aos terminais.

## Validação antes de publicar uma versão

Execute no checkout que contém a versão a ser instalada:

```powershell
npm.cmd test
npm.cmd run build
git diff --check
```

O build é obrigatório nesta etapa de publicação porque a versão a ser
instalada precisa ser compilada. Para alterações de JavaScript, execute também
`node --check` nos arquivos modificados; não é necessário verificar
`src/server/server.js` quando ele não foi alterado.

Quando houver alteração no Tauri:

```powershell
npm.cmd exec tauri info
npm.cmd run tauri -- build --no-bundle
```

Quando houver alteração no schema ou na persistência:

1. faça backup verificável do banco;
2. revise a migração antes de executá-la;
3. use alterações não destrutivas;
4. teste em uma cópia ou ambiente de homologação;
5. valide a API e uma leitura real após a migração;
6. confirme que vendas, estoque, pagamentos e produtos existentes foram
   preservados.

Quando a alteração envolver a política de textos em maiúsculas, execute no
servidor, com a API parada ou em janela controlada:

```powershell
npm.cmd run migrate:uppercase
```

O comando verifica colisões em colunas únicas, executa a conversão em uma única
transação e é idempotente. Faça a primeira execução somente depois de validar
um backup restaurável; a migração não converte códigos, e-mails, URLs, rotas,
chaves técnicas nem a formatação do Construtor de Menu.

As versões que incluem o cadastro fiscal também criam ou atualizam a tabela
`fiscal_catalog_items`. A inicialização da API faz somente a criação estrutural
não destrutiva; os códigos fiscais são cadastrados pela loja ou por uma carga
explicitamente iniciada pelo usuário. Depois da atualização,
confirme:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/fiscal-catalogs?catalog=cfops"
Invoke-RestMethod "http://127.0.0.1:3000/api/fiscal-catalogs?catalog=tax-situations"
Invoke-RestMethod "http://127.0.0.1:3000/api/fiscal-catalogs?catalog=icms-rates"
```

Não substitua os dados existentes por uma carga inicial. Cargas iniciadas por
uma ação operacional devem ser revisadas antes da confirmação, e os cadastros
mantidos pela loja devem ser preservados.

Não execute `DROP`, `TRUNCATE` ou migrações destrutivas em produção sem uma
estratégia explícita de recuperação e autorização do usuário.

## Impressão térmica

A impressora fica instalada no Windows do terminal que iniciou a venda e é
selecionada pela configuração de Impressora padrão de Cupom. A venda é
confirmada na API antes da impressão; falhas de impressão devem ser informadas
sem criar uma segunda venda.

Valide separadamente:

- largura de 80 mm;
- codificação e acentuação;
- corte de papel;
- alinhamento e totais;
- reimpressão controlada;
- comportamento quando a impressora estiver desligada.

## Atualização publicada

Publique somente uma versão validada de `main`. O fluxo completo de entrega é:

1. atualizar a documentação relacionada;
2. executar testes e verificações;
3. criar um commit local;
4. abrir e revisar um pull request contra `main`;
5. fazer o merge após a aprovação e as validações;
6. atualizar o checkout do servidor sem sobrescrever `.env`, backups ou dados;
7. reiniciar/reinstalar a API e gerar os bundles do cliente;
8. validar a API e a instalação de um terminal.

Antes de atualizar:

1. crie e verifique um backup do MariaDB;
2. atualize o checkout sem sobrescrever `.env`, backups ou dados locais;
3. execute os testes e o build;
4. execute `scripts/publish-windows-api-service.ps1` para publicar e reiniciar o
   serviço sem substituir o `.env` operacional;
5. confirme `scripts/status-windows-service.ps1` e uma leitura real da API.

Não use scripts de cPanel, Passenger ou outro projeto, não copie credenciais
para repositórios e não considere a versão publicada sem validar API e
MariaDB. O wrapper WinSW é mantido fora do Git em
`C:\ProgramData\PDV\service`.

Quando a atualização alterar `src/server/`, reiniciar a API é obrigatório antes
de testar a interface. Quando alterar somente frontend, documentação ou scripts
locais, o reinício não é necessário. O comando de release do cliente não
incrementa a versão; use um comando `version:*` separado somente quando houver
decisão explícita de SemVer.

Para publicar os bundles do cliente no endereço da API da loja:

```powershell
npm.cmd run release:client -- --api-url=http://192.168.1.200:3000
```

O resultado esperado em `dist\releases` é:

```text
pdv-zanzibar.msi
pdv-zanzibar.exe
pdv-zanzibar-metadata.json
```

Os nomes não incluem a versão. Antes de copiar os instaladores, confirme que
eles foram gerados a partir do checkout mesclado em `main` e que o metadata
aponta para a API correta. Use `--refresh-icons` somente quando o ícone fonte
for alterado.

Após alterações no cadastro de Tipos de Produtos, confirme na API:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/product-types?includeInactive=1"
```

O retorno deve incluir `codeSpedProductType`. A listagem deve apresentar os
registros em ordem crescente de Código SPED, deixando tipos sem código ao
final. Se o endpoint ainda retornar o contrato anterior, o serviço está
executando uma versão antiga e deve ser reinstalado pelo procedimento acima
antes de validar a interface.

Após publicar o cadastro de fornecedores, confirme também:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/suppliers?includeInactive=1"
```

O retorno deve conter a coleção `suppliers`. A tabela é criada ou preservada
pela inicialização idempotente da API.

## Diretriz de nomenclatura

As colunas persistidas e seus contratos correspondentes usam o nome do campo
seguido do nome da tabela ou entidade. Exemplos: `idClass`,
`descriptionClass`, `idProduct`, `priceProduct`, `idSale` e
`amountSalePayment`. Migrações devem renomear as colunas preservando dados,
tipos, índices e chaves estrangeiras; não é permitido resolver a padronização
recriando ou limpando tabelas.

## Backup e recuperação

O banco MariaDB é a fonte de verdade operacional. Configure backups regulares
fora do diretório do projeto, com retenção definida e teste periódico de
restauração. Não versione dumps no Git.

Antes de qualquer manutenção:

```powershell
git status --short
git diff --cached
git diff
```

Preserve `.env`, dados do MariaDB, backups, chaves privadas, `node_modules/`,
`dist/` e `src-tauri/target/`. Nunca use `git reset --hard`, `git checkout --`,
`git restore` ou `git clean` para apagar trabalho local.
