# Prompt de continuidade

Use este texto como contexto inicial ao retomar o projeto **PDV** em uma nova
sessão:

> Você é o engenheiro responsável pelo PDV comercial. Preserve a arquitetura
> existente e faça alterações pequenas, testáveis e compatíveis com a operação
> de uma loja. O projeto usa Node.js com módulos ES, Vite, JavaScript no
> frontend, Tauri 2, Rust/Cargo, API Node.js e MariaDB via `mysql2`. O banco e a
> API ficam no único computador servidor da loja; os terminais Tauri acessam a
> API pela rede local e nunca acessam o MariaDB diretamente.
>
> A aplicação deve operar com produtos, categorias, estoque, vendas, itens de
> venda, pagamentos, caixa e impressão térmica de 80 mm. O schema inicial está
> em `database/schema.sql`. A conexão usa `PDV_DB_HOST`, `PDV_DB_PORT`,
> `PDV_DB_NAME` e `PDV_DB_USER`. Em desenvolvimento/bootstrap,
> `PDV_DB_PASSWORD` pode ser lido localmente; em produção Windows, a senha
> deve ser provisionada no Credential Manager e removida do `.env`. Nunca
> leia, exiba, registre ou versione senhas ou outros segredos.
>
> O estado funcional consolidado, incluindo a evolução da Retaguarda,
> navegação, fiscal, NFC-e, impressão e a decisão de não usar cargas padrão,
> está em `docs/PROJECT-HISTORY.md`. Leia esse documento junto com
> `README.md` e `docs/DEVELOPMENT.md` antes de continuar uma etapa relevante.
> Os textos introdutórios das telas são persistidos em
> `navigation_items.descriptionNavigationItem` e editados no Construtor de
> navegação; não recrie esses textos como fonte hardcoded nas telas.
> O layout de retaguarda usa `min-width: 1180px` e `max-width: 1440px` no
> conteúdo operacional. Os contêineres principais devem permanecer
> centralizados com `margin: 0 auto`, respeitar espaçamento lateral mínimo de
> `28px` e usar `28px` no topo e `40px` na base. Barras contextuais
> devem ocupar a largura da tela e
> iniciar no extremo esquerdo, sem recuo baseado no conteúdo. Não adicionar
> margem vertical entre o menu principal e a barra contextual. Painéis
> consecutivos devem manter espaçamento e campos que recebem URLs devem ter
> largura suficiente para leitura. Painéis irmãos devem manter separação
> vertical uniforme, e as linhas de menus e itens do Construtor de navegação
> devem compartilhar a mesma altura mínima.
> O primeiro menu não recebe `padding-top` especial: **Frente de Caixa** deve
> ter o mesmo espaçamento dos demais menus.
> Status da API, Atualizar NCM / CEST, Backup e Restauração, Importar Cadastros,
> Configurações Gerais e Impressoras não devem forçar `width: 100%` no
> contêiner operacional. Essas telas seguem o padrão de Dados da Empresa, com
> `min-width: 1180px` e `max-width: 1180px`; larguras internas ficam para
> tabelas e controles específicos.
>
> A API fica em `src/server/`. Ela deve validar entradas, usar SQL
> parametrizado, executar operações compostas em transações MariaDB e retornar
> erros explícitos. A rota de saúde é `GET /api/health`; a consulta inicial de
> produtos é `GET /api/products`. Os contratos HTTP devem permanecer claros e
> testáveis. Não crie acesso SQL direto no frontend ou no aplicativo Tauri.
>
> O formulário de Receitas e Composições permite cadastrar uma estrutura
> independente de Produto comercial. Componentes de Produto podem registrar a
> Unidade Culinária e a Conversão compatíveis com a unidade tributável e o
> estado físico do Produto; essa combinação é validada novamente pela API e
> persistida em `recipe_components`. A busca de componentes ignora caixa e
> acentos. Observações usa textarea e a ordem visual do cadastro é Nome antes
> de Tipo. O cabeçalho também exige Rendimento maior que zero e Unidade
> Culinária final ativa, persistidos em `recipe_definitions`.
>
> Uma venda só é considerada concluída depois que a API confirmar a transação
> no MariaDB. O registro deve preservar o nome e o preço do produto no momento da
> venda, registrar os itens e os pagamentos, e atualizar o estoque de forma
> atômica. Falhas devem fazer rollback completo e nunca aparecer como sucesso
> na interface. Vendas canceladas não devem ser apagadas fisicamente sem uma
> regra explícita de auditoria e reversão de estoque.
>
> Valores monetários devem ser validados e tratados com precisão adequada.
> Quantidades podem ser fracionadas somente quando o produto permitir essa
> regra. Preço inválido, pagamento insuficiente e venda sem itens devem ser
> rejeitados no servidor; estoque negativo depende da configuração
> `allowNegativeStock`. A interface deve preservar uma cópia
> independente do estado anterior antes de toda escrita e somente confirmar a
> operação após o sucesso da API.
>
> A impressão deve ser local ao terminal que iniciou a venda. Gere comandos
> pelo driver do Windows compatível com impressoras térmicas de 80 mm, mantenha a impressão
> separada da confirmação financeira e trate falhas de impressão
> explicitamente. Uma falha da impressora não pode duplicar a venda nem
> desfazer automaticamente uma venda já confirmada.
>
> Antes de alterar código, leia os módulos relacionados em `src/backoffice`,
> `src/catalog`, `src/sales`, `src/settings`, `src/tools`, `src/ui`,
> `src/server`, `src/shared`, os testes correspondentes e o
> `database/schema.sql`.
> Reutilize regras existentes, não duplique fontes de verdade e preserve a
> compatibilidade da API. Nunca versione `.env`, credenciais, dados reais,
> dumps, backups, `node_modules/`, `dist/` ou `src-tauri/target/`.
>
> Após alterações em `src/server/`, `database/schema.sql` ou
> `src/server/schema-manager.js`, reinicie a API publicada antes de validar o
> comportamento operacional. Não execute build por rotina; faça-o somente
> quando a alteração envolver bundle, Vite/Tauri, versionamento ou validação de
> produção.
>
> Depois de alterações de código, execute a validação mínima:
>
> ```powershell
> npm.cmd test
> git diff --check
> ```
>
> Execute `npm.cmd run build` somente quando a alteração envolver o bundle,
> Vite/Tauri, versionamento ou uma validação de produção. Use `node --check`
> nos arquivos JavaScript modificados. Reinicie a API quando `src/server/`
> for alterado.
>
> Se a alteração envolver Tauri, valide também `npm.cmd exec tauri info` e,
> quando necessário, `npm.cmd run tauri -- build --no-bundle`. Se envolver
> MariaDB, valide o fluxo completo interface → API → transação MariaDB → nova
> leitura, usando dados de teste controlados. Não altere dados reais para
> validar sem estratégia de recuperação.
>
> Não faça commit, push, merge ou publicação sem autorização explícita. Push
> direto é permitido somente para `main`, nunca com `--force` ou
> `--force-with-lease`. Não use `git reset --hard`, `git checkout --`,
> `git restore` ou `git clean` para apagar trabalho local.
>
> As automações pertencem ao projeto `pdv`, são manuais, usam ambiente local,
> intervalo `manual`, workspace `branch` e não configuram `remote_branch`.
> Elas operam somente no checkout de desenvolvimento, sem worktrees, cópias ou
> checkouts alternativos. Siga `docs/AUTOMATIONS.md` e
> `docs/AUTOMATION-PROMPTS.md`.
>
> A publicação recomendada do servidor Windows usa
> `scripts/publish-windows-api-service.ps1`, que copia a API para
> `C:\ProgramData\PDV\app`, mantém o WinSW em `C:\ProgramData\PDV\service`,
> grava logs em `C:\ProgramData\PDV\logs` e executa o serviço `PDV-API` como
> `.\PDVApiSvc`. Não execute publicação, reinstalação ou alteração de serviço
> sem autorização explícita. Não use procedimentos herdados de cPanel,
> Passenger ou outro projeto.
>
> Workarounds obrigatórios já conhecidos: não use substituições globais para
> nomenclatura; audite cada entidade contra o schema e os contratos. Antes de
> validar uma alteração na API, encerre a instância antiga pela porta e
> confirme o `/api/health` na instância reiniciada. Para testes que iniciam a
> API, não use `--env-file=.env`; injete somente configurações de teste pelo
> ambiente do processo. Se o repositório não tiver destino ou script oficial
> de deploy, faça apenas o build local e declare o deploy bloqueado. Após um
> merge, não force a remoção de branch que esteja aberto no worktree ativo.
> Consulte também a seção “Dificuldades e workarounds registrados” em
> `docs/DEVELOPMENT.md`.

