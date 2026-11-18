# Plano técnico: balizadores de margem de lucro

**Status:** confirmado na entrevista; implementação concluída

## Ordem de implementação

1. Criar a migration idempotente em `src/server/schema-manager.js` e refletir
   o schema inicial em `database/schema.sql`.
2. Adicionar persistência separada para margem mínima e margem alvo por Grupo
   e auditoria de preço.
3. Implementar resolução server-side por Grupo para mínimo, alvo e origem
   efetiva. Não usar Geral ou override próprio de Produto no modelo vigente.
4. Implementar cálculos compartilhados em `src/shared` para Margem Bruta,
   Markup, Lucro Unitário, CMV e preço sugerido, incluindo zero de custo/preço
   e precisão interna.
5. Criar endpoints de leitura da listagem e dos balizadores efetivos, com
   busca por nome ou `#PDV`, filtro de Grupo e filtros OU por cores.
6. Criar tela de listagem de Produtos limitada a ativos e aos tipos Mercadoria
   para Revenda e Produto Acabado, com badge somente na célula Margem Bruta.
7. Criar View de simulação de CMV com Novo CMV editável de 0% a 100%, cálculo
   em memória e ação protegida de atualização de `priceProduct`.
8. Criar endpoint individual de atualização que compare o preço atual, confirme
   autorização, persista o novo preço e registre auditoria na mesma transação.
9. Restaurar o preço visual anterior e mostrar erro explícito em qualquer falha
   da API; mudanças externas devem bloquear a ação e solicitar recarga.
10. Atualizar documentação operacional e testes de unidade e integração.

## Contratos a validar

- Custo zero: `Sem custo`.
- Preço zero: `Sem preço`.
- Divisores percentuais zero: resultado indisponível.
- Lucro Unitário continua disponível pela diferença quando custo e preço forem
  válidos.
- Cálculos internos usam precisão completa; exibição usa duas casas.
- Alertas comparam valores internos, não valores arredondados.
- Margem mínima abaixo da Margem Bruta colore Vermelho.
- Entre mínimo e alvo colore Amarelo.
- Igual ou acima do alvo colore Verde.
- Pesquisa e Grupo usam E; os filtros de cores usam OU.

## Testes mínimos

- Unidade: resolução efetiva somente pelo Grupo.
- Unidade: as quatro métricas, arredondamento e divisores zero.
- Unidade: preço sugerido pela Margem Bruta alvo e pelo Novo CMV.
- Unidade: combinação dos filtros de busca, Grupo e cores.
- Integração: nenhum preço é alterado ao atualizar Geral ou Grupo.
- Integração: concorrência detecta preço externo alterado.
- Integração: operador não atualiza preço; supervisor/administrador atualiza.
- Integração: auditoria registra produto, preço anterior, preço novo, CMV novo,
  operador e data/hora.
- Integração: `priceProduct` permanece inalterado até confirmação explícita.

## Operação

Alterações em `src/server/`, `src/server/schema-manager.js` ou
`database/schema.sql` exigirão reinício da API publicada para aplicar migrações
idempotentes. Alterações somente frontend não exigirão reinício da API.
