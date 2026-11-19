# Plano técnico: migração da API nativa para Express

**Status:** proposta documentada; implementação não iniciada

## Objetivo

Migrar o servidor HTTP do PDV de `node:http` para Express sem alterar contratos,
comportamentos de autorização, transações MariaDB ou fluxo das vendas.

A migração não é necessária para o funcionamento atual e não deve ser feita
como substituição automática de dependências ou como pré-requisito para novos
recursos. Express pode simplificar a organização da API e viabilizar adapters
como o middleware de logs do evlog, mas a decisão depende da confirmação dos
benefícios reais da implementação incremental.

## Escopo inicial

1. Inventariar todas as rotas de `src/server/server.js`, incluindo métodos,
   parâmetros de URL, query strings, autenticação e respostas.
2. Registrar os contratos externos usados pelos clientes Tauri, especialmente
   códigos HTTP, formatos JSON, cabeçalhos CORS e erro.
3. Identificar helpers compartilhados que podem continuar independentes:
   leitura de JSON, CORS, autenticação de operador, autorização por papel,
   transações MariaDB e serviços de domínio.
4. Escolher a estratégia de conversão: uma única alteração completa ou migração
   incremental por módulo de domínio.
5. Definir limites claros entre framework, validação HTTP e regras de domínio.

## Estrutura proposta

O servidor Express deverá manter o fluxo obrigatório:

```text
interface → API → validação → transação MariaDB → nova leitura → interface
```

Antes da migração, preparar separação suficiente para que os handlers Express
apenas:

- parseiem parâmetros e corpo;
- apliquem autenticação e autorização;
- chamem serviços existentes;
- devolvam respostas padronizadas;
- preservem rollback, commit e nova leitura em operações compostas.

As regras de venda, caixa, estoque, margem e receitas devem continuar nos
serviços e módulos compartilhados, não dentro de middlewares genéricos.

## Ordem de implementação

1. Adicionar Express ao pacote e criar um servidor Express mínimo a partir do
   estado atual.
2. Criar middleware equivalente para CORS, origem permitida, JSON e erros.
3. Criar middleware de autenticação e reconstruir a sessão do operador pelo
   cabeçalho `X-Operator-Session`.
4. Migrar primeiro uma rota pequena e sem escrita composta, por exemplo
   `/api/health`, para provar o servidor em execução.
5. Migrar rotas agrupadas por domínio e manter aliases do nativo até que cada
   grupo seja validado.
6. Substituir condições de método e URL por `router.get`, `router.post`,
   `router.put` e `router.delete`.
7. Extrair handlers por arquivo somente após estabilizar os grupos; não separar
   toda a API em uma tarefa que não possa ser revertida por domínio.
8. Adicionar middleware central para wide events HTTP com `requestId`, método,
   rota, duração, status e erro classificado.
9. Centralizar redaction de campos sensíveis antes de gravar ou exportar logs.
10. Remover o adaptador nativo somente após equivalência funcional e
    operacional comprovada.

## Contratos a validar

- Métodos, URLs exatas e parâmetros continuam compatíveis.
- Respostas preservam status, JSON, cabeçalhos CORS e mensagens existentes.
- Login, logout e sessão continuam com os mesmos comportamentos.
- Autorização por operador e papel continua server-side.
- `OPTIONS` continua rejeitando origens não autorizadas.
- Corpos inválidos ou grandes retornam falhas explícitas.
- Erros 4xx não aparecem como sucesso.
- Erros 5xx não expõem payload, credencial ou dado desnecessário.
- As transações compostas continuam atômicas e fazem rollback em falhas.
- Vendas confirmam itens, pagamentos e baixa de estoque na mesma transação.
- Backup, restauração, impressão e integração fiscal permanecem independentes
  da infraestrutura HTTP.

## Testes mínimos

- Unidade: middlewares de CORS, autenticação, autorização e redaction.
- Unidade: resolução de parâmetros, query strings e erros HTTP.
- Integração: login, sessão, logout e rejeição de origem.
- Integração: amostras de leitura e escrita de cada domínio migrado.
- Integração: venda completa com estoque, pagamentos e nova leitura.
- Integração: falha em etapa composta causa rollback e não altera a interface
  para sucesso.
- Contrato: cliente Tauri usa todos os endpoints migrados sem alterar payload.
- Operação: o servidor Express inicia com o mesmo script de configuração local.

Os testes devem cobrir os endpoints migrados antes da remoção do encaminhamento
nativo. Não criar uma suíte ampla para uma alteração puramente estrutural sem
antes provar contratos críticos.

## Registro e observabilidade

Express não substitui o sistema atual de logs. Primeiro migrar o transporte
HTTP e preservá-lo, depois avaliar o adapter do evlog.

O wide event deve usar allowlist ou redaction explícita. Não registrar:

- senha ou token;
- credenciais do banco;
- payload completo;
- dados pessoais desnecessários;
- dados de pagamento;
- chaves fiscais ou cookies de sessão.

Os campos mínimos recomendados são: `requestId`, `method`, `route`, `status`,
`durationMs`, `operatorId`, `errorCode` e `success`.

## Operação e rollback

A implementação poderá exigir reinício da API publicada para carregar Express
e os novos middlewares. A escolha do servidor deve ser ativada por uma troca
controlada ou por migração concluída por domínio; não deve haver duas
implementações conflitantes na mesma rota.

Antes da troca:

- manter backup funcional da API anterior;
- validar scripts de instalação e publicação local;
- validar os endpoints críticos em ambiente de teste;
- preservar a porta e o endereço usados pelos terminais;
- registrar como reverter para a implementação nativa em caso de falha.

Alterações apenas de frontend não exigem reinício da API. Alterações no servidor
Express ou em seus scripts de instalação exigirão reinício da API.

## Critério de conclusão

A migração só deve ser considerada concluída quando todas as rotas estiverem
migradas, os contratos externos forem equivalentes, vendas e caixa tiverem
passado pelos testes críticos, logs não tiverem vazamento sensível e o servidor
nativo puder ser removido sem break no Tauri ou na API local.