Atualização operacional de 2026-11-10: a preparação do schema de caixa usa
`SMALLINT UNSIGNED` para `cash_registers.idCashRegister` e
`cash_sessions.idCashRegister`. Em instalações antigas, a API converte
idempotentemente as colunas que ainda usam `TINYINT`, recria a foreign key
`fkCashSessionsRegister` e garante `Caixa principal`. Depois de publicar
alterações em `src/server/schema-manager.js` ou `database/schema.sql`, reinicie
o serviço `PDV-API` antes de testar o login do operador. A correção foi validada
com 146 testes aprovados; não execute build por rotina.

Estado da última etapa implementada (2026-11-04, versão 0.11.0): Receitas de
Produção e Composições de Produto podem existir sem Produto comercial
resultante. Componentes podem ser Produtos ou outras Receitas; o Produto
comercial recebe vínculos quantificados e perdas no próprio cadastro. A API
persiste definições, componentes, revisões e vínculos, valida ciclos e usa
transações para gravações compostas. Produtos Buffet são vendidos pelo preço
próprio sem baixa de estoque, sem Cardápio obrigatório e sem bloquear o
fechamento do caixa.

As barras contextuais dos grupos operacionais revisados usam a navegação
persistida como fonte principal. Fallbacks locais só podem ser usados quando a
API estiver indisponível ou incompleta; não injete o primeiro item fallback
depois de uma resposta válida com filhos ativos. Preserve ordem, labels, rotas,
divisores, status e relações pai-filho. A etapa foi validada com 112 testes,
`node --check` e `git diff --check`; não houve build. Como `src/server/` foi
alterado, a API publicada precisa ser reiniciada após a publicação e o
frontend precisa receber novo bundle.

Estado da última etapa de auditoria (2026-11-02): as rotinas de preparação
idempotente foram extraídas para `src/server/schema-manager.js`, e a DDL das
quatro tabelas NCM/CEST foi centralizada em
`src/server/ncm-cest-update.js`. Os scripts
`scripts/publish-windows-api-service.ps1` e
`scripts/configure-windows-service-account.ps1` foram corrigidos para enviar o
SQL de redefinição do `pdv_app` por pipe ao `mysql`, sem criar arquivo SQL
persistente, e para passar a senha `SecureString` à conta `PDVApiSvc`.

Validação concluída: 58 testes aprovados, `node --check`, parser PowerShell e
`git diff --check`. Não foram executados build completo, publicação, deploy,
alteração do serviço ou reinício da API. Scripts e documentação não exigem
reinício; alterações posteriores em `src/server/` exigem reiniciar a API
publicada antes da validação real. Não executar os scripts de publicação sem
autorização explícita e sem confirmar backup e credenciais locais.

Na auditoria de desempenho de 2026-11-02, a busca da Frente de Caixa deixou de
reconstruir a tela inteira a cada tecla: somente o grid de produtos é
atualizado, sem recriar carrinho, resumo, modal de pagamento ou seus handlers.
O endpoint de produtos continua retornando o catálogo completo; paginação
permanece uma decisão futura de contrato e deve ser medida antes de ser
implementada. Essa alteração é somente de frontend, foi validada com 58 testes,
`node --check` e `git diff --check`, e não exige reinício da API.

A tela de cadastro de produtos também passou a carregar NCMs sob demanda,
somente ao abrir o modal de consulta. O estado de carregamento, erro e nova
tentativa é explícito; o código NCM já selecionado é preservado. Não houve
alteração de contrato da API, cache persistente ou necessidade de reiniciar a
API.

A ordem dos menus, itens e divisores do Construtor é configuração persistida.
Não normalize ou renumere automaticamente itens existentes durante o startup
da API, pois isso sobrescreve ajustes feitos no Construtor.

