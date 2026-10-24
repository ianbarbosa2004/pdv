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
banco `pdv`, as tabelas iniciais e as formas de pagamento padrão.

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
```

Nunca versione ou envie `.env`. Para instalar dependências e iniciar a API:

```powershell
npm.cmd ci
npm.cmd run api
```

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

A API deve operar como serviço do Windows para reiniciar automaticamente após
uma queda ou reinicialização do computador. O mecanismo oficial ainda será
definido; até lá, não instale um serviço por script improvisado.

Quando o serviço for definido, ele deverá:

- iniciar depois que o MariaDB estiver disponível;
- carregar `.env` sem copiar seus valores para logs;
- reiniciar em falhas;
- gravar logs sem senhas, tokens ou dados desnecessários;
- permitir parada controlada para manutenção;
- usar uma conta do Windows com privilégios mínimos.

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

## Publicação futura

O projeto ainda não possui um script oficial de deploy ou atualização remota.
Até que esse procedimento seja definido:

- não use scripts de cPanel, Passenger ou outro projeto;
- não copie `.env`, credenciais ou dumps para repositórios;
- não faça upload automático;
- não altere o banco de produção por inferência;
- não considere uma versão publicada sem validar a API e o MariaDB no servidor.

Quando existir um procedimento oficial, ele deverá publicar somente uma versão
validada de `main`, preservar o banco e os backups, permitir rollback e
registrar a versão instalada.

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
