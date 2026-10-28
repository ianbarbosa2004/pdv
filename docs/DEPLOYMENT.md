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

Importe `schema.sql` pelo phpMyAdmin ou pelo cliente `mariadb`. O script cria o
banco `pdv` e as tabelas iniciais. Não há cargas automáticas de menus,
cadastros, empresa, formas de pagamento ou configurações.

Crie um usuário exclusivo para a API, substituindo o valor demonstrativo por
uma senha forte definida localmente:

```sql
CREATE USER 'pdv_app'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
GRANT SELECT, INSERT, UPDATE, DELETE ON pdv.* TO 'pdv_app'@'localhost';
FLUSH PRIVILEGES;
```

Se a API e o MariaDB permanecerem no mesmo computador, mantenha o host do banco
como `127.0.0.1`. Não conceda acesso administrativo à aplicação e não
distribua a senha do MariaDB aos terminais.

## Configuração da API

No checkout do servidor, copie `.env.example` para `.env` e preencha os
valores localmente:

```powershell
Copy-Item .env.example .env
```

Configuração mínima:

```text
PDV_API_HOST=0.0.0.0
PDV_API_PORT=3000
PDV_DB_HOST=127.0.0.1
PDV_DB_PORT=3306
PDV_DB_NAME=pdv
PDV_DB_USER=pdv_app
PDV_DB_PASSWORD=(senha definida localmente)
PDV_CERTIFICATE_ENCRYPTION_KEY=(chave base64 local de 32 bytes)
PDV_NCM_SOURCE_URL=(opcional)
PDV_CEST_SOURCE_URL=(opcional)
```

Nunca versione ou envie `.env`. Para instalar dependências e iniciar a API:

```powershell
npm.cmd ci
npm.cmd run api
```

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

A API opera como o serviço Windows `PDV-API`, usando o wrapper WinSW. O
instalador baixa o artefato oficial WinSW `v2.12.0` diretamente do repositório
`winsw/winsw`, valida o SHA-256 fixado no script, gera a configuração com o
caminho deste checkout e instala o serviço com a conta interna `LocalService`.

Abra o PowerShell como administrador no checkout publicado e execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows-service.ps1
```

O instalador exige o serviço `MariaDB`, configura a dependência para iniciar a
API depois do banco, habilita início automático atrasado e configura três
tentativas de reinício com atrasos de 10, 30 e 60 segundos. Os logs ficam fora
do repositório em `C:\ProgramData\PDV\logs`, com rotação por tamanho e data.

Verifique o serviço e a API:

```powershell
.\scripts\status-windows-service.ps1
```

Para remover somente o serviço, preservando checkout, `.env` e logs:

```powershell
.\scripts\uninstall-windows-service.ps1
```

Não versionar o executável WinSW, `.env`, logs ou backups. O serviço lê o
`.env` somente no servidor e não distribui credenciais aos terminais.

## Validação antes de publicar uma versão

Execute no checkout que contém a versão a ser instalada:

```powershell
npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check
```

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

A impressora fica conectada ao terminal que iniciou a venda, por USB, rede
local ou outro método compatível com o modelo. A venda é confirmada na API
antes da impressão; falhas de impressão devem ser informadas sem criar uma
segunda venda.

Valide separadamente:

- largura de 80 mm;
- codificação e acentuação;
- corte de papel;
- alinhamento e totais;
- reimpressão controlada;
- comportamento quando a impressora estiver desligada.

## Atualização publicada

Publique somente uma versão validada de `main`. Antes de atualizar:

1. crie e verifique um backup do MariaDB;
2. atualize o checkout sem sobrescrever `.env`, backups ou dados locais;
3. execute os testes e o build;
4. execute `scripts/install-windows-service.ps1` para reinstalar e reiniciar o
   serviço com a configuração atual;
5. confirme `scripts/status-windows-service.ps1` e uma leitura real da API.

Não use scripts de cPanel, Passenger ou outro projeto, não copie credenciais
para repositórios e não considere a versão publicada sem validar API e
MariaDB. O wrapper WinSW é mantido fora do Git em
`C:\ProgramData\PDV\service`.

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