A mesclagem dos defaults deve preservar rota, label, menu, pai e ordem de um
registro persistido quando sua chave canônica permanece a mesma. Aliases
legados podem ser normalizados somente para recuperar a identidade essencial.
Ao mover um item principal entre menus, mova também todos os descendentes e
salve o pai antes dos filhos para que a validação de menu/pai permaneça válida.
O endpoint de criação de divisor já deve inserir no mesmo menu e nível do item
de referência, imediatamente após sua ordem; não corrija a posição depois por
heurística de renderização.

Em leituras normais, a API e o frontend devem consumir diretamente as linhas
persistidas de `navigation_menus` e `navigation_items`. A função
`normalizePersistedNavigation` apenas copia o payload; ela não cria, remove,
reordena ou corrige itens. `buildFallbackNavigation` só pode ser usado no
bootstrap ou quando a API estiver indisponível, nunca depois de uma resposta
válida da API.

O resolvedor de navegação deve aceitar tanto handlers indexados pela chave ou
rota (`ncm-cest-update`) quanto handlers no padrão de componentes
(`onNcmCestUpdate`). Isso é necessário para que o menu principal continue
funcionando depois da entrada em Views e em outras telas que repassam handlers
com nomes `onX`.

Operações Fiscais usa dois registros de navegação: o item principal do menu é
`item` de ordem 6; a entrada homônima da barra contextual é um filho `bar` de
ordem 1. Não substituir um registro pelo outro nem duplicar a entrada na
renderização da barra.

A auditoria de acessibilidade no Vite local encontrou contraste insuficiente
nos textos secundários da Frente de Caixa e nos textos auxiliares do carrinho.
As cores foram ajustadas e os campos de busca passaram a ter `name` explícito. Lighthouse também apontou
HTTPS, SEO e arquivos de descoberta, mas esses itens ficaram fora do fluxo
local autenticado do PDV nesta etapa. Não houve necessidade de reiniciar a
API. Após os ajustes, a auditoria Lighthouse de acessibilidade ficou em 100 e
não restaram mensagens de console.

Medição de desempenho dos catálogos concluída em ambiente local autenticado:
75 produtos (43 KB), 19 grupos (2,8 KB), 10.508 NCMs (939 KB) e 947 CESTs
(194 KB). Não há justificativa atual para paginar produtos ou grupos. NCM/CEST
permanece candidato a paginação ou busca server-side; a tela dedicada ainda
carrega ambos os catálogos completos e deve ser tratada em alteração de
contrato separada. A medição não alterou dados, não exige reinício da API e
não exigiu build completo.

Registro intermediário: a alteração seguinte implementou paginação e busca server-side nos endpoints
NCM/CEST quando recebem parâmetros de página. O retorno completo sem
parâmetros foi preservado para compatibilidade com o formulário de produtos.
Os testes passaram com 59 casos e a sintaxe dos módulos foi validada. A
API publicada foi reiniciada e `/api/health` retornou HTTP 200 com banco
conectado, mas as novas rotas com parâmetros retornaram 404. Isso indicou que
o serviço reiniciado ainda executava a publicação anterior; reiniciar não copia
alterações do checkout para `C:\ProgramData\PDV\app`.

Registro intermediário: após novo bundle, instalação e reinício informados pelo
operador, a situação permaneceu igual. A inspeção confirmou que
`C:\ProgramData\PDV\app\src\server\server.js` não contém
`parseCatalogPagination`, enquanto o checkout contém; portanto o bundle
instalado ainda não inclui esta alteração. O serviço `PDV-API` está em execução
por `C:\ProgramData\PDV\service\PDV-API.exe`, com a conta `.\PDVApiSvc`.

Na tentativa de publicação seguinte, o script apresentou comandos
`Set-LocalUser`/`New-LocalUser` corrompidos. Os dois scripts de configuração
foram corrigidos para usar splatting de parâmetros, e a estrutura PowerShell
foi validada sem executar nova publicação.

Após a correção, o operador executou a publicação com sucesso. O serviço
`PDV-API` ficou em execução, a cópia publicada passou a conter
`parseCatalogPagination` e `src/server/catalog-pagination.js`, e as rotas
paginadas autenticadas responderam HTTP 200. `/api/health` retornou banco
`connected` e `apiVersion` `0.8.11`; NCM página 2 retornou total 10.508,
`pageSize` 25 e `pageCount` 421.

Auditoria operacional de 2026-11-02 confirmou que autenticação de operadores e
controle de caixa ainda não existem no schema ou na API. O token compartilhado
do terminal não substitui login e autorização por operador. A próxima etapa
deve definir migração, sessões, permissões, abertura/fechamento, movimentos de
caixa, vínculo da venda com operador/caixa e auditoria de cancelamento/reversão,
preservando transações MariaDB e testes de rollback.

Na auditoria de backup, o servidor passou a ignorar diretórios enviados pelo
terminal nas rotas de listar, criar, baixar e restaurar. O caminho válido é
definido somente por `PDV_BACKUP_DIR` ou pelo padrão da API, evitando acesso a
caminhos arbitrários do servidor. A alteração ainda requer publicação e
reinício da API publicada antes da validação operacional.

Auditoria de regressão do código de backup confirmou que os quatro endpoints
continuam usando somente `backupOptions()` construído no servidor. Query strings
e campos de diretório enviados pelo cliente não são encaminhados ao serviço;
download aceita apenas nomes no padrão de backup e restauração cria o backup
de segurança no mesmo diretório configurado. A cobertura unitária de criação,
listagem, leitura e validação de schema permanece aprovada. Ainda falta apenas
publicar a alteração e validar o comportamento na instalação Windows real.

Após a publicação operacional, a API instalada foi validada com autenticação:
`PDV-API` está em execução, o banco respondeu `connected`, a versão retornada
foi `0.8.11` e `GET /api/backups?directory=...` ignorou o caminho enviado,
retornando o diretório configurado para a conta do serviço. O script
`status-windows-service.ps1` foi atualizado para autenticar o health check
usando o `.env` publicado sem exibir o token.

Auditoria de exposição de caminhos identificou que o contrato HTTP ainda
retornava o caminho físico do servidor em `GET /api/backups` e, na criação, em
`filePath`/`directory`. Esses campos foram removidos; o terminal recebe apenas
metadados operacionais e uma mensagem de que o destino é controlado pelo
servidor. A alteração em `src/server/server.js` exige nova publicação e
reinício da API antes da validação real.

Após nova publicação e reinício informados pelo operador, a validação real
confirmou o serviço `PDV-API` em execução, banco `connected`, versão `0.8.11`
e resposta de `GET /api/backups` contendo somente o campo `backups`. Um
diretório arbitrário enviado na query string foi ignorado.

Auditoria do download de backups identificou que a tela usava um link direto
para uma rota protegida, sem enviar o Bearer token. O download agora usa
`apiFetch`, transforma a resposta em `Blob` e inicia o arquivo localmente. A
alteração é somente frontend/Tauri; não exige reinício ou republicação da API,
mas exige novo bundle para chegar aos terminais.

Validação operacional do download na API publicada confirmou `401` sem token,
`200` com Bearer token e `Content-Type: application/gzip` para um nome de
backup válido. Nomes fora do padrão retornam `404`; nenhum arquivo foi alterado
durante o teste.

Auditoria de proteção de dados NFC-e confirmou que `GET /api/company/nfce`
retorna somente indicadores de presença para CSC, tokens, certificado e senha.
Os campos criptografados do certificado e da senha são removidos antes da
resposta; a API publicada foi validada sem expor esses campos ou seus valores.

Auditoria dos campos NFC-e confirmou que `nfceCertificateExpiresCompany` e
`nfceCertificateSerialCompany` são metadados derivados e úteis para diagnóstico,
mas não são necessários para assinar ou enviar no fluxo atual. A validade não é
hoje usada para bloquear emissão; deve permanecer até existir alerta/verificação
de expiração. `nfceCertificateNameCompany` é apenas UX. `nfceCertificatePathCompany`
é legado: não há campo ativo nem acesso a caminho, e deve ser removido somente
por migração revisada. O produto utiliza somente A1 em arquivo PKCS#12; A3 não
é oferecido pela tela nem aceito pela API. Número inicial e contingência estão persistidos, porém
ainda não têm efeito no fluxo de emissão atual.

A remoção do campo legado foi executada no código: `nfceCertificatePathCompany`
não está mais no schema inicial, no schema runtime, nos contratos da API ou nos
defaults do frontend. Foi criada a migração idempotente
`migrate-remove-nfce-certificate-path.mjs` para instalações existentes; ela
deve ser executada somente após confirmar backup recuperável e requer reinício
da API depois do `ALTER TABLE`.

A tentativa de executar a migração no checkout falhou antes de qualquer
alteração porque não havia credencial MariaDB disponível para `pdv_app`
(`using password: NO`). Nenhuma coluna foi removida no banco publicado. A
migração deve ser executada no servidor da loja com o `.env` operacional ou
credencial de banco configurada, após confirmar um backup recuperável.

Após a execução manual do `DROP COLUMN` e a publicação, a API retornou erro
500 em `/api/company/nfce`. O log do serviço revelou um placeholder extra no
`IN (...)` de `ensureCompanySchema`, introduzido ao remover a coluna da lista
de parâmetros. A correção reduziu os placeholders para os 15 nomes restantes;
o operador confirmou nova publicação da API em 2026-11-02. Ainda é necessário
confirmar no servidor que o serviço foi reiniciado e validar `/api/health` com
autenticação e `/api/company/nfce` com HTTP 200, sem
`nfceCertificatePathCompany` na resposta. Essa validação foi concluída em
2026-11-02: `PDV-API` está `Running`/`Automatic`, o banco está `connected`,
`/api/company/nfce` retornou HTTP 200 e o campo legado não aparece na resposta.

A imagem da tela NFC-e revelou uma falha visual: o carregamento inicial usava
`renderPreservingFormDraft` e restaurava os valores vazios do formulário sobre
os metadados retornados pela API nos campos somente leitura de validade e série.
O helper agora ignora campos `disabled` e `readonly` ao capturar rascunhos, com
teste unitário cobrindo o caso. Como a alteração é somente frontend, requer
novo bundle/distribuição Tauri para chegar aos terminais, mas não exige
reinício da API.

O operador decidiu que o PDV não utilizará certificados A3. O contrato foi
ajustado para exibir somente A1 em arquivo PKCS#12 e a API passou a aceitar
somente `A1`; o schema inicial e o schema runtime para novas colunas também
foram alinhados. A alteração foi validada com 60 testes, `node --check` e
`git diff --check`. O bundle Tauri foi regenerado com MSI e NSIS/EXE em
`dist\releases`; a API ainda requer publicação pelo procedimento oficial
elevado antes de aceitar o contrato A1-only em produção. Não é necessária
alteração destrutiva no banco existente.

Após a publicação informada pelo operador, a validação operacional confirmou
`PDV-API` em `Running`/`Automatic`, banco `connected`, versão `0.8.11`,
`GET /api/company/nfce` com HTTP 200, certificado configurado como `A1`,
validade e série presentes, e ausência de `nfceCertificatePathCompany`.
Também foi verificado que a cópia publicada da API não contém a validação
legada de A3 e aceita somente `A1`.

Por decisão do operador, foi implementada a FK de
`products.idPhysicalStateProduct`: `NULL` representa ausência de estado físico,
a validação do servidor mantém estado obrigatório para matéria-prima e o
frontend/filtros não usam mais `0`. Em 2026-11-02, a migração foi executada
com sucesso no DBeaver com conta autorizada: os valores zerados/órfãos foram
normalizados, a coluna tornou-se anulável e `fkProductsPhysicalState` foi
adicionada. A execução pelo checkout continua bloqueada pela ausência da senha
de `pdv_app` (`using password: NO`).

Após a migração, o operador confirmou a conclusão das etapas operacionais:
publicação/reinício da API e geração/distribuição do bundle Tauri atualizado.
Essas etapas foram necessárias porque `src/server/server.js`,
`src/server/schema-manager.js` e o frontend mudaram para o contrato `NULL`.

Auditoria adicional confirmou que `nfceInitialNumberCompany` e
`nfceContingencyCompany` são apenas preparatórios: o teste usa número
temporário, `sales` não registra número/série fiscal e não existe emissão ou
reconciliação offline. Não habilitar contingência nem tratar o número inicial
como funcional até existir numeração transacional, armazenamento de XML/chave
e fluxo de autorização/reconciliação.

As auditorias de operadores e caixa foram concluídas com migração, sessões
expiráveis, permissões no servidor, abertura/fechamento, sangria, suprimento e
vínculo de vendas com operador/caixa. O cancelamento auditado permanece
pendente e deve incluir reversão transacional de estoque.

A auditoria de autorização confirmou que o token compartilhado atual continua
adequado apenas para autenticar o terminal perante a API. Ele não deve ser
reutilizado como identidade de operador ou permissão financeira.

Auditoria de vendas de 2026-11-02 confirmou que a interface só limpa o
carrinho após sucesso da API e que a API executa venda, itens, pagamentos,
Vale e baixa de estoque na mesma transação, com bloqueio de produtos,
idempotência por `clientIdSale` e rollback explícito. O fluxo agora também
exige sessão de operador e caixa aberto, registra ambos na venda e cria
movimento para pagamentos cuja conta é `Caixa`.

A implementação de operadores e caixa foi concluída: login individual com
hash `scrypt`, sessão expirável de oito horas, abertura/fechamento, suprimento,
sangria e justificativa obrigatória para diferença. O primeiro operador pode
ser criado no servidor com `npm.cmd run create:operator`, usando
`PDV_OPERATOR_PASSWORD` apenas em memória/ambiente protegido.

Em 2026-11-02, o operador confirmou que o usuário inicial `admin` foi criado
na tabela `operators` com papel `admin`. A senha não deve ser registrada na
documentação. O fluxo operacional validado inclui login do administrador,
criação das tabelas de sessão/caixa pelo startup, abertura do caixa e venda
controlada com vínculo de operador e sessão.

Na correção seguinte, o login deixou de obrigar a abertura do caixa. Após
autenticar, a tela de login é substituída por uma tela exclusiva na qual o
operador escolhe explicitamente entre **Frente de caixa** e **Retaguarda**.
A Retaguarda abre sem caixa; a Frente de caixa informa quando
o caixa está fechado e oferece a tela de abertura com saldo inicial. A API
continua rejeitando vendas sem operador autenticado e caixa aberto. Como essa
alteração foi somente de frontend, não exige reinício da API, mas exige novo
bundle/distribuição do frontend.

A tela de login também não exibe o campo “Padrão”. Após o login, a seleção
apresenta **Vendas**, **Caixa** e **Retaguarda**. Vendas abre a frente de
caixa, Caixa abre o controle de caixa e Retaguarda abre a tela Início da
Retaguarda sem exigir caixa aberto. Essa tela mostra somente cards marcados
como **Atalho** no Construtor de navegação, ordenados pela mesma ordem de menus
e itens persistida na navegação; não crie uma segunda fonte de verdade nem
inclua atalhos artificiais. Os cards devem renderizar ícones Lucide registrados
em `src/ui/icons.js`. As barras contextuais não devem exibir links de retorno,
nem “Frente de caixa” nem “Voltar”; os títulos devem mostrar o operador
autenticado.

O ícone de banco no login
abre o modal de configuração da API, que testa e salva o endereço do servidor
no terminal antes do login. Endereços inacessíveis não substituem a
configuração anterior durante o teste e o modal mostra uma mensagem
operacional em português em vez de `Failed to fetch`.
No modal, **Testar** e **Salvar** são ações separadas: testar não altera a
configuração e habilita salvar somente para a mesma URL testada; salvar grava a
URL validada e fecha a tela.

O X da janela enquanto o operador está na tela de login fecha o aplicativo
diretamente, sem abrir a pergunta de backup. O backup continua sendo solicitado
somente depois que a aplicação entra nas telas operacionais.

Auditoria de impressão de 2026-11-02 confirmou que a impressão é local ao
terminal, restringe rede a endereços locais, possui timeouts e permanece
separada da confirmação da venda. Não há necessidade de reiniciar a API por
essa auditoria.

A tentativa de diferenciar servidor e terminal por uma credencial adicional foi
cancelada em 2026-11-03 por aumentar a complexidade operacional de instalação,
publicação e distribuição. O sistema permanece com um único fluxo de
autenticação por `PDV_API_TOKEN`; não há contrato de papel servidor/terminal no
frontend ou na API.

Também foi corrigido o script de publicação da API: a cópia via `robocopy`
agora exclui `.env` e exige que `C:\ProgramData\PDV\app\.env` já exista antes
da publicação. O arquivo operacional não pode ser substituído pelo `.env` do
checkout, pois contém `PDV_API_TOKEN` e outras configurações exclusivas do
servidor.

Para instalação limpa, `scripts/install-windows-api.ps1` é o fluxo oficial:
solicita a senha administrativa do MariaDB em prompt mascarado com suporte a
colagem, gera os segredos,
cria a configuração operacional, instala o serviço e publica a API. O comando
`npm.cmd run install:windows-api` é o atalho equivalente. Os scripts
`install-windows-service.ps1` e `publish-windows-api-service.ps1` permanecem
para compatibilidade e atualização de instalações existentes.

Auditoria de empacotamento de 2026-11-02 configurou os instaladores Windows em
português. NSIS usa `Portuguese`, MSI/WiX usa `pt-BR` e o seletor de idioma
permanece desativado. A configuração foi validada com `tauri info` e o build
gerou os dois bundles da versão `0.8.11`; essa alteração não exige reinício ou
republicação da API, mas exige distribuir os novos instaladores aos terminais.

Diretriz de continuidade registrada em 2026-11-03: não compilar o projeto
inteiro após toda alteração. Usar a menor validação compatível com o escopo,
reiniciar a API somente quando `src/server/` ou a publicação operacional mudar,
e indicar explicitamente quando um novo bundle precisa ser distribuído. Toda
etapa relevante deve atualizar a documentação canônica com estado, validações
executadas, necessidade de reinício/redistribuição e pendências. Esta etapa
alterou somente documentação; não exige compilação, reinício da API ou novo
bundle.

Em 2026-11-03 foi implementada a primeira fatia do cancelamento auditado:
`POST /api/sales/:idSale/cancel`, restrita a supervisor/admin, exige motivo,
marca a venda como cancelada sem exclusão física, registra auditoria, repõe
estoque, cancela Vale aberto, reverte o esperado do caixa e usa rollback em
qualquer falha. A migração runtime adiciona os campos de auditoria e o tipo de
movimento `sale_cancellation`. A API publicada precisa ser atualizada e
reiniciada antes da validação real; a interface ainda não possui o botão de
cancelamento.

Após a publicação informada em 2026-11-03, o serviço `PDV-API` foi confirmado
como `Running`, `/api/health` retornou banco conectado e uma consulta
autenticada a `/api/products` retornou HTTP 200. A validação não executou
cancelamento em dados reais. A validação operacional do novo fluxo continua
pendente de publicação e distribuição controladas.

Em seguida, a Frente de Caixa recebeu um modal de vendas recentes e a API
`GET /api/sales?limit=20`. Supervisor/admin podem iniciar o cancelamento pelo
modal, com confirmação e formulário de motivo; operadores comuns apenas
consultam a lista. A validação automatizada passou a 77 testes. Como houve
alteração em `src/server/` e no frontend, a próxima validação operacional
exige publicar/reiniciar a API e gerar/distribuir um novo bundle. Nenhuma
dessas operações foi executada nesta etapa.

Em 2026-11-03 foi reproduzida a falha de login do operador na instalação
publicada. O teste de conexão passa, mas `ensureOperatorCashSchema` falha ao
remover `uqCashMovementsSale`, porque a chave estrangeira
`fkCashMovementsSale` ainda depende desse índice. A API então retorna 503 e a
interface exibe “Não foi possível autenticar o operador.” A correção preparada
em `src/server/schema-manager.js` remove temporariamente a FK, troca o índice
único por índice comum e recria a FK; o teste de regressão passou. Essa correção
ainda exige publicação e reinício da API, sem alterar o banco manualmente.

Após a publicação oficial e reinício autorizado em 2026-11-03, o serviço
`PDV-API` ficou `Running`, `/api/health` autenticado retornou HTTP 200 e uma
tentativa de login com credenciais inválidas controladas retornou HTTP 401.
Isso confirma que a migração de `cash_movements` deixou de bloquear o login;
nenhuma credencial real foi registrada ou exibida. Os arquivos de log com
`ER_DROP_INDEX_FK` são históricos da falha anterior; o log corrente não contém
erro. A API não precisa de novo reinício para essa correção.

Na validação seguinte, o Vite de desenvolvimento iniciou em
`http://127.0.0.1:5173/` e retornou HTTP 200; a API publicada permaneceu
acessível com `/api/health` autenticado em HTTP 200. O servidor Vite foi
encerrado após a verificação. A autenticação com credencial real ainda deve
ser confirmada pelo operador no formulário, pois a senha não é conhecida nem
deve ser capturada pelo agente.

O operador confirmou o login real em desenvolvimento em 2026-11-03. Isso
encerra a investigação da falha de autenticação causada pela migração
bloqueada; não é necessário reiniciar novamente a API. A validação restante do
cancelamento auditado é abrir o bundle atualizado, acessar “Vendas recentes” e
confirmar a visibilidade da ação conforme o papel do operador, sem cancelar
vendas reais.

Os artefatos do bundle atualizado foram conferidos em 2026-11-03:
`dist\releases\pdv-zanzibar.msi` e `dist\releases\pdv-zanzibar.exe` existem,
com metadata apontando para `http://192.168.1.200:3000`. Os testes específicos
de cancelamento e migração passaram com 14 casos. O bundle está pronto para
ser instalado/aberto pelo operador; essa etapa não exige novo reinício da API.

O operador confirmou em 2026-11-03 a validação do bundle atualizado, incluindo
login e acesso à tela de vendas recentes. A integração de cancelamento
auditado está disponível em desenvolvimento e no bundle, sem cancelamento de
venda real durante a validação. Esta pendência está encerrada; permanecem como
pendências de produto as etapas fiscais NFC-e, contingência/inutilização,
integração MariaDB controlada e política de atualização dos terminais.

Em 2026-11-03 foi iniciada a integração online opcional de NFC-e por venda.
O payload de `POST /api/sales` aceita `emitNfce: true`; a venda cria
`sale_fiscal_documents` com estado `pending`, reserva a próxima numeração de
homologação na mesma transação e somente depois do commit chama a SEF/MG. A
resposta retorna `fiscalStatus` e os estados possíveis são `authorized`,
`rejected` e `unknown`. Quando o campo é falso ou omitido, a venda continua
`completed`, retorna `fiscalStatus: "not_requested"` e não reserva número
fiscal. A Frente de Caixa passou a exibir a opção por venda no modal de
pagamento.

Esta etapa alterou `src/server/`, o schema inicial, a migração de schema e o
frontend. Os testes automatizados (82 casos, incluindo venda sem NFC-e,
autorização, rejeição e resultado desconhecido), `node --check` e `git diff
--check` passaram. A API publicada ainda precisa ser atualizada e reiniciada
antes da validação operacional; como o frontend mudou, também será necessário
gerar e distribuir novo bundle. A validação deve usar somente banco de
homologação, produtos com NCM válido e dados fictícios. O reenvio de pendentes,
contingência offline, cancelamento/inutilização fiscal e reconciliação ainda
não foram implementados.

Após a publicação da API e a geração dos bundles, foi identificado que o campo
de usuário da tela de login perdeu o foco automático. A causa foi a montagem
do elemento de login antes de `app.replaceChildren(screen)`, momento em que o
atributo HTML `autofocus` pode não ser aplicado ao documento. `src/main.js`
agora aplica foco explicitamente ao primeiro elemento `[autofocus]` depois da
montagem. A sintaxe e os 78 testes passaram. A API não precisa ser reiniciada
para essa correção; como o frontend foi alterado depois da geração dos
bundles, é necessário executar `build.cmd` novamente e redistribuir o MSI/EXE.

Em 2026-11-03, a suíte passou com 82 testes após a inclusão da cobertura
específica da primeira etapa NFC-e. O usuário confirmou que a API foi publicada
e os bundles foram gerados. A validação automatizada não acessa a SEF/MG nem
usa credenciais fiscais; a validação operacional restante deve executar uma
venda fictícia em homologação com `emitNfce: true` e conferir o estado retornado
e o documento persistido.

Na tentativa operacional de 2026-11-03, a venda com emissão falhou porque a
API não conseguiu descriptografar o certificado armazenado
(`Unsupported state or unable to authenticate data`). Depois, ao reenviar o
certificado pela tela NFC-e, a leitura da validade falhou. A investigação
identificou que `server.js` chamava `openssl` apenas pelo PATH, enquanto o
instalador e `nfce-test-service.js` usam `PDV_OPENSSL_PATH` e caminhos
conhecidos do Windows. `server.js` agora usa a mesma resolução de executável.
Os 82 testes e a sintaxe passaram. Essa correção altera a API: é necessário
publicar e reiniciar o serviço antes de repetir o salvamento do certificado e
a venda de homologação. Não repetir a operação fiscal antes dessa publicação.

Na tentativa seguinte, a tela de pagamento fechou sem mensagem e não houve erro
novo nos logs da API. O fluxo anterior fechava o modal e limpava o carrinho após
qualquer resposta HTTP bem-sucedida, mas não apresentava confirmação nem o
`fiscalStatus`. `src/sales/sale-screen.js` agora mostra uma mensagem de venda
registrada e o estado NFC-e retornado (`authorized`, `rejected` ou `unknown`).
Essa alteração é somente frontend: não exige reinício da API, mas exige novo
bundle e distribuição aos terminais.

Na validação seguinte, a mensagem de NFC-e ainda não apareceu. A confirmação
existia no estado da tela, mas só era renderizada depois de `fetchCatalog()`;
uma demora ou falha no recarregamento podia ocultá-la. `sale-screen.js` agora
renderiza imediatamente após o `POST /api/sales` bem-sucedido e apresenta uma
faixa de confirmação destacada com o estado fiscal. Os 82 testes, a sintaxe e
`git diff --check` passaram. Essa correção é somente frontend e exige novo
bundle/distribuição, sem reinício da API.

Vendas Recentes também passou a exibir os dados persistidos da NFC-e. A
consulta agora retorna status, ambiente, série, número, chave de acesso,
protocolo, cStat, mensagem e XML; a interface mostra esses dados por venda e
mantém o XML dentro de um detalhe expansível. Foi adicionado teste de contrato
para garantir o retorno do XML. A alteração envolve API e frontend: exige
publicar/reiniciar a API e gerar/distribuir novo bundle.

Na validação visual, a versão instalada mostrou `payments is not defined` e
uma lista de cartões diferente do modelo solicitado. A tela foi corrigida para
usar uma tabela responsiva com código da venda, tipo, ECF/SAT, cliente,
mesa/comanda, data, total, status, status do cupom fiscal, MFE e operação.
Chave, protocolo e XML ficam na coluna de operação. O código atualizado não
usa `payments` na renderização de Vendas Recentes; a única ocorrência é o
payload explícito do POST de venda. Os 83 testes, a sintaxe e
`git diff --check` passaram. Como envolve API e frontend, exige publicar e
reiniciar a API e gerar/distribuir novo bundle.

Por clareza operacional, o botão da Frente de Caixa que encerra somente a
sessão do operador passou a se chamar **Logout**. O menu global **Sair**
continua reservado para fechar o sistema, evitando que os dois comandos sejam
confundidos.

Em 2026-11-03, o login exibiu "Sessão do operador inválida ou expirada" e
exigiu uma segunda tentativa. A causa foi o token expirado persistido no
terminal: `apiFetch` o enviava também para `POST /api/operator/login`, e o
middleware rejeitava a requisição antes de validar as novas credenciais. O
frontend agora limpa a sessão antes de iniciar o login, e o servidor ignora
`X-Operator-Session` nessa rota. A sintaxe e os 82 testes passaram. A correção
altera frontend e API: exige novo bundle, publicação da API e reinício do
serviço antes da validação operacional.

Em 2026-11-03, Vendas Recentes exibiu `payments is not defined` como mensagem
fiscal persistida. A causa estava em `src/server/nfce-test-service.js`:
`buildSaleNfeXml` usava `payments.map(...)`, mas não recebia `payments` nos
parâmetros, e `authorizeSaleNfce` também não encaminhava os pagamentos para o
gerador. A assinatura e a chamada foram corrigidas; os pagamentos são
convertidos de centavos para reais no XML. Foi adicionado teste de regressão
para o bloco `<pag>`. A alteração é somente de API, passou em 84 testes,
`node --check` e `git diff --check`, e exige reiniciar a API de
desenvolvimento antes de repetir a venda fictícia. As mensagens antigas
persistidas no banco não são alteradas automaticamente.

Na tentativa seguinte de emissão, a SEF/MG retornou cStat 373 porque o
primeiro `<xProd>` continha o nome real do produto. Em homologação, a
descrição do primeiro item precisa ser exatamente
`NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL`.
`buildSaleNfeXml` agora usa essa descrição somente no primeiro item e mantém
os nomes dos demais produtos. O teste de regressão passou; a alteração é
somente de API e exige reiniciar a API antes de repetir a venda fictícia.

A pedido do operador, o modal de Vendas Recentes foi ampliado para ocupar a
largura disponível da janela, com altura limitada ao viewport e rolagem
horizontal/vertical dentro da tabela. A alteração é somente frontend, não
exige reinício da API, mas requer novo bundle/distribuição para terminais
instalados.

Na consulta da NFC-e autorizada em homologação, o QR Code gerado usava o host
de produção `portalsped`, enquanto `urlChave` já usava `hportalsped`. Isso pode
abrir a consulta com dados vazios. Os dois geradores de QR Code agora usam
`https://hportalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml` para
homologação. A alteração é somente de API: exige publicação/reinício antes de
emitir outra NFC-e; XMLs já assinados mantêm o QR Code antigo.

Na validação seguinte, o operador selecionou PIX, mas o XML registrou
`<tPag>01</tPag>` porque o gerador fixava dinheiro para qualquer pagamento.
O fluxo agora encaminha `namePaymentMethod` ao autorizador e mapeia PIX para
`tPag=17`; dinheiro permanece `01`, cartões de crédito/débito usam `03`/`04`,
Vale usa `05` e formas não reconhecidas usam `99`. Foram adicionados testes
para o mapeamento e para o payload fiscal. A alteração é somente de API:
exige publicar a API atualizada e reiniciar o serviço antes de testar uma nova
NFC-e. Documentos já autorizados não são alterados.
### Destino de impressão de produtos

O campo de produtos `printsKitchenProduct` foi substituído por `printsPlace`,
com os valores exatos `NÃO IMPRIMIR`, `BAR`, `COPA` e `COZINHA`. O valor padrão
para novos produtos e importações é `NÃO IMPRIMIR`. A API valida o valor no
servidor, e a migração converte o campo booleano legado `0` para `NÃO IMPRIMIR`
e `1` para `COZINHA`, removendo a coluna antiga após a conversão.

Essa alteração envolve API e schema: requer publicar a API atualizada e
reiniciar o serviço instalado `PDV-API`. A tela de Produtos exibe o select ao lado de Estoque somente em Mercadoria para
Revenda e Produtos Acabados. Para os demais tipos, a API grava sempre
`NÃO IMPRIMIR`, mesmo que a chamada tente enviar outro valor. O editor de
Produtos em Views mantém o campo `printsPlace` disponível, e a importação CSV
continua aceitando o campo com a mesma regra de validação.

O modelo CSV de importação também contém `printsPlace` e `isActiveProduct`.
O painel introdutório informa os valores aceitos e oferece os downloads
`referencia-locais-de-impressao.md` e `referencia-status-produtos.md`.
Na importação, `NÃO IMPRIMIR` também pode ser informado como `NAO IMPRIMIR`;
o servidor normaliza a gravação para o valor oficial.

O modelo CSV também inclui `descriptionPhysicalState`, obrigatório para
matérias-primas. A tela consulta `GET /api/physical-states`, aceita ID, nome,
código ou descrição do estado físico ativo e oferece o download
`referencia-estados-fisicos.md`. A API converte o valor para
`idPhysicalStateProduct` e grava `NULL` para tipos que não usam estado físico.
A preparação do schema não deve converter produtos entre tipos; em especial,
Mercadoria para Revenda deve continuar com seu tipo e operação fiscal
informados no cadastro ou na importação.
A inicialização do frontend exibe a tela de login imediatamente. A navegação e
o ícone são carregados em segundo plano e devem estar prontos antes de mostrar
o ambiente após a autenticação, evitando uma janela vazia durante o startup.
A leitura da configuração offline ocorre depois da montagem do login e atualiza
o campo de endereço da API sem bloquear a primeira tela. A janela Tauri usa o
mesmo fundo claro da autenticação durante o carregamento do WebView.
A janela nativa permanece visível no desenvolvimento, com maximização e fundo
claro configurados no Tauri; não usar `visible: false` sem uma rotina nativa
garantida para exibi-la depois.
A navegação do construtor deve repassar handlers próprios para Fornecedores,
Clientes e Consumidores. A preparação do schema deve localizar Fornecedores
somente no menu Cadastros e no nível principal. A barra de Formas de pagamento
exibe apenas o destino da tela, sem o link-pai Financeiros.
Na tela de Backup e restauração, `api-status` deve usar `onApiStatus`;
`onTools` é reservado para retornar ao próprio fluxo de ferramentas e não pode
ser usado como alias de Status da API.
O construtor de menus deve renderizar cada item pai seguido de suas barras
contextuais e só então o próximo irmão; divisores visuais respeitam a ordem
persistida e não podem ser movidos para antes dos filhos. A preparação do
schema não deve reordenar automaticamente itens irmãos de Produtos.
O SKU da importação permanece obrigatório e único, sem exigir prefixos como
`MP-`, `EMB-` ou `PROD-`. Depois de um erro, **Testar arquivo** pode ser
executado novamente, a seleção anterior é descartada e **Selecionar arquivo**
permite escolher outro CSV, enquanto **Importar arquivo** fica bloqueado até
uma validação bem-sucedida.

No fechamento de uma venda, `src/server/sale-service.js` lê
`controlsStockProduct` de cada produto antes de validar disponibilidade ou
executar a baixa. Produtos com esse campo desativado permanecem sem baixa de
estoque, embora venda, itens e pagamentos sejam persistidos normalmente.

Na rota padrão `GET /api/products`, usada pela Frente de Caixa, a API consulta
`allowNegativeStock` antes de aplicar disponibilidade: quando a configuração é
verdadeira, produtos com estoque zero ou negativo não são ocultados; quando é
falsa, produtos controlados só aparecem com estoque positivo. Produtos sem
controle de estoque permanecem visíveis, e `includeInactive=1` preserva o
catálogo administrativo completo.

### Versão e continuidade — 2026-11-03

As alterações acumuladas em 2 e 3 de novembro foram classificadas como
incremento compatível de funcionalidade e usaram a versão **0.9.0**. A etapa
seguinte, de persistência confiável do Construtor de navegação, foi classificada
como incremento compatível e versionada como **0.10.0**. O conjunto
inclui operadores/sessões, caixa, cancelamento auditado, NFC-e em homologação,
`printsPlace`, importação de Status e Estado Físico, além das regras de
disponibilidade/baixa de estoque.

A documentação canônica foi atualizada em `docs/CHANGELOG.md`,
`docs/PROJECT-HISTORY.md` e `docs/DEVELOPMENT.md`. A validação final registrada
é de 99 testes aprovados, `node --check` e `git diff --check`. A API publicada
foi reiniciada pelo operador e o serviço `PDV-API` está em execução; os bundles
do cliente também foram gerados. A chamada sem o token compartilhado foi
rejeitada com HTTP 401 e `Autenticação obrigatória.`, confirmando que a
proteção da API permanece ativa. A validação autenticada de banco ainda depende
do token configurado no ambiente operacional e não deve registrar ou expor esse
segredo. O build oficial posterior do frontend ficou bloqueado por `EPERM`
porque o aplicativo instalado mantém `dist\releases` em uso; uma compilação
Vite em diretório alternativo foi concluída com sucesso. Feche o aplicativo
instalado antes de gerar o bundle oficial novamente.
